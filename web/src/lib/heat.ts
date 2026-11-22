// Heatmap colours: how many times a pixel was painted, from never (dark) to the board's most
// disputed pixel (bright). The scale follows the board: its top is the current maximum.
import { hexToRgb } from './colors'

export const HEAT_NONE = '#1c1c1c' // never painted
/** From painted once to painted the most. */
export const HEAT_RAMP = ['#4b1d8c', '#a3307e', '#e4505b', '#f99a3e', '#fde74c']

/** Position of a change count on the ramp, 0 to 1. Logarithmic: a few very disputed pixels must
 *  not flatten everything else to the bottom colour. */
export const heatLevel = (n: number, max: number) => (max <= 1 ? 1 : Math.log(Math.min(n, max)) / Math.log(max))

/** Colour at position t (0 to 1) of the ramp, as #rrggbb. */
export function rampColor(t: number) {
  const x = t * (HEAT_RAMP.length - 1)
  const i = Math.min(Math.floor(x), HEAT_RAMP.length - 2)
  const a = hexToRgb(HEAT_RAMP[i])
  const b = hexToRgb(HEAT_RAMP[i + 1])
  return `#${a
    .map((v, k) =>
      Math.round(v + (b[k] - v) * (x - i))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** Colour of each byte the server sends (change count, capped at 255), for a board whose most
 *  painted pixel was painted `max` times. */
export const heatColors = (max: number) =>
  Array.from({ length: 256 }, (_, n) => (n ? rampColor(heatLevel(n, max)) : HEAT_NONE))
