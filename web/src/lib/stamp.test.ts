import { describe, expect, it } from 'vitest'
import { readImage, toBlocks } from './stamp'

const PALETTE = ['#FFFFFF', '#000000', '#E52521']

/** A width × height picture from rows of characters: '.' transparent, 'w' white, 'k' black, 'r' reddish. */
function picture(rows: string[]) {
  const rgba: Record<string, number[]> = {
    '.': [0, 0, 0, 0],
    w: [250, 250, 250, 255],
    k: [10, 10, 10, 255],
    r: [200, 50, 40, 255],
  }
  return {
    data: Uint8ClampedArray.from(
      rows
        .join('')
        .split('')
        .flatMap((ch) => rgba[ch]),
    ),
    width: rows[0].length,
    height: rows.length,
  }
}

describe('toBlocks', () => {
  it('maps each pixel to the nearest palette colour and merges runs along a row', () => {
    expect(toBlocks(picture(['kkrw']), PALETTE)).toEqual([
      { x0: 0, y0: 0, x1: 1, y1: 0, c: 1 },
      { x0: 2, y0: 0, x1: 2, y1: 0, c: 2 },
      { x0: 3, y0: 0, x1: 3, y1: 0, c: 0 },
    ])
  })

  it('stacks identical runs of consecutive rows into one rectangle', () => {
    expect(toBlocks(picture(['kk.', 'kk.', 'kkk']), PALETTE)).toEqual([
      { x0: 0, y0: 0, x1: 1, y1: 1, c: 1 },
      { x0: 0, y0: 2, x1: 2, y1: 2, c: 1 },
    ])
  })

  it('leaves transparent pixels out', () => {
    expect(toBlocks(picture(['k.k', '...']), PALETTE)).toEqual([
      { x0: 0, y0: 0, x1: 0, y1: 0, c: 1 },
      { x0: 2, y0: 0, x1: 2, y1: 0, c: 1 },
    ])
  })
})

describe('readImage', () => {
  it('decodes an image file into its pixels', async () => {
    const canvas = new OffscreenCanvas(2, 1)
    const ctx = canvas.getContext('2d')
    ctx!.fillStyle = '#E52521'
    ctx!.fillRect(1, 0, 1, 1)
    const img = await readImage(await canvas.convertToBlob())
    expect([img.width, img.height]).toEqual([2, 1])
    expect([...img.data]).toEqual([0, 0, 0, 0, 229, 37, 33, 255])
  })

  it('rejects a file that is not an image', async () => {
    await expect(readImage(new Blob(['nope']))).rejects.toThrow()
  })
})
