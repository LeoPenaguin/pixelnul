import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import './app.css'
import App from './App.svelte'
import type { PixelInfo, Report, User } from './lib/api'
import { FakeWebSocket, config as baseConfig, frames, stubFetch, stubWebSocket } from './test/fakes'

// The default colour is index 5 (black): a full row of greys is needed.
const config = {
  ...baseConfig,
  palette: [
    ['#FFFFFF', '#CDCDCD', '#9C9C9C', '#696969', '#373737', '#000000'],
    ['#E52521', '#1F5BFF'],
  ],
}

let info: Partial<PixelInfo> = {}
let configResponse: () => Response | Promise<Response>
let me: User | null = null
let hottest: { x: number; y: number; changes: number } | null = null
let statsUp = true
let accountStatus = 204 // answer of the account actions (pseudo, sign out, delete)
let adminStatus = 204 // answer of the moderation routes
let adminCalls: { url: string; body: unknown }[] = []
let reports: Report[] = []
let reportStatus = 204 // answer of POST /api/reports
let reportCalls: unknown[] = []

beforeEach(() => {
  localStorage.clear() // settings
  info = {}
  configResponse = () => Response.json(config)
  me = null
  accountStatus = 204
  adminStatus = 204
  adminCalls = []
  reports = []
  reportStatus = 204
  reportCalls = []
  hottest = { x: 40, y: -3, changes: 1 }
  statsUp = true
  stubWebSocket()
  stubFetch({
    '/api/me/pseudo': () =>
      new Response(accountStatus === 204 ? null : 'ce pseudo est déjà pris', { status: accountStatus }),
    '/api/me': (_, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: accountStatus }) : Response.json(me),
    '/api/auth/logout': () => new Response(null, { status: accountStatus }),
    '/api/reports': (_, init) => {
      reportCalls.push(JSON.parse(init?.body as string))
      return new Response(null, { status: reportStatus })
    },
    '/api/admin/reports': (url, init) => {
      if (init?.method !== 'DELETE') return Response.json(reports)
      reports = reports.filter((r) => !url.endsWith(r.id))
      return new Response(null, { status: 204 })
    },
    '/api/admin/': (url, init) => {
      adminCalls.push({ url, body: JSON.parse(init?.body as string) })
      return new Response(adminStatus === 404 ? 'aucun compte avec ce pseudo\n' : null, { status: adminStatus })
    },
    '/api/config': () => configResponse(),
    '/api/chunks/': () => new Response(new Uint8Array()),
    '/api/stats': () =>
      statsUp
        ? Response.json({
            placed: 1,
            painted: 1,
            pixels: 921_600,
            online: 1,
            hottest,
            colors: [0, 1],
            hours: Array<number>(24).fill(0),
            top: [],
          })
        : new Response('', { status: 500 }),
    '/api/pixels/': (url) => {
      const [x, y] = url.split('/').slice(-2).map(Number)
      return Response.json({ x, y, c: 0, changes: 0, lastChange: null, by: null, ...info })
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const board = () => document.querySelector<HTMLCanvasElement>('canvas.world')!
const announced = (text: string) =>
  vi.waitFor(() => {
    expect(document.querySelector('[aria-live]')?.textContent).toBe(text)
  })
// The settings dialog is unmounted while closed: the grid setting is read where it is remembered.
const grid = () => (JSON.parse(localStorage.getItem('pixels:settings') ?? '{}') as { grid?: boolean }).grid ?? true
const fields = () => [...document.querySelectorAll('.coords span')].map((s) => Number(s.textContent))

/** Renders the app, waits for the configuration and opens the real-time connection. */
async function start() {
  const screen = await render(App)
  await expect.element(page.getByRole('button', { name: 'Zoomer' })).toBeVisible()
  const c = board()
  c.setPointerCapture = vi.fn()
  FakeWebSocket.last.open()
  return { screen, ws: FakeWebSocket.last }
}

const click = (x: number, y: number) => {
  for (const type of ['pointerdown', 'pointerup'])
    board().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true }))
}
const press = (key: string, init: KeyboardEventInit = {}) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )

