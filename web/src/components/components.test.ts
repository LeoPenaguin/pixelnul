import { describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import type { Stats } from '../lib/api'
import '../app.css' // the dialog overlay needs its size to be clicked
import { config, stubFetch } from '../test/fakes'
import AboutDialog from './AboutDialog.svelte'
import AccountDialog from './AccountDialog.svelte'
import DownloadDialog from './DownloadDialog.svelte'
import HeatLegend from './HeatLegend.svelte'
import HelpDialog from './HelpDialog.svelte'
import PixelPanel from './PixelPanel.svelte'
import NavControls from './NavControls.svelte'
import Palette from './Palette.svelte'
import Quota from './Quota.svelte'
import ServerDown from './ServerDown.svelte'
import SettingsDialog from './SettingsDialog.svelte'
import SitePanel from './SitePanel.svelte'
import StatsDialog from './StatsDialog.svelte'
import Toolbar from './Toolbar.svelte'

describe('NavControls', () => {
  test('each button calls its action', async () => {
    const props = {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      onheat: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
    }
    const screen = await render(NavControls, { ...props, heat: true })
    await screen.getByRole('button', { name: 'Zoomer' }).click()
    await screen.getByRole('button', { name: 'Dézoomer' }).click()
    await screen.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
    await screen.getByRole('button', { name: 'Heatmap' }).click()
    await screen.getByRole('button', { name: "Télécharger l'image" }).click()
    await screen.getByRole('button', { name: 'Paramètres' }).click()
    await screen.getByRole('button', { name: 'Raccourcis clavier' }).click()
    for (const fn of Object.values(props)) expect(fn).toHaveBeenCalledOnce()
    await expect.element(screen.getByRole('button', { name: 'Heatmap' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'Zoomer' })).not.toHaveAttribute('aria-pressed')
  })

  test('shows the label and shortcut of a focused button', async () => {
    const screen = await render(NavControls, {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      heat: false,
      onheat: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
    })
    // Icon keys are read by their name ("plus"), text keys as they are.
    const tips = {
      Zoomer: 'Zoomer plus',
      Dézoomer: 'Dézoomer moins',
      'Recentrer sur 0, 0': 'Recentrer sur 0, 0 0',
      Heatmap: 'Heatmap H',
      Paramètres: 'Paramètres', // no shortcut
      'Raccourcis clavier': 'Raccourcis clavier ?',
    }
    for (const [name, description] of Object.entries(tips)) {
      const button = screen.getByRole('button', { name })
      button.element().focus()
      await expect.element(button).toHaveAccessibleDescription(description)
    }
  })
})

describe('HelpDialog', () => {
  test('opens, closes with the button, Escape or a click outside', async () => {
    const screen = await render(HelpDialog)
    const dialog = page.getByRole('dialog')
    await expect.element(dialog).not.toBeInTheDocument()
    screen.component.open()
    await expect.element(page.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    await expect.element(page.getByText('Déplacer de 10 pixels')).toBeVisible()
    await page.getByRole('button', { name: 'Fermer' }).click()
    await expect.element(dialog).not.toBeInTheDocument()

    screen.component.open()
    await expect.element(dialog).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()

    screen.component.open()
    await page.getByRole('heading').click() // inside the dialog: stays open
    await expect.element(dialog).toBeVisible()
    const overlay = document.querySelector<HTMLElement>('[data-slot=dialog-overlay]')!
    await userEvent.click(overlay, { position: { x: 5, y: 5 } }) // outside
    await expect.element(dialog).not.toBeInTheDocument()
  })
})

describe('PixelPanel', () => {
  const base = { position: { x: 3, y: -4 }, info: null, color: null, now: 100_000 }

  test('shows the coordinates', async () => {
    const screen = await render(PixelPanel, base)
    await expect.element(screen.getByText('-4')).toBeVisible()
    await screen.rerender({ position: { x: 7, y: 8 } })
    await expect.element(screen.getByText('8')).toBeVisible()
  })

  test('shows the colour and the history', async () => {
    const screen = await render(PixelPanel, {
      ...base,
      color: '#000000',
      info: { x: 3, y: -4, c: 5, changes: 3, lastChange: 100_000 - 120_000, by: 'Minou' },
    })
    await expect.element(screen.getByText('Noir · 3 changements')).toBeVisible()
    await expect.element(screen.getByText('il y a 2 minutes par Minou')).toBeVisible()
    await screen.rerender({ info: { x: 3, y: -4, c: 5, changes: 1, lastChange: 40_000, by: null } })
    await expect.element(screen.getByText('il y a 1 minute')).toBeVisible()
    await screen.rerender({ color: null }) // colour not known (yet): no name, no swatch
    await expect.element(screen.getByText('· 1 changement')).toBeVisible()
    await screen.rerender({ color: '#000000' })
    await screen.rerender({ info: { x: 3, y: -4, c: 5, changes: 0, lastChange: null, by: null } })
    await expect.element(screen.getByText('Peint avant le suivi des changements')).toBeVisible()
    await screen.rerender({ color: '#FFFFFF', info: { x: 3, y: -4, c: 0, changes: 0, lastChange: null, by: null } })
    await expect.element(screen.getByText('Jamais peint')).toBeVisible()
  })
})

describe('ServerDown', () => {
  test('explains the outage and that the app retries on its own', async () => {
    const screen = await render(ServerDown)
    const alert = screen.getByRole('alert')
    await expect.element(alert.getByRole('heading', { name: 'Petit souci technique' })).toBeVisible()
    await expect.element(alert.getByText(/pas besoin de recharger la page/)).toBeVisible()
  })
})

describe('Palette', () => {
  test('a rule sets the first and the last rows apart', async () => {
    const one = ['#FFFFFF']
    await render(Palette, { rows: [one, one, one, one], color: 0, onpick: vi.fn(), onclose: vi.fn() })
    expect(document.querySelectorAll('.rule')).toHaveLength(2)
  })

  test('named radio buttons, arrow navigation', async () => {
    const screen = await render(Palette, { rows: config.palette, color: 1, onpick: vi.fn(), onclose: vi.fn() })
    const black = screen.getByRole('radio', { name: 'Noir' })
    await expect.element(black).toBeChecked()
    await expect.element(black).toHaveAttribute('tabindex', '0')
    screen.component.focus()
    await expect.element(black).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(screen.getByRole('radio', { name: 'Bleu' })).toHaveFocus()
    await expect.element(screen.getByRole('radio', { name: 'Bleu' })).toBeChecked()
    await userEvent.keyboard('x') // other key: nothing
    await expect.element(screen.getByRole('radio', { name: 'Bleu' })).toBeChecked()

    await screen.getByRole('radio', { name: 'Blanc' }).click()
    await expect.element(screen.getByRole('radio', { name: 'Blanc' })).toBeChecked()
  })

  test('writes the selected colour name, or the hovered one', async () => {
    const screen = await render(Palette, { rows: config.palette, color: 1, onpick: vi.fn(), onclose: vi.fn() })
    const caption = screen.container.querySelector<HTMLElement>('.caption')
    await expect.element(caption).toHaveTextContent('Noir')
    await userEvent.hover(screen.getByRole('radio', { name: 'Bleu' }))
    await expect.element(caption).toHaveTextContent('Bleu')
    await userEvent.unhover(screen.getByRole('radio', { name: 'Bleu' }))
    await expect.element(caption).toHaveTextContent('Noir')
  })
})

describe('Quota', () => {
  test('available pixels and refill, read by screen readers', async () => {
    const rules = { burst: 3, refillMs: 1000 }
    const screen = await render(Quota, { rules, snapshot: { n: 3, at: 0 }, now: 0 })
    await expect.element(screen.getByText('3 pixels disponibles sur 3')).toBeInTheDocument()
    await screen.rerender({ snapshot: { n: 0.5, at: 0 } })
    await expect.element(screen.getByText('0 pixel disponible sur 3, prochain dans 1 secondes')).toBeInTheDocument()
  })

  test('fills one block per available pixel and the next one by its refill', async () => {
    const screen = await render(Quota, { rules: { burst: 3, refillMs: 1000 }, snapshot: { n: 1.5, at: 0 }, now: 0 })
    const fills = [...screen.container.querySelectorAll<HTMLElement>('.fill')].map((f) => f.style.height)
    expect(fills).toEqual(['100%', '50%', '0%'])
    await expect.element(screen.getByText('1', { exact: true })).toBeVisible()
  })

  test('animates a refill, not a painted pixel', async () => {
    const screen = await render(Quota, { rules: { burst: 3, refillMs: 1000 }, snapshot: { n: 1.5, at: 0 }, now: 0 })
    const fill = () => screen.container.querySelectorAll('.fill')[1]
    expect(fill()).not.toHaveClass('rising')
    await screen.rerender({ now: 250 }) // refilling
    expect(fill()).toHaveClass('rising')
    await screen.rerender({ snapshot: { n: 0.75, at: 250 } }) // a pixel painted
    expect(fill()).not.toHaveClass('rising')
  })
})

describe('Toolbar', () => {
  const props = {
    rows: config.palette,
    color: 1,
    open: false,
    quota: { burst: 2, refillMs: 1000 },
    snapshot: { n: 2, at: 0 },
    now: 0,
  }

  test('opens the palette with focus inside, closes it handing focus back', async () => {
    const screen = await render(Toolbar, props)
    const button = screen.getByRole('button', { name: /^Couleurs/ })
    await expect.element(button).toHaveAccessibleName('Couleurs, couleur actuelle : Noir')
    await expect.element(button).toHaveAttribute('aria-expanded', 'false')
    await button.click()
    await expect.element(screen.getByRole('radio', { name: 'Noir' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(button).toHaveAccessibleName('Couleurs, couleur actuelle : Rouge')

    screen.component.close() // focus in the palette: handed back to the button
    await expect.element(button).toHaveFocus()
    await expect.element(screen.getByRole('radiogroup')).not.toBeInTheDocument()

    await screen.component.toggle()
    await screen.component.toggle() // second call: closes
    await expect.element(screen.getByRole('radiogroup')).not.toBeInTheDocument()

    await screen.component.toggle()
    ;(document.activeElement as HTMLElement).blur()
    screen.component.close() // focus elsewhere: left alone
    await expect.element(button).not.toHaveFocus()

    await expect.element(screen.getByText('2 pixels disponibles sur 2')).toBeInTheDocument()
  })

  test('a click on a colour picks it and closes the palette, focus back on the button', async () => {
    const screen = await render(Toolbar, props)
    const button = screen.getByRole('button', { name: /^Couleurs/ })
    await button.click()
    await screen.getByRole('radio', { name: 'Blanc' }).click()
    await expect.element(screen.getByRole('radiogroup')).not.toBeInTheDocument()
    await expect.element(button).toHaveAccessibleName('Couleurs, couleur actuelle : Blanc')
    await expect.element(button).toHaveFocus()
  })

  test('the close cross closes the palette, focus back on the button', async () => {
    const screen = await render(Toolbar, props)
    const button = screen.getByRole('button', { name: /^Couleurs/ })
    await button.click()
    await screen.getByRole('button', { name: 'Fermer' }).click()
    await expect.element(screen.getByRole('radiogroup')).not.toBeInTheDocument()
    await expect.element(button).toHaveFocus()
  })

  test('writes the colour name next to the swatch', async () => {
    const screen = await render(Toolbar, props)
    await expect.element(screen.getByRole('button', { name: /^Couleurs/ })).toHaveTextContent('Noir')
  })

  test('without a limit, no gauge', async () => {
    const screen = await render(Toolbar, { ...props, quota: null })
    await expect.element(screen.getByRole('button', { name: /^Couleurs/ })).toBeVisible()
    await expect.element(screen.getByText(/disponible/)).not.toBeInTheDocument()
  })
})

describe('SitePanel', () => {
  test('shows the site name, opens the about dialog and links to donations', async () => {
    const onabout = vi.fn()
    const onstats = vi.fn()
    const screen = await render(SitePanel, { onabout, onstats, auth: false, user: null, onaccount: vi.fn() })
    await expect.element(screen.getByText('Pixels')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: 'Faire un don' })).toBeVisible()
    await screen.getByRole('button', { name: 'À propos' }).click()
    expect(onabout).toHaveBeenCalledOnce()
    await screen.getByRole('button', { name: 'Stats' }).click()
    expect(onstats).toHaveBeenCalledOnce()
  })

  test('sign-in on: a sign-in button, then the pseudo once signed in', async () => {
    const onaccount = vi.fn()
    const props = { onabout: vi.fn(), onstats: vi.fn(), auth: true, onaccount }
    const screen = await render(SitePanel, { ...props, user: null })
    await screen.getByRole('button', { name: 'Se connecter' }).click()
    expect(onaccount).toHaveBeenCalledOnce()
    await screen.rerender({ ...props, user: { id: 'u1', pseudo: '' } })
    await expect.element(screen.getByRole('button', { name: 'Mon compte : pseudo à choisir' })).toBeVisible()
    await screen.rerender({ ...props, user: { id: 'u1', pseudo: 'Minou' } })
    await expect.element(screen.getByRole('button', { name: 'Mon compte : Minou' })).toHaveTextContent('Minou')
  })
})

describe('AccountDialog', () => {
  const props = () => ({
    onsave: vi.fn(() => Promise.resolve<string | null>(null)),
    onsignout: vi.fn(() => Promise.resolve()),
    ondelete: vi.fn(() => Promise.resolve()),
  })

  test('signed out: explains and links to Google', async () => {
    const screen = await render(AccountDialog, { ...props(), user: null })
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Continuer avec Google' }))
      .toHaveAttribute('href', '/api/auth/login')
  })

  test('first sign-in: the pseudo is chosen, a refusal says why', async () => {
    const p = props()
    p.onsave.mockResolvedValueOnce('ce pseudo est déjà pris')
    const screen = await render(AccountDialog, { ...p, user: { id: 'u1', pseudo: '' } })
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'Choisis ton pseudo' })).toBeVisible()
    const input = screen.getByRole('textbox', { name: 'Pseudo' })
    await expect.element(input).toHaveFocus()
    await input.fill(' Minou ')
    await screen.getByRole('button', { name: 'Enregistrer' }).click()
    expect(p.onsave).toHaveBeenCalledWith('Minou')
    await expect.element(screen.getByRole('alert')).toHaveTextContent('ce pseudo est déjà pris')
    await expect.element(input).toHaveAttribute('aria-invalid', 'true')
    await screen.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })

  test('signed in: signs out, or deletes after a confirmation', async () => {
    const p = props()
    const screen = await render(AccountDialog, { ...p, user: { id: 'u1', pseudo: 'Minou' } })
    screen.component.open()
    await expect.element(screen.getByRole('textbox', { name: 'Pseudo' })).toHaveValue('Minou')
    await screen.getByRole('button', { name: 'Se déconnecter' }).click()
    expect(p.onsignout).toHaveBeenCalledOnce()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()

    screen.component.open()
    await screen.getByRole('button', { name: 'Supprimer mon compte' }).click()
    await screen.getByRole('button', { name: 'Annuler' }).click()
    await screen.getByRole('button', { name: 'Supprimer mon compte' }).click()
    await expect.element(screen.getByText(/Tes pixels restent sur la toile/)).toBeVisible()
    await screen.getByRole('button', { name: 'Supprimer définitivement' }).click()
    expect(p.ondelete).toHaveBeenCalledOnce()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AboutDialog', () => {
  test('opens on the site rules with a link to the code', async () => {
    const screen = await render(AboutDialog)
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'À propos' })).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/LeoPenaguin/pixels')
  })
})

