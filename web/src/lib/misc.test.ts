// Small stateless modules: colours, dates, quota, API.
import { afterEach, expect, test, vi } from 'vitest'
import { deleteAccount, fetchConfig, fetchMe, fetchPixelInfo, savePseudo, signOut } from './api'
import { colorName } from './colors'
import { HEAT_NONE, HEAT_RAMP, heatColors, heatLevel, rampColor } from './heat'
import { quotaAt } from './quota'
import { loadSettings, saveSettings } from './settings'
import { ago } from './time'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('colorName: French name, or hex if unknown', () => {
  expect(colorName('#000000')).toBe('Noir')
  expect(colorName('#e52521')).toBe('Rouge vif')
  expect(colorName('#123456')).toBe('#123456')
})

test('ago: relative time in French', () => {
  const now = 1_000_000_000
  expect(ago(now - 5_000, now)).toBe('il y a 5 secondes')
  expect(ago(now - 3 * 60_000, now)).toBe('il y a 3 minutes')
  expect(ago(now - 2 * 3_600_000, now)).toBe('il y a 2 heures')
  expect(ago(now - 86_400_000, now)).toBe('hier')
})

test('quotaAt: refill, cap and next pixel', () => {
  const rules = { burst: 10, refillMs: 2000 }
  const empty = quotaAt(rules, { n: 0, at: 0 }, 500)
  expect(empty).toEqual({ tokens: 0.25, available: 0, full: false, progress: 0.25, nextIn: 2 })
  const full = quotaAt(rules, { n: 9, at: 0 }, 60_000)
  expect(full).toEqual({ tokens: 10, available: 10, full: true, progress: 1, nextIn: 2 })
})

test('the API returns the server JSON and fails on an HTTP error', async () => {
  const fetch = vi.fn(() => Promise.resolve(Response.json({ x: 1 })))
  vi.stubGlobal('fetch', fetch)
  await expect(fetchConfig()).resolves.toEqual({ x: 1 })
  expect(fetch).toHaveBeenCalledWith('/api/config')
  await expect(fetchPixelInfo(-3, 4)).resolves.toEqual({ x: 1 })
  expect(fetch).toHaveBeenLastCalledWith('/api/pixels/-3/4')

  fetch.mockImplementation(() => Promise.resolve(new Response('', { status: 500 })))
  await expect(fetchConfig()).rejects.toThrow('/api/config : 500')
})

test('account calls: refusals are explained, other failures throw', async () => {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/me' && !init) return Promise.resolve(Response.json(null))
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  vi.stubGlobal('fetch', fetch)
  await expect(fetchMe()).resolves.toBeNull()
  await expect(savePseudo('Minou')).resolves.toBeNull()
  expect(fetch).toHaveBeenLastCalledWith('/api/me/pseudo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"pseudo":"Minou"}',
  })
  await signOut()
  expect(fetch).toHaveBeenLastCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  await deleteAccount()
  expect(fetch).toHaveBeenLastCalledWith('/api/me', expect.objectContaining({ method: 'DELETE' }))

  for (const [status, reason] of [
    [409, 'ce pseudo est déjà pris'],
    [400, 'trop court'],
  ] as const) {
    fetch.mockImplementationOnce(() => Promise.resolve(new Response(`${reason}\n`, { status })))
    await expect(savePseudo('x')).resolves.toBe(reason)
  }
  fetch.mockImplementation(() => Promise.resolve(new Response('', { status: 500 })))
  await expect(savePseudo('x')).resolves.toBe("Impossible d'enregistrer pour le moment")
  await expect(signOut()).rejects.toThrow('/api/auth/logout : 500')
})

test('settings: defaults, remembered, safe when storage fails', () => {
  localStorage.clear()
  expect(loadSettings()).toEqual({ grid: true, colorNames: false, scale: 1 })
  saveSettings({ grid: false, colorNames: true, scale: 1.25 })
  expect(loadSettings()).toEqual({ grid: false, colorNames: true, scale: 1.25 })
  localStorage.setItem('pixels:settings', '{oops')
  expect(loadSettings().grid).toBe(true)
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(() => {
    saveSettings({ grid: true, colorNames: false, scale: 1 })
  }).not.toThrow()
  set.mockRestore()
  localStorage.clear()
})

test('heat colours: scaled from 1 to the board maximum, logarithmic', () => {
  expect(rampColor(0)).toBe(HEAT_RAMP[0])
  expect(rampColor(0.5)).toBe(HEAT_RAMP[2])
  expect(rampColor(1)).toBe(HEAT_RAMP[4])
  expect(rampColor(0.125)).toBe('#772785') // halfway between the first two stops
  expect(heatLevel(10, 100)).toBe(0.5)
  expect(heatLevel(500, 100)).toBe(1) // above the maximum: the top
  expect(heatLevel(1, 1)).toBe(1) // everything painted once: all at the top
  const colors = heatColors(16)
  expect(colors).toHaveLength(256)
  expect([colors[0], colors[1], colors[4], colors[16], colors[255]]).toEqual([
    HEAT_NONE,
    HEAT_RAMP[0],
    HEAT_RAMP[2],
    HEAT_RAMP[4],
    HEAT_RAMP[4],
  ])
})