describe('painting pixels', () => {
  test('a click paints the selected colour and closes the palette', async () => {
    const { ws } = await start()
    await page.getByRole('button', { name: /^Couleurs/ }).click()
    await page.getByRole('radio', { name: 'Rouge' }).click()
    const r = board().getBoundingClientRect()
    click(r.left + r.width / 2, r.top + r.height / 2)
    expect(ws.sent).toEqual([{ x: 0, y: 0, c: 6 }])
    await announced('Rouge posé en 0, 0')
    await expect.element(page.getByRole('radiogroup')).not.toBeInTheDocument()
  })

  test('quota exhausted, then refilled by the server', async () => {
    const { ws } = await start()
    board().dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }))
    click(10, 10)
    click(10, 10)
    click(10, 10) // quota of 2: refused without sending anything
    expect(ws.sent).toHaveLength(2)
    await vi.waitFor(() => {
      expect(board().style.cursor).toBe('not-allowed')
    })
    await announced('Plus de pixel disponible, prochain dans 1 secondes')
    ws.receive({ t: 'q', n: 2 })
    await vi.waitFor(() => {
      expect(board().style.cursor).not.toBe('not-allowed')
    })
    click(10, 10)
    expect(ws.sent).toHaveLength(3)
  })

  test('offline: nothing is sent, the disconnection and then the reconnection are shown', async () => {
    const { ws } = await start()
    ws.close()
    await expect.element(page.getByRole('heading', { name: 'Petit souci technique' })).toBeVisible()
    click(10, 10)
    await announced('Hors ligne, pixel non posé')
    await vi.waitFor(
      () => {
        expect(FakeWebSocket.instances).toHaveLength(2)
      },
      { timeout: 3000 }, // reconnects after 1 to 2 s
    )
    FakeWebSocket.last.open()
    await expect.element(page.getByRole('heading', { name: 'Petit souci technique' })).not.toBeInTheDocument()
  })

  test('without a quota limit, no gauge or countdown', async () => {
    configResponse = () => Response.json({ ...config, quota: { burst: 1, refillMs: 0 } })
    const { ws } = await start()
    click(10, 10)
    click(10, 10)
    expect(ws.sent).toHaveLength(2)
    await expect.element(page.getByText(/disponible/)).not.toBeInTheDocument()
  })
})

