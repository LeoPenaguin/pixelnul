// Whole-board image, built in the browser from the chunks, and saved as a file.
import type { Config } from './api'
import { packColors } from './colors'
import { chunkRange } from './engine/camera'
import { context2d } from './engine/canvas'
import { decodeChunk } from './engine/chunks'

// ponytail: ×4 = 5120 × 2880, near Safari's canvas limit (16.7 Mpx); a bigger world or scale needs tiled encoding.
export const IMAGE_SCALES = [1, 2, 3, 4]

/** PNG of the board: lossless, so every pixel stays sharp. One board pixel = scale × scale image pixels.
 *  Rejects if a chunk cannot be loaded (no partial image). */
export async function boardImage(cfg: Config, scale = 1): Promise<Blob> {
  const { chunkSize: S, worldWidth: W, worldHeight: H } = cfg
  const palette = packColors(cfg.palette.flat())
  const canvas = new OffscreenCanvas(W, H)
  const ctx = context2d(canvas)
  const range = (half: number) => {
    const [first, last] = chunkRange(half, S)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }
  const jobs = range(H / 2).flatMap((cy) =>
    range(W / 2).map(async (cx) => {
      const res = await fetch(`/api/chunks/${String(cx)}/${String(cy)}`)
      if (!res.ok) throw new Error(`chunk ${String(cx)}:${String(cy)} : ${String(res.status)}`)
      // putImageData clips the border chunks to the world.
      ctx.putImageData(decodeChunk(new Uint8Array(await res.arrayBuffer()), palette, S), cx * S + W / 2, cy * S + H / 2)
    }),
  )
  await Promise.all(jobs)
  const out = new OffscreenCanvas(W * scale, H * scale)
  const outCtx = context2d(out)
  outCtx.imageSmoothingEnabled = false // square pixels, not blurred ones
  outCtx.drawImage(canvas, 0, 0, W * scale, H * scale)
  return out.convertToBlob({ type: 'image/png' })
}

/** Downloads the board image, named after today's date. */
export async function downloadBoard(cfg: Config, scale: number, now = new Date()) {
  const blob = await boardImage(cfg, scale)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `pixels-${now.toISOString().slice(0, 10)}.png`
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
  }, 1000) // after the browser has started the download
}
