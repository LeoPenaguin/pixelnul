// Board engine: camera, animations, mouse / wheel / minimap input, Canvas2D rendering.
// Independent of Svelte: App.svelte only wires it up.
import type { Config } from '../api'
import {
  HOME,
  clampCam,
  clampPixel,
  chunkRange,
  clampZoom,
  ease,
  flightStart,
  inWorld,
  interpolate,
  keepVisible,
  rectFrom,
  toWorld,
  zoomAround,
  type Cam,
  type Point,
  type Rect,
} from './camera'
import { context2d } from './canvas'
import { Chunks } from './chunks'
import { MINIMAP_SPAN, smoothSpan, stepSpan } from './minimap'
import type { Picture } from '../stamp'

const DRAG_THRESHOLD = 4 // px: below this, it is a click
const GHOST_ALPHA = 0.7 // the sticker about to be pasted, over the board
// Lines every pixel, every 10 and every 100, darker as they get rarer: once the pixel lines are too dense,
// the others still tell where you are. Only the two finest that fit are drawn: three is too busy.
// min: CSS px between two lines, below which the level is not drawn (landmarks need more room than pixels).
const GRID_LEVELS = [
  { step: 1, min: 6, color: 'rgba(0,0,0,0.05)' },
  { step: 10, min: 16, color: 'rgba(0,0,0,0.08)' },
  { step: 100, min: 16, color: 'rgba(0,0,0,0.12)' },
]
const ANIM_MS = 450
const TARGET_MS = 2500 // highlight duration after a jump
const BACKGROUND = '#e5e5e5' // outside the world; same as the page background in app.css (no flash on load)
const SELECTION = 'rgba(0,0,0,0.3)' // zones to paint over: darkened, so that any colour shows through