describe('SettingsDialog', () => {
  test('changes the settings it is bound to', async () => {
    const settings = { grid: true, scale: 1 }
    const screen = await render(SettingsDialog, { settings })
    screen.component.open()
    const grid = screen.getByRole('checkbox', { name: 'Grille' })
    await expect.element(grid).toBeChecked()
    await expect.element(grid).toHaveAccessibleDescription(/touche G/)
    await grid.click()
    const size = screen.getByRole('radio', { name: '125 %' })
    await size.click()
    await size.click() // the chosen size again: ignored, it stays chosen
    expect(settings).toEqual({ grid: false, scale: 1.25 })
  })
})

describe('DownloadDialog', () => {
  test('downloads in the chosen format and size, says when it is busy or failed', async () => {
    let finish = (): void => undefined
    const ondownload = vi.fn<(scale: number) => Promise<void>>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const screen = await render(DownloadDialog, { width: 1280, height: 720, ondownload })
    screen.component.open()
    await expect.element(screen.getByText(/1280 × 720 pixels/)).toBeVisible()
    const x3 = screen.getByRole('radio', { name: '×3' })
    await x3.click()
    await x3.click() // the chosen option again: stays chosen
    await expect.element(screen.getByText(/3840 × 2160 pixels/)).toBeVisible()
    const button = screen.getByRole('button', { name: 'Télécharger' })
    const status = screen.getByRole('status')
    await button.click()
    expect(ondownload).toHaveBeenCalledWith(3)
    await expect.element(status).toHaveTextContent("Préparation de l'image…")
    await expect.element(button).toBeDisabled()
    finish()
    await expect.element(button).toBeEnabled()
    await expect.element(status).toBeEmptyDOMElement()

    ondownload.mockRejectedValueOnce(new Error('offline'))
    await button.click()
    await expect.element(status).toHaveTextContent('Échec du téléchargement, réessaie dans un instant.')
    screen.component.open() // reopening clears the error
    await expect.element(status).toBeEmptyDOMElement()
  })
})

