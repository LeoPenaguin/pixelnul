import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import './app.css'
import App from './App.svelte'
import type { PixelInfo, User } from './lib/api'
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

beforeEach(() => {
  localStorage.clear() // settings
  info = {}
  configResponse = () => Response.json(config)
  me = null
  accountStatus = 204
  hottest = { x: 40, y: -3, changes: 1 }
  statsUp = true
  stubWebSocket()
  stubFetch({
    '/api/me/pseudo': () =>
      new Response(accountStatus === 204 ? null : 'ce pseudo est déjà pris', { status: accountStatus }),
    '/api/me': (_, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: accountStatus }) : Response.json(me),
    '/api/auth/logout': () => new Response(null, { status: accountStatus }),
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
const grid = () => page.getByRole('checkbox', { name: 'Grille', includeHidden: true })
const fields = () => [...document.querySelectorAll<HTMLInputElement>('input[type=number]')].map((i) => i.valueAsNumber)

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
    await page.getByRole('radio', { name: 'Rouge vif' }).click()
    const r = board().getBoundingClientRect()
    click(r.left + r.width / 2, r.top + r.height / 2)
    expect(ws.sent).toEqual([{ x: 0, y: 0, c: 6 }])
    await announced('Rouge vif posé en 0, 0')
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
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2)
    })
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
  const withAuth = () => (configResponse = () => Response.json({ ...config, auth: true }))

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
    me = { id: 'u1', pseudo: '' }
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
    me = { id: 'u1', pseudo: 'Minou' }
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

  test('signs out', async () => {
    withAuth()
    me = { id: 'u1', pseudo: 'Minou' }
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
    await expect.element(page.getByText('2 changements · dernier il y a 5 secondes')).toBeVisible()
    expect(fields()).toEqual([0, 0])

    info = { c: 2, changes: 3, lastChange: Date.now() }
    ws.receive({ t: 'b', p: [5, 5, 1, 0, 0, 2] })
    await expect.element(page.getByText(/^3 changements/)).toBeVisible()

    board().dispatchEvent(new PointerEvent('pointerleave'))
    await expect.element(page.getByText(/changements/)).not.toBeInTheDocument()
  })

  test('names the colour of the pixel when colour names are on', async () => {
    localStorage.setItem('pixels:settings', JSON.stringify({ colorNames: true }))
    await start()
    info = { c: 5, changes: 1, lastChange: Date.now() }
    const r = board().getBoundingClientRect()
    board().dispatchEvent(
      new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    )
    await expect.element(page.getByText('Noir ·')).toBeVisible()
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
    await expect.element(grid()).not.toBeChecked()
    press('c')
    await expect.element(page.getByRole('radio', { name: 'Noir' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}') // handled by the palette, not the board
    await expect.element(page.getByRole('radio', { name: 'Rouge vif' })).toHaveFocus()
    press('Escape')
    await expect.element(page.getByRole('radiogroup')).not.toBeInTheDocument()
    press('?')
    await expect.element(page.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    press('g') // help open: shortcuts are disabled
    await expect.element(grid()).not.toBeChecked()
    await userEvent.keyboard('{Escape}')
    press('x') // key without a shortcut
  })

  test('the settings are applied and remembered', async () => {
    await start()
    await page.getByRole('button', { name: 'Paramètres' }).click()
    await page.getByRole('checkbox', { name: 'Grille' }).click()
    await page.getByRole('checkbox', { name: 'Noms des couleurs' }).click()
    await page.getByText('150 %').click() // the label: the radio itself is visually hidden
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.5')
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('button', { name: /^Couleurs/ })).toHaveTextContent('Noir')
    expect(JSON.parse(localStorage.getItem('pixels:settings') ?? '')).toEqual({
      grid: false,
      colorNames: true,
      scale: 1.5,
    })
  })

  test('H shows the heatmap: no painting until H again', async () => {
    const { ws } = await start()
    board().focus()
    press('h')
    await expect.element(page.getByRole('group', { name: 'Légende de la carte de chaleur' })).toBeVisible()
    await announced('Carte de chaleur affichée')
    const r = board().getBoundingClientRect()
    click(r.left + r.width / 2, r.top + r.height / 2)
    await announced('Carte de chaleur affichée : appuie sur H pour revenir aux couleurs et peindre')
    expect(ws.sent).toHaveLength(0)
    await page.getByRole('button', { name: 'Carte de chaleur' }).click()
    await expect.element(page.getByRole('group', { name: 'Légende de la carte de chaleur' })).not.toBeInTheDocument()
    await announced('Couleurs affichées')
  })

  test('the heatmap scale tops at the most painted pixel', async () => {
    await start()
    const legend = () => page.getByRole('group', { name: 'Légende de la carte de chaleur' })
    hottest = { x: 0, y: 0, changes: 900 }
    press('h')
    await expect.element(legend().getByText('255', { exact: true })).toBeVisible() // chunk bytes stop at 255
    press('h')
    statsUp = false
    press('h')
    await expect.element(legend().getByText('255', { exact: true })).toBeVisible() // stats down: last top kept
    press('h')
    statsUp = true
    hottest = null // nothing painted yet
    press('h')
    await expect.element(legend().getByText('1', { exact: true })).toBeVisible()
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
    await expect.element(grid()).toBeChecked()
    await userEvent.keyboard('{Escape}')
  })

  test('the X / Y fields keep their keys and allow jumping', async () => {
    const { ws } = await start()
    const x = page.getByRole('spinbutton', { name: 'Coordonnée X' })
    await x.fill('40')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => {
      expect(fields()).toEqual([40, 0]) // end of the animated jump
    })
    await page.getByRole('spinbutton', { name: 'Coordonnée Y' }).fill('7') // only y changes
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => {
      expect(fields()).toEqual([40, 7])
    })
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click()
    await page.getByRole('button', { name: 'Dézoomer' }).click()
    await page.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
    await page.getByRole('button', { name: 'Raccourcis clavier' }).click()
    await expect.element(page.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await x.click()
    await userEvent.keyboard('{Enter}')
    expect(ws.sent).toEqual([]) // Enter in a field: jump, no pixel
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
