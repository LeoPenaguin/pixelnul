import { expect, test } from 'vitest'
import { STICKERS, stickerPicture } from './stickers'

test('every sticker uses palette colours only, and every letter has a colour', () => {
  // The server's palette (server/internal/board/pixel.go).
  const palette = new Set(
    '#FFFFFF #CDCDCD #9C9C9C #696969 #373737 #000000 #FF8A80 #FFA878 #FFF3A3 #A8E89A #A6EEF0 #90C4FF #D4A8F5 #FFB3D9 #E52521 #FF8A1F #FFE135 #2ECC40 #00B8B8 #1F5BFF #8A2BE2 #FF4FA3 #7A1520 #B8400C #7F8020 #1E6B32 #0A5F70 #1E2F7A #5E1A6E #A3195B #EDCB9A #C9A06A #A0703F #6B4128 #4E2408'.split(
      ' ',
    ),
  )
  for (const s of STICKERS) {
    for (const hex of Object.values(s.colors)) expect(palette, `${s.name}: ${hex}`).toContain(hex)
    for (const ch of s.rows.join('').replaceAll('.', '')) expect(s.colors, s.name).toHaveProperty(ch)
  }
})

test('turns a sticker into a picture: transparent dots, opaque colours', () => {
  const img = stickerPicture({ name: 'test', colors: { a: '#E52521' }, rows: ['a.', '.a'] })
  expect([img.width, img.height]).toEqual([2, 2])
  expect([...img.data]).toEqual([229, 37, 33, 255, 0, 0, 0, 0, 0, 0, 0, 0, 229, 37, 33, 255])
})
