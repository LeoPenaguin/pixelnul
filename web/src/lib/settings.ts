// Display and accessibility preferences, remembered in this browser.

export type Settings = {
  grid: boolean
  scale: number // size of the panels and text; the board is not affected
}

export const UI_SCALES = [1, 1.25, 1.5]
const KEY = 'pixels:settings'
const DEFAULTS: Settings = { grid: true, scale: 1 }

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS } // storage blocked or corrupted: defaults
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage blocked (private browsing): the settings last for this visit only
  }
}
