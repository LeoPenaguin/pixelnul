// Touch screen (Pixel 7), signed in as a player: everything reachable with a finger.
/// <reference lib="dom" /> // getComputedStyle, run in the page
import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, signIn, type PixelInfo } from './accounts.js'

test.beforeEach(async ({ context }) => {
  await signIn(context, 'player')
})

const MIN_TARGET = 24 // px, WCAG 2.5.8 minimum target size

/** Each visible button can take a tap: on screen, big enough, and not covered by another element
 *  (trial: Playwright's checks only, nothing pressed). */
async function tappable(scope: Locator | Page) {
  const buttons = await scope.getByRole('button').filter({ visible: true }).all()
  expect(buttons.length).toBeGreaterThan(0)
  for (const b of buttons) {
    const name = (await b.getAttribute('aria-label')) ?? (await b.textContent()) ?? ''
    await b.tap({ trial: true })
    const box = await b.boundingBox()
    expect(box, name).not.toBeNull()
    expect(Math.min(box?.width ?? 0, box?.height ?? 0), `${name}: size`).toBeGreaterThanOrEqual(MIN_TARGET)
  }
}

/** A point on the board, around the view centre, clear of the panels. */
function boardPoint(page: Page) {
  const size = page.viewportSize()
  if (!size) throw new Error('no viewport')
  const r = () => Math.round(Math.random() * 80) - 40
  return { x: size.width / 2 + r(), y: size.height / 2 + r() }
}

test('every button on screen can be tapped', async ({ page }) => {
  await open(page)
  await tappable(page)
})

test('a tap on the board paints the colour picked with a tap', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /^Couleurs, couleur actuelle/ }).tap()
  const swatch = page.getByRole('radio', { name: 'Rouge', exact: true })
  const rgb = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
  await swatch.tap() // picks it and closes the palette
  await expect(page.getByRole('button', { name: 'Couleurs, couleur actuelle : Rouge' })).toBeVisible()
  const p = boardPoint(page)
  await page.touchscreen.tap(p.x, p.y)
  const said = page.locator('[aria-live]').filter({ hasText: /posé en/ })
  await expect(said).toHaveText(/^Rouge posé en -?\d+, -?\d+$/)
  const [x, y] = ((await said.textContent()) ?? '').replace(/.*posé en /, '').split(', ')
  const info = (await (await page.request.get(`/api/pixels/${x}/${y}`)).json()) as PixelInfo
  const conf = (await (await page.request.get('/api/config')).json()) as { palette: string[][] }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(conf.palette.flat()[info.c].slice(i, i + 2), 16))
  expect(`rgb(${String(r)}, ${String(g)}, ${String(b)})`).toBe(rgb) // the server stored that very colour
})

test('every dialog of the controls can be used with a finger', async ({ page }) => {
  await open(page)
  for (const name of ["Télécharger l'image", 'Signaler un bug', 'Accessibilité', 'Stats', 'À propos', /^Mon compte/]) {
    await page.getByRole('button', { name }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await tappable(dialog)
    await dialog.getByRole('button', { name: 'Fermer' }).tap()
    await expect(dialog).toBeHidden()
  }
})

test('a drawing is reported with a tap on it', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Signaler un dessin' }).tap()
  await tappable(page.getByRole('region', { name: 'Signaler' }))
  const p = boardPoint(page)
  await page.touchscreen.tap(p.x, p.y)
  const dialog = page.getByRole('dialog', { name: 'Signaler un dessin' })
  await expect(dialog.getByText(/^Le dessin autour de -?\d+, -?\d+ sera montré/)).toBeVisible()
  await dialog.getByRole('radio', { name: 'Autre contenu' }).tap()
  await expect(dialog.getByRole('radio', { name: 'Autre contenu' })).toBeChecked()
  await tappable(dialog) // not sent: reports pile up in the test database, 200 at most
})

test('a pinch on the interface does not zoom the page', async ({ page }) => {
  await open(page)
  // The browser's own pinch is not scriptable: the CSS that stops it is checked instead. The board keeps its own.
  const action = (l: Locator) => l.evaluate((el) => getComputedStyle(el).touchAction)
  expect(await action(page.getByRole('button', { name: 'Zoomer', exact: true }))).toBe('pan-x pan-y')
  expect(await action(page.locator('.toolbar'))).toBe('pan-x pan-y')
  expect(await action(page.getByRole('application', { name: 'Board de pixels' }))).toBe('none')
})

test('tapping a button again and again does not select its label', async ({ page }) => {
  await open(page)
  // Text selection by taps is not scriptable reliably: the CSS that stops it is checked instead.
  const zoom = page.getByRole('button', { name: 'Zoomer', exact: true })
  expect(await zoom.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none')
})
