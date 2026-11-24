import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

type PixelInfo = { x: number; y: number; c: number; changes: number }

/** A random white pixel near the origin (reachable with the keyboard cursor), so painting it black
 *  is always a change, whatever earlier runs left in Redis. Returns its current history too. */
async function whitePixel(request: APIRequestContext): Promise<PixelInfo> {
  for (;;) {
    const [x, y] = [0, 0].map(() => Math.floor(Math.random() * 61) - 30)
    const res = await request.get(`/api/pixels/${String(x)}/${String(y)}`)
    const info = (await res.json()) as PixelInfo
    if (info.c === 0) return info
  }
}

const changes = (n: number) => `· ${String(n)} changement${n > 1 ? 's' : ''}`

/** Opens the app and waits for the configuration (commands are inert before that). */
async function open(page: Page) {
  await page.bringToFront() // several players: the front page receives the keyboard
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible()
}

/** Moves the keyboard cursor from the view centre (0, 0 on a fresh page) to a pixel. */
async function cursorTo(page: Page, { x, y }: { x: number; y: number }) {
  await page.getByRole('application', { name: 'Board de pixels' }).focus()
  await page.keyboard.press('Enter') // first press: shows the cursor at the centre
  for (const [d, key] of [
    [x, x < 0 ? 'ArrowLeft' : 'ArrowRight'],
    [y, y < 0 ? 'ArrowUp' : 'ArrowDown'],
  ] as const) {
    const n = Math.abs(d)
    for (let i = 0; i < Math.floor(n / 10); i++) await page.keyboard.press(`Shift+${key}`)
    for (let i = 0; i < n % 10; i++) await page.keyboard.press(key)
  }
}

test('painting with the keyboard: stored and broadcast', async ({ page, browser }) => {
  const before = await whitePixel(page.request)
  const target = { x: before.x, y: before.y }
  await open(page)

  // A second player looks at the same pixel.
  const other = await browser.newPage()
  await open(other)
  await cursorTo(other, target)
  await expect(other.locator('[aria-live]')).toHaveText(new RegExp(`^${String(target.x)}, ${String(target.y)} : Blanc`))

  await page.bringToFront()
  await cursorTo(page, target)
  await page.keyboard.press('Space')
  await expect(page.locator('[aria-live]')).toHaveText(new RegExp(`posé en ${String(target.x)}, ${String(target.y)}$`))

  const res = await page.request.get(`/api/pixels/${String(target.x)}/${String(target.y)}`)
  expect(await res.json()).toMatchObject({ ...target, changes: before.changes + 1 })

  // The broadcast pixel reloads the history for the other player.
  await expect(other.getByText(changes(before.changes + 1))).toBeVisible()
})

test('palette, grid and help from the keyboard', async ({ page }) => {
  await open(page)
  await page.getByRole('application', { name: 'Board de pixels' }).focus()
  await page.keyboard.press('g')
  // The settings dialog only exists while open: the setting is read where it is remembered.
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('pixels:settings') ?? '{}') as { grid?: boolean }).grid),
    )
    .toBe(false)

  await page.keyboard.press('c')
  const radios = page.getByRole('radio')
  await expect(radios.locator('xpath=self::*[@aria-checked="true"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('radiogroup')).toBeHidden()
  await expect(page.getByRole('button', { name: /^Couleurs, couleur actuelle/ })).toBeFocused()

  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the navigation buttons recenter on 0, 0', async ({ page }) => {
  await open(page)
  const coords = page.locator('.coords')
  const box = await page.getByRole('application', { name: 'Board de pixels' }).boundingBox()
  if (!box) throw new Error('no board')
  // Zoomed in, so the board overflows the view and can be panned.
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click()
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click()
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 300, cy - 200, { steps: 5 })
  await page.mouse.up()
  await expect(coords).not.toHaveText(/^X\s*0\s*Y\s*0\s*$/)
  await page.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
  await expect(coords).toHaveText(/^X\s*0\s*Y\s*0\s*$/)
})
