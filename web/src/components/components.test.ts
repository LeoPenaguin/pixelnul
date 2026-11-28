import { describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import type { Stats } from '../lib/api'
import type { Point, Rect } from '../lib/engine/camera'
import '../app.css' // the dialog overlay needs its size to be clicked
import { config, stubFetch } from '../test/fakes'
import AboutDialog from './AboutDialog.svelte'
import AccountDialog from './AccountDialog.svelte'
import AdminDialog from './AdminDialog.svelte'
import ReportDialog from './ReportDialog.svelte'
import SelectionBar from './SelectionBar.svelte'
import StickerBar from './StickerBar.svelte'
import DownloadDialog from './DownloadDialog.svelte'
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
import WelcomeDialog from './WelcomeDialog.svelte'

describe('NavControls', () => {
  test('each button calls its action', async () => {
    const props = {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      ongrid: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
      onreport: vi.fn(),
    }
    const screen = await render(NavControls, { ...props, grid: true })
    await expect.element(screen.getByRole('button', { name: 'Grille' })).toHaveAttribute('aria-pressed', 'true')
    await screen.getByRole('button', { name: 'Grille' }).click()
    await screen.getByRole('button', { name: 'Zoomer' }).click()
    await screen.getByRole('button', { name: 'Dézoomer' }).click()
    await screen.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
    await screen.getByRole('button', { name: "Télécharger l'image" }).click()
    await screen.getByRole('button', { name: 'Accessibilité' }).click()
    await screen.getByRole('button', { name: 'Raccourcis clavier' }).click()
    await screen.getByRole('button', { name: 'Signaler un contenu ou un bug' }).click()
    for (const fn of Object.values(props)) expect(fn).toHaveBeenCalledOnce()
  })

  test('shows the label and shortcut of a focused button', async () => {
    const screen = await render(NavControls, {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      grid: false,
      ongrid: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
      onreport: vi.fn(),
    })
    // Icon keys are read by their name ("plus"), text keys as they are.
    const tips = {
      Zoomer: 'Zoomer plus',
      Dézoomer: 'Dézoomer moins',
      'Recentrer sur 0, 0': 'Recentrer sur 0, 0 0',
      Grille: 'Grille G',
      Accessibilité: 'Accessibilité', // no shortcut
      'Signaler un contenu ou un bug': 'Signaler un contenu ou un bug',
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
  test('shows the site name and opens the about dialog and the stats', async () => {
    const onabout = vi.fn()
    const onstats = vi.fn()
    const screen = await render(SitePanel, {
      onabout,
      onstats,
      auth: false,
      user: null,
      onaccount: vi.fn(),
      onadmin: vi.fn(),
    })
    await expect.element(screen.getByText('pixelnul')).toBeInTheDocument()
    await expect.element(screen.getByRole('link', { name: 'Faire un don' })).not.toBeInTheDocument() // no donation page yet
    await screen.getByRole('button', { name: 'À propos' }).click()
    expect(onabout).toHaveBeenCalledOnce()
    await screen.getByRole('button', { name: 'Stats' }).click()
    expect(onstats).toHaveBeenCalledOnce()
  })

  test('sign-in on: a sign-in button, then the pseudo once signed in', async () => {
    const onaccount = vi.fn()
    const props = { onabout: vi.fn(), onstats: vi.fn(), auth: true, onaccount, onadmin: vi.fn() }
    const screen = await render(SitePanel, { ...props, user: null })
    await screen.getByRole('button', { name: 'Se connecter' }).click()
    expect(onaccount).toHaveBeenCalledOnce()
    await screen.rerender({ ...props, user: { id: 'u1', pseudo: '', admin: false, banned: false, provider: 'google' } })
    await expect.element(screen.getByRole('button', { name: 'Mon compte : pseudo à choisir' })).toBeVisible()
    await screen.rerender({
      ...props,
      user: { id: 'u1', pseudo: 'Minou', admin: false, banned: false, provider: 'google' },
    })
    await expect.element(screen.getByRole('button', { name: 'Mon compte : Minou' })).toHaveTextContent('Minou')
    await expect.element(screen.getByRole('button', { name: 'Modération' })).not.toBeInTheDocument()
  })

  test('an admin gets a moderation button', async () => {
    const onadmin = vi.fn()
    const user = { id: 'u1', pseudo: 'Modo', admin: true, banned: false, provider: 'google' }
    const screen = await render(SitePanel, {
      onabout: vi.fn(),
      onstats: vi.fn(),
      auth: true,
      user,
      onaccount: vi.fn(),
      onadmin,
    })
    await screen.getByRole('button', { name: 'Modération' }).click()
    expect(onadmin).toHaveBeenCalledOnce()
  })
})

describe('AdminDialog', () => {
  const report = { id: 'r1', x: 3, y: -4, reason: 'hate', comment: 'une croix', by: '', at: 0 }
  const props = () => ({
    now: 120_000,
    onreports: vi.fn(() => Promise.resolve([report, { ...report, id: 'r2', x: 9, comment: '', by: 'Minou' }])),
    ondismiss: vi.fn(() => Promise.resolve()),
    onjump: vi.fn(),
    onselect: vi.fn(),
    onban: vi.fn(() => Promise.resolve<string | null>(null)),
    onstamp: vi.fn(() => Promise.resolve<string | null>(null)),
    onstickers: vi.fn(),
  })

  test('lists the reports: goes to one, dismisses another', async () => {
    const p = props()
    const screen = await render(AdminDialog, p)
    screen.component.open()
    await expect.element(screen.getByText('3, -4 · il y a 2 minutes · anonyme')).toBeVisible()
    await expect.element(screen.getByText('une croix')).toBeVisible()
    await expect.element(screen.getByText('9, -4 · il y a 2 minutes · Minou')).toBeVisible()
    await screen.getByRole('button', { name: 'Classer le signalement en 9, -4' }).click()
    expect(p.ondismiss).toHaveBeenCalledWith('r2')
    await expect.element(screen.getByText('Signalement classé')).toBeVisible()
    await expect.element(screen.getByText(/Minou/)).not.toBeInTheDocument()
    p.ondismiss.mockRejectedValueOnce(new Error('down'))
    await screen.getByRole('button', { name: 'Classer le signalement en 3, -4' }).click()
    await expect.element(screen.getByText('Impossible pour le moment')).toBeVisible()
    await screen.getByRole('button', { name: 'Voir 3, -4' }).click()
    expect(p.onjump).toHaveBeenCalledWith(3, -4)
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })

  test('says when there is no report, or when they cannot load', async () => {
    const p = props()
    p.onreports.mockResolvedValueOnce([])
    const screen = await render(AdminDialog, p)
    screen.component.open()
    await expect.element(screen.getByText('Aucun signalement en attente.')).toBeVisible()
    screen.component.open()
    p.onreports.mockRejectedValueOnce(new Error('down'))
    screen.component.open()
    await expect.element(screen.getByText('Impossible pour le moment')).toBeVisible()
  })

  test('closes to select zones on the board', async () => {
    const p = props()
    const screen = await render(AdminDialog, p)
    screen.component.open()
    await screen.getByRole('button', { name: 'Sélectionner sur la toile' }).click()
    expect(p.onselect).toHaveBeenCalledOnce()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })

  test('lays an image centred on the chosen point, then says it is done or why not', async () => {
    const p = props()
    const screen = await render(AdminDialog, p)
    screen.component.open()
    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Image'), file)
    await screen.getByRole('spinbutton', { name: 'Centre en x' }).fill('-20')
    await screen.getByRole('spinbutton', { name: 'y' }).fill('7')
    await screen.getByRole('button', { name: 'Poser' }).click()
    expect(p.onstamp).toHaveBeenCalledWith(expect.objectContaining({ name: 'logo.png' }), -20, 7)
    await expect.element(screen.getByText('Image posée')).toBeVisible()
    p.onstamp.mockResolvedValueOnce('Image illisible')
    await screen.getByRole('button', { name: 'Poser' }).click()
    await expect.element(screen.getByText('Image illisible')).toBeVisible()
  })

  test('closes to paste stickers on the board', async () => {
    const p = props()
    const screen = await render(AdminDialog, p)
    screen.component.open()
    await screen.getByRole('button', { name: 'Coller des stickers' }).click()
    expect(p.onstickers).toHaveBeenCalledOnce()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  })

  test('bans and unbans a pseudo, says when it is unknown', async () => {
    const p = props()
    const screen = await render(AdminDialog, p)
    screen.component.open()
    const unban = screen.getByRole('button', { name: 'Débannir' })
    await expect.element(unban).toBeDisabled()
    await screen.getByRole('textbox', { name: 'Pseudo' }).fill(' Kevin ')
    await screen.getByRole('button', { name: 'Bannir' }).click()
    expect(p.onban).toHaveBeenCalledWith('Kevin', true)
    await expect.element(screen.getByText('Kevin : compte banni')).toBeVisible()
    await unban.click()
    expect(p.onban).toHaveBeenCalledWith('Kevin', false)
    await expect.element(screen.getByText('Kevin : bannissement levé')).toBeVisible()
    p.onban.mockResolvedValueOnce('aucun compte avec ce pseudo')
    await screen.getByRole('button', { name: 'Bannir' }).click()
    await expect.element(screen.getByText('aucun compte avec ce pseudo')).toBeVisible()
  })
})

describe('ReportDialog', () => {
  test('reports the content around the pixel, frozen on open, then thanks', async () => {
    const onsend = vi.fn(() => Promise.resolve<string | null>(null))
    const screen = await render(ReportDialog, { position: { x: 3, y: -4 }, onsend })
    screen.component.open()
    await screen.rerender({ position: { x: 50, y: 50 } }) // the pointer moved since
    await expect.element(screen.getByText(/Le contenu autour de 3, -4/)).toBeVisible()
    await screen.getByRole('radio', { name: 'Informations personnelles' }).click()
    await screen.getByRole('textbox', { name: 'Précisions (facultatif)' }).fill('  un numéro  ')
    await screen.getByRole('button', { name: 'Envoyer' }).click()
    expect(onsend).toHaveBeenCalledWith(3, -4, 'personal', 'un numéro')
    await expect.element(screen.getByText("Merci, c'est envoyé : la modération va regarder.")).toBeVisible()
  })

  test('a bug needs a description, not a place; a refusal is shown', async () => {
    const onsend = vi.fn(() => Promise.resolve<string | null>('Impossible pour le moment'))
    const screen = await render(ReportDialog, { position: { x: 0, y: 0 }, onsend })
    screen.component.open()
    await screen.getByRole('radio', { name: 'Un bug sur le site' }).click()
    await expect.element(screen.getByText(/Le contenu autour/)).not.toBeInTheDocument()
    const description = screen.getByRole('textbox', { name: 'Description' })
    await expect.element(description).toBeRequired()
    await description.fill('la palette reste fermée')
    await screen.getByRole('button', { name: 'Envoyer' }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Impossible pour le moment')
    await expect.element(description).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('SelectionBar', () => {
  const props = () => ({
    rects: [] as Rect[],
    corner: null as Point | null,
    colorName: 'Noir',
    onfill: vi.fn(() => Promise.resolve<string | null>(null)),
    onclear: vi.fn(),
    ondone: vi.fn(),
  })

  test('says how to draw, then the pending corner, then what is selected', async () => {
    const screen = await render(SelectionBar, props())
    await expect.element(screen.getByText(/Glisse sur la toile/)).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Remplir en Noir' })).toBeDisabled()
    await expect.element(screen.getByRole('button', { name: 'Tout effacer' })).toBeDisabled()
    await screen.rerender({ corner: { x: 2, y: -1 } })
    await expect.element(screen.getByText('Premier coin en 2, -1 : choisis le coin opposé')).toBeVisible()
    await screen.rerender({
      corner: null,
      rects: [
        { x0: 0, y0: 0, x1: 1, y1: 1 },
        { x0: 5, y0: 5, x1: 5, y1: 5 },
      ],
    })
    await expect.element(screen.getByText('2 zones · 5 pixels')).toBeVisible()
  })

  test('fills, clears and stops', async () => {
    const p = { ...props(), rects: [{ x0: 0, y0: 0, x1: 0, y1: 0 }] }
    const screen = await render(SelectionBar, p)
    await screen.getByRole('button', { name: 'Remplir en Noir' }).click()
    expect(p.onfill).toHaveBeenCalledOnce()
    await expect.element(screen.getByText('Zones repeintes')).toBeVisible()
    p.onfill.mockResolvedValueOnce('Trop grand : 65 536 pixels au plus')
    await screen.getByRole('button', { name: 'Remplir en Noir' }).click()
    await expect.element(screen.getByText('Trop grand : 65 536 pixels au plus')).toBeVisible()
    await screen.getByRole('button', { name: 'Tout effacer' }).click()
    await screen.getByRole('button', { name: 'Terminer' }).click()
    expect(p.onclear).toHaveBeenCalledOnce()
    expect(p.ondone).toHaveBeenCalledOnce()
  })
})

describe('AccountDialog', () => {
  const props = () => ({
    providers: ['google'],
    onsave: vi.fn(() => Promise.resolve<string | null>(null)),
    onsignout: vi.fn(() => Promise.resolve()),
    ondelete: vi.fn(() => Promise.resolve()),
  })

  test('signed out: explains and links to each provider, in order', async () => {
    const screen = await render(AccountDialog, { ...props(), user: null, providers: ['discord', 'unknown', 'google'] })
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
    const links = screen.getByRole('link').elements()
    expect(links.map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual([
      ['Continuer avec Discord', '/api/auth/discord/login'],
      ['Continuer avec Google', '/api/auth/google/login'],
    ])
  })

  test('first sign-in: the pseudo is chosen, a refusal says why', async () => {
    const p = props()
    p.onsave.mockResolvedValueOnce('ce pseudo est déjà pris')
    const screen = await render(AccountDialog, {
      ...p,
      user: { id: 'u1', pseudo: '', admin: false, banned: false, provider: 'google' },
    })
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
    const screen = await render(AccountDialog, {
      ...p,
      user: { id: 'u1', pseudo: 'Minou', admin: false, banned: false, provider: 'google' },
    })
    screen.component.open()
    await expect.element(screen.getByRole('textbox', { name: 'Pseudo' })).toHaveValue('Minou')
    await expect.element(screen.getByText('Connecté avec Google')).toBeVisible()
    await screen.rerender({ user: { id: 'u1', pseudo: 'Minou', admin: false, banned: false, provider: 'gone' } })
    await expect.element(screen.getByText(/Connecté avec/)).not.toBeInTheDocument()
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
    const screen = await render(AboutDialog, { onwelcome: vi.fn() })
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'À propos' })).toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'GitHub' }))
      .toHaveAttribute('href', 'https://github.com/LeoPenaguin/pixelnul')
  })

  test('closes to replay the welcome tour', async () => {
    const onwelcome = vi.fn()
    const screen = await render(AboutDialog, { onwelcome })
    screen.component.open()
    await screen.getByRole('button', { name: 'Revoir la présentation' }).click()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(onwelcome).toHaveBeenCalledOnce()
  })
})

describe('SettingsDialog', () => {
  test('changes the settings it is bound to', async () => {
    const settings = { grid: true, scale: 1 }
    const screen = await render(SettingsDialog, { settings })
    screen.component.open()
    await expect.element(screen.getByRole('checkbox', { name: 'Grille' })).not.toBeInTheDocument() // in the controls now
    const size = screen.getByRole('radio', { name: '125 %' })
    await size.click()
    await size.click() // the chosen size again: ignored, it stays chosen
    expect(settings).toEqual({ grid: true, scale: 1.25 })
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

describe('StatsDialog', () => {
  const colors = config.palette.flat() // white, black, red, blue, green
  const stats: Stats = {
    placed: 1234,
    painted: 5,
    pixels: 921_600,
    online: 3,
    visitors: 42,
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
    await expect.element(screen.getByText("visiteurs aujourd'hui")).toBeVisible()
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
        visitors: 1,
        hottest: null,
        colors: [921_600, 0, 0, 0, 0],
        hours: Array<number>(24).fill(0),
        top: [],
      })
    await screen.component.open()
    await expect.element(screen.getByText("Rien n'a encore été peint.")).toBeVisible()
    await expect.element(screen.getByText('connecté', { exact: true })).toBeVisible()
    await expect.element(screen.getByText("visiteur aujourd'hui")).toBeVisible()
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

describe('WelcomeDialog', () => {
  const minimap = () => document.createElement('canvas')

  test('tours the interface, back and forth, each step on its part of the screen', async () => {
    const props = { quota: { burst: 3, refillMs: 30_000 }, rows: config.palette, color: 1, report: true, minimap }
    const screen = await render(WelcomeDialog, props)
    const plan = () => document.querySelector('.plan')?.className
    screen.component.open('Minou')
    await expect.element(screen.getByRole('heading', { name: 'La toile' })).toBeVisible()
    await expect.element(screen.getByText('Bienvenue, Minou. 1280 × 720 pixels', { exact: false })).toBeVisible()
    await expect.element(screen.getByText('1 / 6')).toBeVisible()
    expect(plan()).toContain('board')
    await expect.element(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled()

    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'En bas : couleur et stock' })).toBeVisible()
    await expect
      .element(screen.getByText(/3 pixels d'affilée au plus, et elle en regagne un en 30 secondes/))
      .toBeVisible()
    expect(plan()).toContain('bottom')
    expect(document.querySelector('.shot .toolbar')).not.toBeNull() // the real toolbar, copied
    // Pictures only: the copies are neither read out nor clickable.
    await expect.element(screen.getByRole('button', { name: /^Couleurs/ })).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Précédent' }).click()
    await expect.element(screen.getByText('1 / 6')).toBeVisible()
    await screen.getByRole('button', { name: 'Suivant' }).click()

    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Un clic, un pixel' })).toBeVisible()
    expect(document.querySelector<HTMLElement>('.cells .on')?.style.background).toBe('rgb(0, 0, 0)') // black
    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'En bas à droite : les outils' })).toBeVisible()
    await expect
      .element(screen.getByText("signaler, afficher ou cacher la grille, l'accessibilité", { exact: false }))
      .toBeVisible()
    const shot = document.querySelector<HTMLElement>('.shot')
    expect(shot?.querySelector('.controls')).not.toBeNull()
    if (shot) shot.inert = false // were it not inert, its buttons would still do nothing
    shot?.querySelector<HTMLElement>('[aria-label="Zoomer"]')?.click()
    await expect.element(screen.getByRole('heading', { name: 'En bas à droite : les outils' })).toBeVisible()
    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'En haut à droite : la minicarte' })).toBeVisible()
    expect(document.querySelector<HTMLImageElement>('.shot img')?.src).toMatch(/^data:image\/png/)
    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Le drapeau : signaler' })).toBeVisible()
    await screen.getByRole('button', { name: 'Au travail' }).click()
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()

    screen.component.open('Matou') // again: back to the first step
    await expect.element(screen.getByText('Bienvenue, Matou.', { exact: false })).toBeVisible()
  })

  test('skips what is not there: stock, reports, the minimap on phones, the name when signed out', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true })) // small touch screen
    const screen = await render(WelcomeDialog, { quota: null, rows: [], color: 0, report: false, minimap })
    screen.component.open('')
    await expect
      .element(screen.getByText(/^1280 × 720 pixels, partagés par tout le monde, en direct\. Glisser/))
      .toBeVisible()
    await expect.element(screen.getByText('1 / 4')).toBeVisible()
    await screen.getByRole('button', { name: 'Suivant' }).click()
    await expect.element(screen.getByRole('heading', { name: 'En bas : la couleur' })).toBeVisible()
    expect(document.querySelector('.shot .toolbar')).toBeNull() // palette not loaded yet
    await screen.getByRole('button', { name: 'Suivant' }).click()
    await screen.getByRole('button', { name: 'Suivant' }).click()
    expect(document.querySelector('.shot [aria-label="Signaler un contenu ou un bug"]')).toBeNull()
    await expect
      .element(screen.getByText("télécharger l'image, afficher ou cacher la grille", { exact: false }))
      .toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Au travail' })).toBeVisible() // no minimap, no flag
    vi.unstubAllGlobals()
  })
})

describe('StickerBar', () => {
  test('shows every sticker, the picked one pressed; picks another, says what happened, stops', async () => {
    const props = { picked: 0, status: 'Chat collé en 1, 2', onpick: vi.fn(), ondone: vi.fn() }
    const screen = await render(StickerBar, props)
    await expect.element(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'Aubergine' })).toHaveAttribute('aria-pressed', 'false')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Chat collé en 1, 2')
    await screen.getByRole('button', { name: 'Étoile' }).click()
    expect(props.onpick).toHaveBeenCalledWith(2)
    await screen.getByRole('button', { name: 'Terminer' }).click()
    expect(props.ondone).toHaveBeenCalledOnce()
  })
})