describe('accounts', () => {
  const withAuth = () => (configResponse = () => Response.json({ ...config, auth: ['google'] }))

  test('signed out: a click on the board asks to sign in, nothing is sent', async () => {
    withAuth()
    const { ws } = await start()
    click(10, 10)
    await expect.element(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
    expect(ws.sent).toEqual([])
    await expect.element(page.getByText(/disponible/)).not.toBeInTheDocument() // no quota without an account
    board().dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }))
    await vi.waitFor(() => {
      expect(board().style.cursor).toBe('not-allowed')
    })
    await expect.element(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeInTheDocument()
  })

  test('first sign-in: the pseudo is asked for, then painting works on a new connection', async () => {
    withAuth()
    me = { id: 'u1', pseudo: '', admin: false, banned: false, provider: 'google' }
    await start()
    await expect.element(page.getByRole('heading', { name: 'Choisis ton pseudo' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Pseudo' }).fill('Minou')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await announced('Bienvenue Minou, tu peux peindre')
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.last.open()
    click(10, 10)
    expect(FakeWebSocket.last.sent).toHaveLength(1)
    await expect.element(page.getByRole('heading', { name: 'Petit souci technique' })).not.toBeInTheDocument()
  })

  test('signed in: changes the pseudo, signs out, deletes; a failure is announced', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Minou', admin: false, banned: false, provider: 'google' }
    await start()
    const account = () => page.getByRole('button', { name: /^Mon compte/ })
    await account().click()
    accountStatus = 409
    await page.getByRole('textbox', { name: 'Pseudo' }).fill('Pixel')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('ce pseudo est déjà pris')
    accountStatus = 204
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await announced('Pseudo changé en Pixel')
    await expect.element(account()).toHaveTextContent('Pixel')

    accountStatus = 500
    await account().click()
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await announced('Impossible pour le moment, réessaie')
    accountStatus = 204
    await account().click()
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click()
    await announced('Compte supprimé')
    await expect.element(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
  })

  test('banned: nothing is sent, and it says why', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Kevin', admin: false, banned: true, provider: 'google' }
    const { ws } = await start()
    click(10, 10)
    await announced('Ton compte est banni : tu ne peux plus peindre')
    expect(ws.sent).toEqual([])
    await expect.element(page.getByRole('button', { name: 'Modération' })).not.toBeInTheDocument()
  })

  test('an admin paints over zones drawn with the keyboard and the mouse, in the chosen colour', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Modo', admin: true, banned: false, provider: 'google' }
    const { ws } = await start()
    await page.getByRole('button', { name: 'Modération' }).click()
    await page.getByRole('button', { name: 'Sélectionner sur la toile' }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument() // keys go to the board again
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(board())
    })
    press('Enter') // shows the cursor on 0, 0
    press('Enter')
    await expect.element(page.getByText('Premier coin en 0, 0 : choisis le coin opposé')).toBeVisible()
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowDown')
    press('Enter')
    await expect.element(page.getByText('1 zone · 6 pixels')).toBeVisible()
    press('Enter')
    press('Escape') // drops the pending corner only
    await expect.element(page.getByText('1 zone · 6 pixels')).toBeVisible()

    const r = board().getBoundingClientRect()
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2] // pixel x = floor((sx - cx) / 12)
    const drag = (type: string, sx: number) =>
      board().dispatchEvent(new PointerEvent(type, { clientX: sx, clientY: cy + 61, pointerId: 1, bubbles: true }))
    drag('pointerdown', cx + 61)
    drag('pointermove', cx + 90)
    drag('pointerup', cx + 90)
    await expect.element(page.getByText('2 zones · 9 pixels')).toBeVisible()

    for (const [status, text] of [
      [500, 'Impossible pour le moment'],
      [400, 'Un coin est hors de la toile'],
      [413, 'Trop grand : 65 536 pixels au plus'],
    ] as const) {
      adminStatus = status
      await page.getByRole('button', { name: 'Remplir en Noir' }).click()
      await expect.element(page.getByText(text)).toBeVisible()
    }
    adminStatus = 204
    await page.getByRole('button', { name: 'Remplir en Noir' }).click()
    await expect.element(page.getByText('Zones repeintes')).toBeVisible()
    expect(adminCalls.slice(3)).toEqual([
      { url: '/api/admin/fill', body: { x0: 0, y0: 0, x1: 2, y1: 1, c: 5 } },
      { url: '/api/admin/fill', body: { x0: 5, y0: 5, x1: 7, y1: 5, c: 5 } },
    ])
    expect(ws.sent).toEqual([]) // nothing was painted on the way

    drag('pointerdown', cx + 61)
    drag('pointerup', cx + 61)
    drag('pointerdown', cx + 73)
    drag('pointerup', cx + 73)
    await expect.element(page.getByText('1 zone · 2 pixels')).toBeVisible()
    await page.getByRole('button', { name: 'Tout effacer' }).click()
    await expect.element(page.getByText(/Glisse sur la toile/)).toBeVisible()
    await page.getByRole('button', { name: 'Terminer' }).click()
    await expect.element(page.getByRole('region', { name: 'Zones à repeindre' })).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Modération' }).click()
    await page.getByRole('button', { name: 'Sélectionner sur la toile' }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument() // keys go to the board again
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(board())
    })
    press('Escape') // no pending corner: stops selecting
    await expect.element(page.getByRole('region', { name: 'Zones à repeindre' })).not.toBeInTheDocument()
    click(cx, cy)
    expect(ws.sent).toEqual([{ x: 0, y: 0, c: 5 }]) // a click paints again
  })

  test('an admin goes to a report and dismisses it', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Modo', admin: true, banned: false, provider: 'google' }
    reports = [{ id: 'r1', x: 40, y: -3, reason: 'hate', comment: 'une croix', by: 'Minou', at: Date.now() }]
    await start()
    await page.getByRole('button', { name: 'Modération' }).click()
    await page.getByRole('button', { name: 'Classer le signalement en 40, -3' }).click()
    await expect.element(page.getByText('Signalement classé')).toBeVisible()
    expect(reports).toEqual([])
    reports = [{ id: 'r2', x: 40, y: -3, reason: 'bug', comment: 'lent', by: '', at: Date.now() }]
    await page.getByRole('button', { name: 'Fermer' }).click()
    await page.getByRole('button', { name: 'Modération' }).click()
    await page.getByRole('button', { name: 'Voir 40, -3' }).click()
    await vi.waitFor(() => {
      expect(fields()).toEqual([40, -3])
    })
  })

  test('an admin bans a pseudo', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Modo', admin: true, banned: false, provider: 'google' }
    await start()
    await page.getByRole('button', { name: 'Modération' }).click()
    await page.getByRole('textbox', { name: 'Pseudo' }).fill('Kevin')
    for (const [status, text] of [
      [204, 'Kevin : compte banni'],
      [404, 'aucun compte avec ce pseudo'],
      [500, 'Impossible pour le moment'],
    ] as const) {
      adminStatus = status
      await page.getByRole('button', { name: 'Bannir' }).click()
      await expect.element(page.getByText(text)).toBeVisible()
    }
    expect(adminCalls.at(-1)).toEqual({ url: '/api/admin/ban', body: { pseudo: 'Kevin', banned: true } })
  })

  test('anyone reports what is around the view centre; a refusal says why', async () => {
    withAuth()
    await start()
    await page.getByRole('button', { name: 'Signaler un contenu ou un bug' }).click()
    for (const [status, text] of [
      [429, "Trop de signalements d'affilée, réessaie dans une minute"],
      [503, 'Impossible pour le moment'],
    ] as const) {
      reportStatus = status
      await page.getByRole('button', { name: 'Envoyer' }).click()
      await expect.element(page.getByRole('alert')).toHaveTextContent(text)
    }
    reportStatus = 204
    await page.getByRole('button', { name: 'Envoyer' }).click()
    await expect.element(page.getByText("Merci, c'est envoyé : la modération va regarder.")).toBeVisible()
    expect(reportCalls.at(-1)).toEqual({ x: 0, y: 0, reason: 'hate', comment: '' })
  })

  test('signs out', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Minou', admin: false, banned: false, provider: 'google' }
    await start()
    await page.getByRole('button', { name: /^Mon compte/ }).click()
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await announced('Déconnecté')
  })
})

