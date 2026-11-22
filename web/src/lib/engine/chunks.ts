// Chunk cache: loading from the server, decoding to images, live pixels.
import type { Config } from '../api'
import { packColors } from '../colors'
import { context2d } from './canvas'

/** Server bytes (1 byte = colour index) → image. Missing or unknown bytes = colour 0.
 *  `palette`: from packColors, one 32-bit write per pixel. */
export function decodeChunk(bytes: Uint8Array, palette: Uint32Array, size: number): ImageData {
  const img = new ImageData(size, size)
  const px = new Uint32Array(img.data.buffer)
  px.fill(palette[0])
  const n = Math.min(bytes.length, px.length)
  for (let i = 0; i < n; i++) if (bytes[i] < palette.length) px[i] = palette[bytes[i]]
  return img
}

const MAX_CHUNKS = 400 // ~100 MB of canvas; beyond that, off-screen chunks are dropped
const RETRY_MS = 2000

type Pending = [x: number, y: number, c: number][]
type Entry = { canvas: OffscreenCanvas } | { pending: Pending }

export class Chunks {
  private entries = new Map<string, Entry>()
  private colors: string[]
  private palette: Uint32Array
  private shift: number

  /** `changed`: a chunk arrived or changed, a redraw is needed. `path` and `colors`: where the
   *  bytes come from and the colour of each byte value (default: the board and its palette). */
  constructor(
    private cfg: Config,
    private changed: () => void,
    private path = '/api/chunks/',
    colors = cfg.palette.flat(),
  ) {
    this.colors = colors
    this.palette = packColors(this.colors)
    this.shift = Math.log2(cfg.chunkSize)
  }

  get size() {
    return this.entries.size
  }

  key = (cx: number, cy: number) => `${String(cx)}:${String(cy)}`

  /** The chunk image if ready; otherwise starts loading it (once). */
  get(cx: number, cy: number): OffscreenCanvas | undefined {
    const e = this.entries.get(this.key(cx, cy))
    if (!e) void this.load(cx, cy)
    else if ('canvas' in e) return e.canvas
  }

  /** A live pixel. Chunk still loading: applied on arrival. Never requested: ignored, it will be
   *  right when loaded. */
  setPixel(x: number, y: number, c: number) {
    const e = this.entries.get(this.key(x >> this.shift, y >> this.shift))
    if (!e) return
    if ('pending' in e) return void e.pending.push([x, y, c])
    const ctx = context2d(e.canvas)
    ctx.fillStyle = this.colors[c]
    const m = this.cfg.chunkSize - 1
    ctx.fillRect(x & m, y & m, 1, 1)
    this.changed()
  }

  /** Forgets everything (e.g. after a reconnection: pixels may have been missed). */
  clear() {
    this.entries.clear()
    this.changed()
  }

  /** Too many chunks in memory: keeps only those in `keep`. */
  evict(keep: Set<string>) {
    if (this.entries.size <= MAX_CHUNKS) return
    for (const k of this.entries.keys()) if (!keep.has(k)) this.entries.delete(k)
  }

  private async load(cx: number, cy: number) {
    const k = this.key(cx, cy)
    const entry = { pending: [] as Pending }
    this.entries.set(k, entry)
    try {
      const res = await fetch(`${this.path}${String(cx)}/${String(cy)}`)
      if (!res.ok) throw new Error(res.statusText)
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (this.entries.get(k) !== entry) return // reloaded or evicted meanwhile
      const S = this.cfg.chunkSize
      const canvas = new OffscreenCanvas(S, S)
      context2d(canvas).putImageData(decodeChunk(bytes, this.palette, S), 0, 0)
      this.entries.set(k, { canvas })
      for (const [x, y, c] of entry.pending) this.setPixel(x, y, c)
      this.changed()
    } catch {
      if (this.entries.get(k) === entry) this.entries.delete(k)
      setTimeout(this.changed, RETRY_MS) // retry on the next render
    }
  }
}
