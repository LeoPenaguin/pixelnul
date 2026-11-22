import { afterEach, expect, test, vi } from 'vitest'
import { config, stubFetch } from '../test/fakes'
import { boardImage, downloadBoard } from './download'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** RGB of an image pixel. */
async function rgbAt(blob: Blob, x: number, y: number) {
  const bitmap = await createImageBitmap(blob)
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
  if (!ctx) throw new Error('no 2D context')
  ctx.drawImage(bitmap, 0, 0)
  return { size: [bitmap.width, bitmap.height], rgb: [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)] }
}

test('the image is the whole world, border chunks clipped, enlarged without blur', async () => {
  stubFetch({
    '/api/chunks/-3/-2': () => new Response(new Uint8Array(256 * 256).fill(1)), // top-left chunk: all black
    '/api/chunks/': () => new Response(new Uint8Array()), // never painted: white
  })
  const blob = await boardImage(config)
  expect(blob.type).toBe('image/png')
  // World x -640 is chunk -3 (from -768) at offset 128: the top-left image pixel is black.
  expect(await rgbAt(blob, 0, 0)).toEqual({ size: [1280, 720], rgb: [0, 0, 0] })
  expect((await rgbAt(blob, 128, 0)).rgb).toEqual([255, 255, 255]) // next chunk

  const big = await boardImage(config, 3)
  expect(await rgbAt(big, 383, 0)).toEqual({ size: [3840, 2160], rgb: [0, 0, 0] }) // last column of a 3 × 3 pixel
  expect((await rgbAt(big, 384, 0)).rgb).toEqual([255, 255, 255]) // sharp edge, no grey in between
})

test('no image when a chunk cannot be loaded', async () => {
  stubFetch({ '/api/chunks/0/0': () => new Response('', { status: 500 }), '/api/chunks/': () => new Response() })
  await expect(boardImage(config)).rejects.toThrow('chunk 0:0 : 500')
})

test('saves the image named after the date', async () => {
  stubFetch({ '/api/chunks/': () => new Response(new Uint8Array()) })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  const revoke = vi.spyOn(URL, 'revokeObjectURL')
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  await downloadBoard(config, 1, new Date('2026-11-22T10:00:00Z'))
  expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('pixels-2026-11-22.png')
  vi.runAllTimers() // the object URL is released once the download has started
  expect(revoke).toHaveBeenCalledOnce()
})