// The UI stays monochrome: only the board is in colour. A black outline doubled with white
// stays readable on any pixel, black included.
function outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, width: number, radius = 0) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.lineWidth = width * 2
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.lineWidth = width
  ctx.strokeStyle = '#000'
  ctx.stroke()
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export class World {
  cam: Cam = { ...HOME }
  /** Pixel under the mouse or targeted by the keyboard cursor. */
  hover: Point | null = null
  showGrid = true
  onHover: (p: Point | null) => void = () => undefined
  onPlace: (x: number, y: number) => void = () => undefined
  /** Pixel at the screen centre, on every frame. */
  onView: (center: Point) => void = () => undefined
  /** Moderation: a drag or two clicks (or Enter on two pixels) draw zones, instead of panning and painting. */
  selecting = false
  rects: Rect[] = []
  private ghost: OffscreenCanvas | null = null
  corner: Point | null = null // first corner of a zone drawn by clicks
  /** The zones or the pending corner changed. */
  onSelect: () => void = () => undefined

  private ctx: CanvasRenderingContext2D
  private board: Chunks
  private frame = 0
  private anim: { from: Cam; to: Cam; t0: number; done?: () => void } | null = null
  private target: Point | null = null // jump target, briefly highlighted
  private targetTimer: ReturnType<typeof setTimeout> | undefined
  private drag: {
    id: number
    sx: number
    sy: number
    lx: number
    ly: number
    moved: boolean
    from: Point | null // start pixel of a zone being drawn; null: the drag pans
  } | null = null
  private sketch: Rect | null = null // zone being dragged
  private minimap?: HTMLCanvasElement
  private mini = { x0: 0, y0: 0, span: MINIMAP_SPAN[0] as number } // world area shown by the minimap
  private miniTarget: number = MINIMAP_SPAN[0] // target step; `mini.span` glides towards it
  private half: Point // half the world size (see camera.ts)
  private canPaint = true // false: no pixel left, or offline

  constructor(
    private canvas: HTMLCanvasElement,
    private cfg: Config,
  ) {
    this.ctx = context2d(canvas)
    this.half = { x: cfg.worldWidth / 2, y: cfg.worldHeight / 2 }
    this.board = new Chunks(cfg, this.redraw)
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.move)
    canvas.addEventListener('pointerup', this.up)
    canvas.addEventListener('pointerleave', this.leave)
    canvas.addEventListener('wheel', this.wheel, { passive: false })
    new ResizeObserver(this.redraw).observe(canvas)
  }

  private get vp() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight }
  }

  /** Screen coordinates (CSS px) → world coordinates. */
  toWorld(sx: number, sy: number) {
    return toWorld(this.cam, this.vp, sx, sy)
  }

  /** Sets the camera without animation (clamped to the world and allowed zooms). */
  setCam(cam: Cam) {
    this.stopAnim()
    this.cam = clampCam({ ...cam, zoom: clampZoom(cam.zoom) }, this.half)
    this.redraw()
  }

  setPixel(x: number, y: number, c: number) {
    this.board.setPixel(x, y, c)
  }

  /** Reloads every chunk (after a reconnection, pixels may have been missed). */
  reload() {
    this.board.clear()
  }

  setGrid(on: boolean) {
    this.showGrid = on
    this.redraw()
  }

  /** Animates back to 0, 0 at the default zoom. */
  recenter() {
    this.clearTarget()
    this.animateTo({ ...HOME })
  }

  /** Animates to a pixel, then briefly highlights it. */
  jumpTo(x: number, y: number) {
    this.clearTarget()
    const p = clampPixel({ x, y }, this.half)
    const zoom = Math.max((this.anim?.to ?? this.cam).zoom, HOME.zoom)
    this.animateTo({ x: p.x + 0.5, y: p.y + 0.5, zoom }, () => {
      this.target = { x: p.x, y: p.y }
      this.targetTimer = setTimeout(() => this.clearTarget(), TARGET_MS)
    })
  }

  /** Animated zoom around the centre (buttons, keyboard). Rapid presses add up. */
  zoomBy(factor: number) {
    const base = this.anim?.to ?? this.cam
    this.animateTo({ ...base, zoom: clampZoom(base.zoom * factor) }, this.anim?.done)
  }

  /** Keyboard cursor: targets a pixel and moves the view just enough to keep it visible. */
  setCursor(x: number, y: number): Point {
    const p = clampPixel({ x, y }, this.half)
    this.stopAnim()
    this.clearTarget()
    this.hover = { x: p.x, y: p.y }
    this.cam = clampCam(keepVisible(this.cam, this.vp, this.hover), this.half)
    this.redraw()
    return this.hover
  }

  /** Enters or leaves the selection mode, with no zone. */
  setSelecting(on: boolean) {
    this.selecting = on
    this.setRects([])
    this.updateCursor()
  }

  /** Replaces the zones and drops the pending corner. */
  setRects(rects: Rect[]) {
    this.rects = rects
    this.corner = null
    this.onSelect()
    this.redraw()
  }

  /** Selection: the first corner waits, the second one closes a zone. */
  mark(p: Point) {
    if (this.corner) {
      this.setRects([...this.rects, rectFrom(this.corner, p)])
      return
    }
    this.corner = p
    this.onSelect()
    this.redraw()
  }

  /** Moderation: the sticker a click pastes, drawn centred on the targeted pixel; null: none. */
  setGhost(p: Picture | null) {
    this.ghost = null
    if (p) {
      const c = new OffscreenCanvas(p.width, p.height)
      context2d(c).putImageData(new ImageData(p.data, p.width, p.height), 0, 0)
      this.ghost = c
    }
    this.redraw()
  }

  /** Whether a click can paint right now: shown by the cursor. */
  setCanPaint(v: boolean) {
    this.canPaint = v
    this.updateCursor()
  }

  /** Attaches the minimap: it follows the camera; dragging in it pans the view, clicking animates there. */
  setMinimap(m: HTMLCanvasElement) {
    this.minimap = m
    // Relative to the gesture (not absolute): the minimap moves with the view without running away.
    let last: { x: number; y: number; moved: boolean } | null = null
    m.addEventListener('pointerdown', (e) => {
      m.setPointerCapture(e.pointerId)
      this.stopAnim()
      last = { x: e.clientX, y: e.clientY, moved: false }
    })
    m.addEventListener('pointermove', (e) => {
      if (!last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      if (!last.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      last = { x: e.clientX, y: e.clientY, moved: true }
      m.style.cursor = 'grabbing'
      const k = this.mini.span / m.clientWidth
      this.clearTarget()
      this.cam = clampCam({ ...this.cam, x: this.cam.x + dx * k, y: this.cam.y + dy * k }, this.half)
      this.redraw()
    })
    m.addEventListener('pointerup', (e) => {
      if (last && !last.moved) {
        const { x0, y0, span } = this.mini
        this.animateTo({
          x: x0 + (e.offsetX / m.clientWidth) * span,
          y: y0 + (e.offsetY / m.clientHeight) * span,
          zoom: this.cam.zoom,
        })
      }
      last = null
      m.style.cursor = ''
    })
    this.redraw()
  }

  /** Immediate zoom around a screen point (wheel, pinch: already continuous). */
  zoomAt(factor: number, sx: number, sy: number) {
    this.stopAnim()
    this.cam = clampCam(zoomAround(this.cam, factor, this.vp, sx, sy), this.half)
    this.redraw()
  }

  /** Requests a render on the next frame (several requests = one render). */
  redraw = () => {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw)
  }

  private animateTo(to: Cam, done?: () => void) {
    if (reducedMotion()) {
      this.anim = null
      this.cam = to
      this.redraw()
      done?.()
      return
    }
    this.cam = flightStart(this.cam, to, this.vp)
    this.anim = { from: { ...this.cam }, to, t0: performance.now(), done }
    this.redraw()
  }

  private stopAnim() {
    this.anim = null
  }

  private clearTarget() {
    clearTimeout(this.targetTimer)
    if (this.target) {
      this.target = null
      this.redraw()
    }
  }

  /** Advances the running animation by one step. */
  private stepAnim() {
    const a = this.anim
    if (!a) return
    const t = Math.min(1, (performance.now() - a.t0) / ANIM_MS)
    this.cam = interpolate(a.from, a.to, ease(t))
    if (t < 1) {
      this.redraw()
      return
    }
    this.anim = null
    a.done?.()
  }

  private draw = () => {
    this.frame = 0
    this.stepAnim()
    const { canvas, ctx, cam } = this
    const dpr = devicePixelRatio
    const { w, h } = this.vp
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const z = cam.zoom * dpr
    ctx.setTransform(z, 0, 0, z, (w / 2 - cam.x * cam.zoom) * dpr, (h / 2 - cam.y * cam.zoom) * dpr)
    ctx.imageSmoothingEnabled = false
    const tl = this.toWorld(0, 0)
    const br = this.toWorld(w, h)
    this.drawChunks(ctx, tl, br)

    if (this.showGrid) {
      ctx.lineWidth = 1 / cam.zoom
      // Only inside the world: the area around it stays plain.
      const { half } = this
      const [x0, x1] = [Math.max(tl.x, -half.x), Math.min(br.x, half.x)]
      const [y0, y1] = [Math.max(tl.y, -half.y), Math.min(br.y, half.y)]
      for (const { step, color } of GRID_LEVELS.filter((l) => l.step * cam.zoom >= l.min).slice(0, 2)) {
        ctx.strokeStyle = color
        ctx.beginPath()
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
          ctx.moveTo(x, y0)
          ctx.lineTo(x, y1)
        }
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
          ctx.moveTo(x0, y)
          ctx.lineTo(x1, y)
        }
        ctx.stroke()
      }
    }
    for (const r of this.sketch ? [...this.rects, this.sketch] : this.rects) {
      const [rw, rh] = [r.x1 - r.x0 + 1, r.y1 - r.y0 + 1]
      ctx.fillStyle = SELECTION
      ctx.fillRect(r.x0, r.y0, rw, rh)
      outline(ctx, r.x0, r.y0, rw, rh, 2 / cam.zoom)
    }
    if (this.corner) outline(ctx, this.corner.x, this.corner.y, 1, 1, 4 / cam.zoom)
    if (this.hover && this.ghost) {
      ctx.globalAlpha = GHOST_ALPHA
      ctx.drawImage(this.ghost, this.hover.x - (this.ghost.width >> 1), this.hover.y - (this.ghost.height >> 1))
      ctx.globalAlpha = 1
    }
    if (this.hover) outline(ctx, this.hover.x, this.hover.y, 1, 1, 2 / cam.zoom)
    // Rounded like the panels (8 CSS px), at most a circle when zoomed out.
    if (this.target)
      outline(ctx, this.target.x - 0.5, this.target.y - 0.5, 2, 2, 3 / cam.zoom, Math.min(8 / cam.zoom, 1))

    this.drawMinimap(tl, br)
    this.onView({ x: Math.floor(cam.x), y: Math.floor(cam.y) })
  }

  /** Draws the ready chunks covering area [a, b] (world coordinates) and loads the others.
   *  Border chunks stick out of the world: drawing is clipped to it. */
  private drawChunks(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
    const S = this.cfg.chunkSize
    const { half } = this
    ctx.save()
    ctx.beginPath()
    ctx.rect(-half.x, -half.y, 2 * half.x, 2 * half.y)
    ctx.clip()
    const range = (lo: number, hi: number, h: number) => {
      const [first, last] = chunkRange(h, S)
      return [Math.max(Math.floor(lo / S), first), Math.min(Math.floor(hi / S), last)]
    }
    const [cx0, cx1] = range(a.x, b.x, half.x)
    const [cy0, cy1] = range(a.y, b.y, half.y)
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.board.get(cx, cy)
        if (c) ctx.drawImage(c, cx * S, cy * S)
      }
    }
    ctx.restore()
  }

  /** Overview centred on the camera; the rectangle shows what is visible. */
  private drawMinimap(tl: Point, br: Point) {
    const m = this.minimap
    if (!m) return
    const dpr = devicePixelRatio
    const size = m.clientWidth * dpr
    if (m.width !== size) m.width = m.height = size
    const mctx = context2d(m)

    this.miniTarget = stepSpan(this.miniTarget, Math.max(br.x - tl.x, br.y - tl.y))
    const span = smoothSpan(this.mini.span, this.miniTarget)
    if (span !== this.miniTarget) this.redraw() // transition in progress
    const x0 = this.cam.x - span / 2
    const y0 = this.cam.y - span / 2
    this.mini = { x0, y0, span }
    const k = size / span

    mctx.setTransform(1, 0, 0, 1, 0, 0)
    mctx.fillStyle = BACKGROUND
    mctx.fillRect(0, 0, size, size)
    mctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k)
    mctx.imageSmoothingEnabled = true
    this.drawChunks(mctx, { x: x0, y: y0 }, { x: x0 + span, y: y0 + span })
    outline(mctx, tl.x, tl.y, br.x - tl.x, br.y - tl.y, (2 * dpr) / k)
  }

  /** Pixel under a pointer event (possibly outside the world). */
  private cellAt(e: PointerEvent): Point {
    const p = this.toWorld(e.offsetX, e.offsetY)
    return { x: Math.floor(p.x), y: Math.floor(p.y) }
  }

  private updateHover(e: PointerEvent) {
    const cell = this.cellAt(e)
    const next = inWorld(cell, this.half) ? cell : null
    const h = this.hover
    if (h === next || (next && h?.x === next.x && h.y === next.y)) return
    this.hover = next
    this.onHover(next)
    this.redraw()
  }

  private down = (e: PointerEvent) => {
    if (this.drag) return
    this.canvas.setPointerCapture(e.pointerId)
    // Selecting: the main button draws, the others still pan.
    const from = this.selecting && e.button === 0 ? clampPixel(this.cellAt(e), this.half) : null
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, from }
  }

  private move = (e: PointerEvent) => {
    const d = this.drag
    if (d?.id === e.pointerId) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > DRAG_THRESHOLD) d.moved = true
      if (d.moved && d.from) {
        this.sketch = rectFrom(d.from, clampPixel(this.cellAt(e), this.half))
        this.redraw()
      } else if (d.moved) {
        this.stopAnim()
        this.clearTarget()
        const { x, y, zoom } = this.cam
        this.cam = clampCam({ x: x - (e.clientX - d.lx) / zoom, y: y - (e.clientY - d.ly) / zoom, zoom }, this.half)
        this.redraw()
      }
      d.lx = e.clientX
      d.ly = e.clientY
    }
    this.updateHover(e)
    this.updateCursor()
  }

  // The cursor says what the pointer would do: crosshair (CSS) = a click paints, grab = outside
  // the world (dragging is all there is), not-allowed = a click paints nothing.
  private updateCursor() {
    const { style } = this.canvas
    if (this.selecting)
      style.cursor = '' // crosshair: a drag draws a zone
    else if (this.drag?.moved) style.cursor = 'grabbing'
    else if (!this.hover) style.cursor = 'grab'
    else style.cursor = this.canPaint ? '' : 'not-allowed'
  }

  private up = (e: PointerEvent) => {
    const d = this.drag
    if (d?.id !== e.pointerId) return
    this.drag = null
    this.updateCursor()
    if (this.sketch) {
      const zone = this.sketch
      this.sketch = null
      this.setRects([...this.rects, zone])
    } else if (!d.moved && e.button === 0) {
      const cell = this.cellAt(e)
      if (!inWorld(cell, this.half)) return
      if (this.selecting) this.mark(cell)
      else this.onPlace(cell.x, cell.y)
    }
  }

  private leave = () => {
    if (this.drag) return
    this.hover = null
    this.onHover(null)
    this.redraw()
  }

  // Like Figma: wheel / two fingers = pan, Ctrl + wheel or pinch = zoom.
  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    // Some mice count in lines or pages; one wheel notch is ~100 px.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vp.h : 1
    if (e.ctrlKey || e.metaKey) {
      // Clamped per event: one wheel notch = ×1.5 at most, trackpad pinch stays fine-grained.
      const d = Math.max(-40, Math.min(40, e.deltaY * unit))
      this.zoomAt(Math.exp(-d * 0.01), e.offsetX, e.offsetY)
      return
    }
    this.stopAnim()
    const { x, y, zoom } = this.cam
    this.cam = clampCam({ x: x + (e.deltaX * unit) / zoom, y: y + (e.deltaY * unit) / zoom, zoom }, this.half)
    this.redraw()
  }
}
