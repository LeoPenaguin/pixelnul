// Moderation stickers: pixel drawings pasted on the board with a click, in palette colours only. 10 × 10 (the
// logo's size), except the middle finger: a hand needs more room to read.
// Rows top to bottom; '.' is transparent (the board shows through), a letter is a colour from `colors`.

import type { Picture } from './stamp'
import { hexToRgb } from './colors'

export type Sticker = { name: string; colors: Record<string, string>; rows: string[] }

export const STICKERS: Sticker[] = [
  {
    name: 'Chat',
    colors: { a: '#000000', b: '#A0703F', c: '#6B4128', d: '#FFFFFF', e: '#FF8A80' },
    rows: [
      '.aa....aa.',
      'abbaaaabba',
      'abbcddcbba',
      'abbbddbbba',
      'ababddbaba',
      'abddddddba',
      'addceeddda',
      'addcddddda',
      'adddddddda',
      '.aaaaaaaa.',
    ],
  },
  {
    name: 'Cœur',
    colors: { k: '#000000', r: '#E52521', w: '#FFFFFF', d: '#7A1520' },
    rows: [
      '..........',
      '.kkk..kkk.',
      'krrrkkrrrk',
      'krwrrrrrrk',
      'krrrrrrrrk',
      'krrrrrrrdk',
      '.krrrrrdk.',
      '..krrrdk..',
      '...krdk...',
      '....kk....',
    ],
  },
  {
    name: 'Étoile',
    colors: { k: '#000000', y: '#FFE135', o: '#FF8A1F' },
    rows: [
      '....kk....',
      '...kyyk...',
      '...kyyk...',
      'kkkkyykkkk',
      'kyyyyyyyok',
      '.kyyyyyok.',
      '..kyyyok..',
      '..kyyyyk..',
      '.kyykkyok.',
      '.kkk..kkk.',
    ],
  },
  {
    name: 'Smiley',
    colors: { k: '#000000', y: '#FFE135' },
    rows: [
      '..kkkkkk..',
      '.kyyyyyyk.',
      'kyyyyyyyyk',
      'kyykyykyyk',
      'kyykyykyyk',
      'kyyyyyyyyk',
      'kykyyyykyk',
      'kyykkkkyyk',
      '.kyyyyyyk.',
      '..kkkkkk..',
    ],
  },
  {
    name: 'Aubergine',
    colors: { k: '#000000', g: '#2ECC40', p: '#8A2BE2', d: '#5E1A6E', w: '#D4A8F5' },
    rows: [
      '......k.k.',
      '.....kgkgk',
      '....kgggk.',
      '...kpkggk.',
      '..kppwkk..',
      '.kpppppk..',
      'kppppppk..',
      'kpppppdk..',
      'kppppdk...',
      '.kkkkk....',
    ],
  },
  {
    name: "Doigt d'honneur",
    colors: { a: '#000000', b: '#EDCB9A' },
    rows: [
      '.....aa........',
      '....abba.......',
      '....abba.......',
      '....abba.......',
      '....abba.......',
      '...aabbaaa.....',
      '.aababbabba....',
      'abababbabba.aa.',
      'abbbbbbbbbaabba',
      'abbbbbbbbbbbbba',
      'abbbbbbbbbbbba.',
      'abbbbbbbbbbba..',
      '.abbbbbbbbbba..',
      '.abbbbbbbbba...',
      '..abbbbbbba....',
      '..abbbbbba.....',
      '..aaaaaaaa.....',
    ],
  },
]

/** A sticker as an RGBA picture, ready for `toBlocks`. */
export function stickerPicture(s: Sticker): Picture {
  const width = Math.max(...s.rows.map((r) => r.length))
  const data = new Uint8ClampedArray(width * s.rows.length * 4)
  s.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') continue
      data.set([...hexToRgb(s.colors[ch]), 255], (y * width + x) * 4)
    }
  })
  return { data, width, height: s.rows.length }
}