describe('HeatLegend', () => {
  test('runs from 1 to the board maximum', async () => {
    const screen = await render(HeatLegend, { max: 42 })
    const legend = screen.getByRole('group', { name: 'Légende de la heatmap' })
    for (const label of ['1', '42']) await expect.element(legend.getByText(label, { exact: true })).toBeVisible()
  })
})

describe('StatsDialog', () => {
  const colors = config.palette.flat() // white, black, red, blue, green
  const stats: Stats = {
    placed: 1234,
    painted: 5,
    pixels: 921_600,
    online: 3,
    hottest: { x: -4, y: 7, changes: 12 },
    colors: [900_000, 30, 10, 0, 60],
    hours: [...Array<number>(22).fill(0), 5, 1],
    top: [
      { pseudo: 'Minou', n: 12 },
      { pseudo: 'Pixel', n: 1 },
    ],
  }

  test('shows the figures, the activity, the colours and jumps to the hottest pixel', async () => {
    let answer = () => Response.json(stats)
    stubFetch({ '/api/stats': () => answer() })
    const onjump = vi.fn()
    const screen = await render(StatsDialog, { colors, onjump })
    await screen.component.open()
    await expect.element(screen.getByText('1 234', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('< 0,1 %')).toBeVisible() // 5 of 921,600 painted: not "0 %"
    await expect.element(screen.getByText('connectés')).toBeVisible()
    await expect.element(screen.getByText('6 pixels en 24 h')).toBeVisible()
    document.querySelectorAll('.slot')[22].dispatchEvent(new MouseEvent('mouseenter'))
    await expect.element(screen.getByText(/: 5 pixels$/)).toBeVisible()
    document.querySelector('.hours')?.dispatchEvent(new MouseEvent('mouseleave'))
    await expect.element(screen.getByText('6 pixels en 24 h')).toBeVisible()
    // Largest first, white left out, empty colours too.
    expect([...document.querySelectorAll('.colors .name')].map((n) => n.textContent)).toEqual(['Vert', 'Noir', 'Rouge'])
    expect([...document.querySelectorAll('.top li')].map((n) => n.textContent)).toEqual([
      '1 Minou 12 pixels',
      '2 Pixel 1 pixel',
    ])
    await expect.element(screen.getByText('-4, 7 · peint 12 fois')).toBeVisible()
    await screen.getByRole('button', { name: 'Y aller' }).click()
    expect(onjump).toHaveBeenCalledWith(-4, 7)
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument() // closed

    // An empty board, one connected tab.
    answer = () =>
      Response.json({
        ...stats,
        placed: 0,
        painted: 0,
        online: 1,
        hottest: null,
        colors: [921_600, 0, 0, 0, 0],
        hours: Array<number>(24).fill(0),
        top: [],
      })
    await screen.component.open()
    await expect.element(screen.getByText("Rien n'a encore été peint.")).toBeVisible()
    await expect.element(screen.getByText('connecté', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('0 %', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('0 pixel en 24 h')).toBeVisible()
    await expect.element(screen.getByText('Pixel le plus disputé')).not.toBeInTheDocument()
    await expect.element(screen.getByText("Meilleurs peintres aujourd'hui")).not.toBeInTheDocument()

    answer = () => new Response('', { status: 500 })
    await screen.component.open()
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Impossible de charger les statistiques pour le moment.')
  })

  test('says it is loading until the figures arrive', async () => {
    stubFetch({ '/api/stats': () => new Promise<Response>(() => undefined) })
    const screen = await render(StatsDialog, { colors, onjump: vi.fn() })
    void screen.component.open()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Chargement…')
  })
})