describe('targeted pixel history', () => {
  test('shown on hover, reloaded when the pixel changes', async () => {
    const { ws } = await start()
    info = { c: 5, changes: 2, lastChange: Date.now() - 5000 }
    const r = board().getBoundingClientRect()
    board().dispatchEvent(
      new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    )
    await expect.element(page.getByText('Noir · 2 changements')).toBeVisible()
    expect(fields()).toEqual([0, 0])

    info = { c: 2, changes: 3, lastChange: Date.now() }
    ws.receive({ t: 'b', p: [5, 5, 1, 0, 0, 2] })
    await expect.element(page.getByText(/· 3 changements$/)).toBeVisible()

    board().dispatchEvent(new PointerEvent('pointerleave'))
    await expect.element(page.getByText(/changements/)).not.toBeInTheDocument()
  })

  test('names the colour of the pixel', async () => {
    await start()
    info = { c: 5, changes: 1, lastChange: Date.now() }
    const r = board().getBoundingClientRect()
    board().dispatchEvent(
      new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    )
    await expect.element(page.getByText('Noir · 1 changement')).toBeVisible()
  })

  test('hover too short, or server down: nothing is shown', async () => {
    await start()
    board().dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }))
    board().dispatchEvent(new PointerEvent('pointerleave')) // left before loading
    await new Promise((r) => setTimeout(r, 300))
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error('panne')))
    board().dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    await new Promise((r) => setTimeout(r, 300))
    await expect.element(page.getByText(/peint/)).not.toBeInTheDocument()
  })
})

