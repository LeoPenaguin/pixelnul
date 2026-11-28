// What only admins may do, checked against the real server: every moderation route, and what the page shows.
// Runs on desktop and on mobile.
import { expect, test } from '@playwright/test'
import { ACCOUNTS, open, signIn, whitePixel, type PixelInfo } from './accounts.js'

/** Every admin route, with a valid body: only the missing right may refuse it. The reset goes last: were the
 *  guard broken, it would wipe the test board, and the other calls would still have been checked. */
const ROUTES = (x: number, y: number) =>
  [
    ['POST', '/api/admin/fill', { x0: x, y0: y, x1: x, y1: y, c: 1 }],
    ['POST', '/api/admin/ban', { pseudo: ACCOUNTS.player.pseudo, banned: true }],
    ['GET', '/api/admin/reports', undefined],
    ['DELETE', '/api/admin/reports/unknown', {}],
    ['POST', '/api/admin/reset', { confirm: 'EFFACER' }],
  ] as const

for (const who of ['anonymous', 'player'] as const) {
  test(`${who}: every admin route is refused and changes nothing`, async ({ context, page }) => {
    if (who === 'player') await signIn(context, 'player')
    const before = await whitePixel(page.request)
    for (const [method, url, data] of ROUTES(before.x, before.y)) {
      const res = await page.request.fetch(url, { method, data })
      expect(res.status(), `${method} ${url}`).toBe(403)
    }
    const after = (await (
      await page.request.get(`/api/pixels/${String(before.x)}/${String(before.y)}`)
    ).json()) as PixelInfo
    expect(after).toMatchObject({ c: 0, changes: before.changes })
    const me = (await (await page.request.get('/api/me')).json()) as { banned: boolean; admin: boolean } | null
    if (who === 'player') expect(me).toMatchObject({ banned: false, admin: false })
    else expect(me).toBeNull()
  })

  test(`${who}: no moderation on the page`, async ({ context, page }) => {
    if (who === 'player') await signIn(context, 'player')
    await open(page)
    const account = who === 'player' ? `Mon compte : ${ACCOUNTS.player.pseudo}` : 'Se connecter'
    await expect(page.getByRole('button', { name: account })).toBeVisible() // signed in or not, as meant
    await expect(page.getByRole('button', { name: 'Modération' })).toHaveCount(0)
  })
}

test('an admin passes the same checks', async ({ context, page }) => {
  await signIn(context, 'admin')
  // The proof that the refusals above come from the right, not from a broken setup.
  expect((await page.request.get('/api/admin/reports')).status()).toBe(200)
  const target = await whitePixel(page.request)
  const res = await page.request.post('/api/admin/fill', {
    data: { x0: target.x, y0: target.y, x1: target.x, y1: target.y, c: 0 }, // white on white: no visible change
  })
  expect(res.status()).toBe(204)
})

test('an admin reaches every moderation tab', async ({ context, page }, { project }) => {
  await signIn(context, 'admin')
  await open(page)
  const press = (l: ReturnType<typeof page.getByRole>) => (project.use.hasTouch ? l.tap() : l.click())
  await press(page.getByRole('button', { name: 'Modération' }))
  const dialog = page.getByRole('dialog', { name: 'Modération' })
  for (const [tab, control] of [
    ['Toile', 'Coller des stickers'],
    ['Joueurs', 'Débannir'],
    ['Effacer', 'Effacer la toile'],
    [/^Signalements/, null],
  ] as const) {
    await press(dialog.getByRole('tab', { name: tab }))
    await expect(dialog.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    if (control) await expect(dialog.getByRole('button', { name: control })).toBeVisible()
  }
})
