// Heatmap colours: how many times a pixel was painted, from never (dark) to very disputed (bright).

/** [minimum change count, colour, legend label]: a few readable steps rather than a smooth ramp. */
export const HEAT_STEPS: [min: number, color: string, label: string][] = [
  [0, '#1c1c1c', '0'],
  [1, '#4b1d8c', '1'],
  [2, '#a3307e', '2'],
  [3, '#e4505b', '3–4'],
  [5, '#f99a3e', '5–9'],
  [10, '#fde74c', '10+'],
]

/** Colour of each byte the server sends (change count, capped at 255). */
export const HEAT_COLORS = Array.from({ length: 256 }, (_, n) =>
  HEAT_STEPS.reduce((color, [min, c]) => (n >= min ? c : color), HEAT_STEPS[0][1]),
)
