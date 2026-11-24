// Colours: French names (read by screen readers, shown as tooltips) and conversions.

export type Rgb = [number, number, number]

/** '#E52521' → [229, 37, 33]. */
export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb

/** Colours as opaque RGBA pixels, ready to write into ImageData through a Uint32Array.
 *  ponytail: assumes a little-endian CPU (every browser platform today). */
export const packColors = (hexes: string[]) =>
  Uint32Array.from(hexes, (hex) => {
    const [r, g, b] = hexToRgb(hex)
    return (0xff << 24) | (b << 16) | (g << 8) | r
  })

const NAMES: Record<string, string> = {
  '#FFFFFF': 'Blanc',
  '#CDCDCD': 'Gris très clair',
  '#9C9C9C': 'Gris clair',
  '#696969': 'Gris',
  '#373737': 'Gris foncé',
  '#000000': 'Noir',
  '#FF8A80': 'Rouge clair',
  '#FFA878': 'Pêche',
  '#FFF3A3': 'Jaune clair',
  '#A8E89A': 'Vert clair',
  '#A6EEF0': 'Turquoise clair',
  '#90C4FF': 'Bleu ciel',
  '#D4A8F5': 'Lavande',
  '#FFB3D9': 'Rose clair',
  '#E52521': 'Rouge',
  '#FF8A1F': 'Orange',
  '#FFE135': 'Jaune',
  '#2ECC40': 'Vert',
  '#00B8B8': 'Turquoise',
  '#1F5BFF': 'Bleu',
  '#8A2BE2': 'Violet',
  '#FF4FA3': 'Rose',
  '#7A1520': 'Bordeaux',
  '#B8400C': 'Orange brûlé',
  '#7F8020': 'Olive',
  '#1E6B32': 'Vert foncé',
  '#0A5F70': 'Bleu canard',
  '#1E2F7A': 'Bleu marine',
  '#5E1A6E': 'Prune',
  '#A3195B': 'Framboise',
  '#EDCB9A': 'Beige',
  '#C9A06A': 'Sable',
  '#A0703F': 'Caramel',
  '#6B4128': 'Brun',
  '#4E2408': 'Brun foncé',
}

/** French name of a colour; a colour added server-side without a name here is read as hex. */
export const colorName = (hex: string) => NAMES[hex.toUpperCase()] ?? hex
