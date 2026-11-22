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
  '#E5A49C': 'Saumon pâle',
  '#F6C886': 'Abricot pâle',
  '#FBE7AA': 'Jaune pâle',
  '#99E3B5': 'Vert pâle',
  '#A6E6E7': 'Turquoise pâle',
  '#A5A1E1': 'Lavande',
  '#D8A4E2': 'Mauve pâle',
  '#D34F3E': 'Rouge',
  '#F09336': 'Orange',
  '#F7CF5F': 'Jaune',
  '#5CC96E': 'Vert',
  '#65CFD0': 'Turquoise',
  '#597CE2': 'Bleu',
  '#B64DC8': 'Violet',
  '#7D2E25': 'Rouge foncé',
  '#A84F1D': 'Orange brûlé',
  '#CD9C34': 'Ocre',
  '#347842': 'Vert foncé',
  '#3B7C7C': 'Bleu canard',
  '#354A87': 'Bleu marine',
  '#6D2D77': 'Prune',
  '#E52521': 'Rouge vif',
  '#FF4FA3': 'Rose vif',
  '#FFE135': 'Jaune vif',
  '#2ECC40': 'Vert vif',
  '#00B4F0': 'Cyan vif',
  '#1F5BFF': 'Bleu vif',
  '#8A2BE2': 'Violet vif',
  '#F2C9A8': 'Beige',
  '#C68B59': 'Caramel',
  '#7A4A2E': 'Brun',
  '#4A2E1C': 'Brun foncé',
}

/** French name of a colour; a colour added server-side without a name here is read as hex. */
export const colorName = (hex: string) => NAMES[hex.toUpperCase()] ?? hex
