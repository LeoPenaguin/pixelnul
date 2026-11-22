// French number and plural formatting for the UI.

/** 12 345 (French thousands separator). */
export const fmt = (n: number) => n.toLocaleString('fr-FR')

/** « 1 pixel posé », « 3 pixels posés »: every word takes an s above 1 (French rule: 0 and 1 are singular). */
export const plural = (n: number, words: string) =>
  `${fmt(n)} ${
    n > 1
      ? words
          .split(' ')
          .map((w) => `${w}s`)
          .join(' ')
      : words
  }`
