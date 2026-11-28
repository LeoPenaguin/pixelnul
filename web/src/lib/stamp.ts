// Moderation: an image laid on the board, as rectangles for the admin fill.

import { hexToRgb } from './colors'
import { context2d } from './engine/canvas'

export type Picture = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }
export type Block = { x0: number; y0: number; x1: number; y1: number; c: number } // corners included

/** Decodes an image file (rejects when it is not one). */
export async function readImage(file: Blob): Promise<Picture> {
  const bitmap = await createImageBitmap(file)
  const ctx = context2d(new OffscreenCanvas(bitmap.width, bitmap.height))
  ctx.drawImage(bitmap, 0, 0)
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
}

/** The image's opaque pixels, relative to its top-left corner, in the nearest palette colour, grouped into
 *  rectangles: runs of one colour along a row, stacked when the next row repeats them. Transparent pixels are
 *  left out: the board shows through. */
export function toBlocks(img: Picture, palette: string[]): Block[] {
  const pal = palette.map(hexToRgb)
  const nearest = (i: number) => {
    let best = 0
    let dist = Infinity
    pal.forEach(([r, g, b], c) => {
      const d = (img.data[i] - r) ** 2 + (img.data[i + 1] - g) ** 2 + (img.data[i + 2] - b) ** 2
      if (d < dist) [best, dist] = [c, d]
    })
    return best
  }
  const blocks: Block[] = []
  let open = new Map<string, Block>() // the previous row's runs, by x0, x1, c: the next row may extend them
  for (let y = 0; y < img.height; y++) {
    const row: Block[] = []
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (img.data[i + 3] < 128) continue
      const c = nearest(i)
      const last = row.at(-1)
      if (last?.x1 === x - 1 && last.c === c) last.x1 = x
      else row.push({ x0: x, y0: y, x1: x, y1: y, c })
    }
    const next = new Map<string, Block>()
    for (const r of row) {
      const key = `${String(r.x0)},${String(r.x1)},${String(r.c)}`
      const above = open.get(key)
      if (above) above.y1 = y
      else blocks.push(r)
      next.set(key, above ?? r)
    }
    open = next
  }
  return blocks
}