describe('keyboard', () => {
  test('arrow cursor with announcements, Enter paints, Shift goes further', async () => {
    const { ws } = await start()
    board().focus()
    press('Enter') // first press: shows the cursor at the centre
    await announced('0, 0 : Blanc')
    info = { c: 5, changes: 1, lastChange: 1 }
    press('ArrowRight')
    await announced('1, 0 : Noir, 1 changement')
    info = { c: 5, changes: 4, lastChange: 1, by: 'Minou' }
    press('ArrowDown', { shiftKey: true })
    await announced('1, 10 : Noir, 4 changements, par Minou')
    expect(fields()).toEqual([1, 10])
    press(' ')
    expect(ws.sent).toEqual([{ x: 1, y: 10, c: 5 }])

    // The cursor moves before the info arrives: only the last position is announced.
    info = {}
    press('ArrowLeft')
    press('ArrowLeft')
    await announced('-1, 10 : Blanc')
  })

  test('view, grid, palette and help shortcuts', async () => {
    await start()
    board().focus()
    press('+')
    press('-')
    press('0')
    press('g')
    await expect.poll(grid).toBe(false)
    press('c')
    await expect.element(page.getByRole('radio', { name: 'Noir' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}') // handled by the palette, not the board
    await expect.element(page.getByRole('radio', { name: 'Rouge' })).toHaveFocus()
    press('Escape')
    await expect.element(page.getByRole('radiogroup')).not.toBeInTheDocument()
    press('?')
    await expect.element(page.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    press('g') // help open: shortcuts are disabled
    await expect.poll(grid).toBe(false)
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument() // after its closing animation
    press('x') // key without a shortcut
  })

  test('the settings are applied and remembered', async () => {
    await start()
    await page.getByRole('button', { name: 'Paramètres' }).click()
    await page.getByRole('checkbox', { name: 'Grille' }).click()
    await page.getByRole('radio', { name: '150 %' }).click()
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.5')
    await userEvent.keyboard('{Escape}')
    expect(JSON.parse(localStorage.getItem('pixels:settings') ?? '')).toEqual({
      grid: false,
      scale: 1.5,
    })
  })

  test('the statistics lead to the most disputed pixel', async () => {
    await start()
    await page.getByRole('button', { name: 'Stats' }).click()
    await expect.element(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible()
    await page.getByRole('button', { name: 'Y aller' }).click()
    await vi.waitFor(() => {
      expect(fields()).toEqual([40, -3])
    })
  })

  test('the download button opens the download dialog', async () => {
    await start()
    await page.getByRole('button', { name: "Télécharger l'image" }).click()
    await expect.element(page.getByRole('heading', { name: "Télécharger l'image" })).toBeVisible()
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await page.getByText('×2').click()
    await page.getByRole('button', { name: 'Télécharger', exact: true }).click()
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledOnce()
    })
    save.mockRestore()
    await userEvent.keyboard('{Escape}')
  })

  test('the site panel opens the about dialog, which disables the shortcuts', async () => {
    await start()
    await page.getByRole('button', { name: 'À propos' }).click()
    await expect.element(page.getByRole('heading', { name: 'À propos' })).toBeVisible()
    press('g')
    await expect.poll(grid).toBe(true)
    await userEvent.keyboard('{Escape}')
  })

  test('the navigation buttons zoom, recenter and open the help', async () => {
    await start()
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click()
    await page.getByRole('button', { name: 'Dézoomer' }).click()
    await page.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
    await page.getByRole('button', { name: 'Raccourcis clavier' }).click()
    await expect.element(page.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
  })
})

describe('loading', () => {
  test('server unreachable: a message instead of the board, inert shortcuts, then retry', async () => {
    let fail = true
    configResponse = () => (fail ? new Response('', { status: 503 }) : Response.json(config))
    const screen = await render(App)
    await expect.element(page.getByRole('heading', { name: 'Petit souci technique' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Zoomer', exact: true })).not.toBeInTheDocument()
    for (const k of ['ArrowUp', 'Enter', '+', '-', '0', 'g', 'c', 'Escape']) press(k)
    fail = false
    await expect.element(page.getByRole('button', { name: 'Zoomer' }), { timeout: 3000 }).toBeVisible()
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
    await screen.unmount()
  })

  test('opens on 0, 0 and closes the connection when unmounted', async () => {
    const { screen } = await start()
    await frames()
    expect(fields()).toEqual([0, 0])
    await screen.unmount()
    expect(FakeWebSocket.last.readyState).toBe(3)
  })
})
