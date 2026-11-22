import { describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import { config } from '../test/fakes'
import AboutDialog from './AboutDialog.svelte'
import DownloadDialog from './DownloadDialog.svelte'
import HelpDialog from './HelpDialog.svelte'
import JumpPanel from './JumpPanel.svelte'
import NavControls from './NavControls.svelte'
import Palette from './Palette.svelte'
import Quota from './Quota.svelte'
import ServerDown from './ServerDown.svelte'
import SettingsDialog from './SettingsDialog.svelte'
import SitePanel from './SitePanel.svelte'
import Toolbar from './Toolbar.svelte'

describe('NavControls', () => {
  test('each button calls its action', async () => {
    const props = {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
    }
    const screen = await render(NavControls, props)
    await screen.getByRole('button', { name: 'Zoomer' }).click()
    await screen.getByRole('button', { name: 'Dézoomer' }).click()
    await screen.getByRole('button', { name: 'Recentrer sur 0, 0' }).click()
    await screen.getByRole('button', { name: "Télécharger l'image" }).click()
    await screen.getByRole('button', { name: 'Paramètres' }).click()
    await screen.getByRole('button', { name: 'Raccourcis clavier' }).click()
    for (const fn of Object.values(props)) expect(fn).toHaveBeenCalledOnce()
  })

  test('shows the label and shortcut of a focused button', async () => {
    const screen = await render(NavControls, {
      onzoomin: vi.fn(),
      onzoomout: vi.fn(),
      onrecenter: vi.fn(),
      ondownload: vi.fn(),
      onsettings: vi.fn(),
      onhelp: vi.fn(),
    })
    // Icon keys are read by their name ("plus"), text keys as they are.
    const tips = {
      Zoomer: 'Zoomer plus',
      Dézoomer: 'Dézoomer moins',
      'Recentrer sur 0, 0': 'Recentrer sur 0, 0 0',
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
    const dialog = screen.getByRole('dialog', { includeHidden: true })
    expect(screen.component.isOpen()).toBe(false)
    screen.component.open()
    await expect.element(screen.getByRole('heading', { name: 'Raccourcis clavier' })).toBeVisible()
    await expect.element(screen.getByText('Déplacer de 10 pixels')).toBeVisible()
    await screen.getByRole('button', { name: 'Fermer' }).click()
    expect(screen.component.isOpen()).toBe(false)

    screen.component.open()
    await userEvent.keyboard('{Escape}')
    expect(screen.component.isOpen()).toBe(false)

    screen.component.open()
    await screen.getByRole('heading').click() // inside the dialog: stays open
    expect(screen.component.isOpen()).toBe(true)
    ;(dialog.element() as HTMLDialogElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) // the backdrop
    expect(screen.component.isOpen()).toBe(false)
  })
})

describe('JumpPanel', () => {
  const base = { position: { x: 3, y: -4 }, info: null, colorLabel: null, now: 100_000, onjump: vi.fn() }

  test('the fields follow the position, except while typing', async () => {
    const onjump = vi.fn()
    const screen = await render(JumpPanel, { ...base, onjump })
    const x = screen.getByRole('spinbutton', { name: 'Coordonnée X' })
    const y = screen.getByRole('spinbutton', { name: 'Coordonnée Y' })
    await expect.element(x).toHaveValue(3)
    await expect.element(y).toHaveValue(-4)

    await x.fill('-12')
    await screen.rerender({ position: { x: 7, y: 7 } }) // typing: the fields do not move
    await expect.element(x).toHaveValue(-12)
    await y.click() // focus from one field to the other: still typing
    await y.fill('5')
    await userEvent.keyboard('{Enter}')
    expect(onjump).toHaveBeenCalledWith(-12, 5)
    await expect.element(x).toHaveValue(7) // typing done: following again

    // Decimal or empty, in either field: nothing
    for (const [vx, vy] of [
      ['1.5', '2'],
      ['1', '2.5'],
      ['', '2'],
      ['1', ''],
    ]) {
      await x.fill(vx)
      await y.fill(vy)
      await screen.getByRole('button', { name: 'Aller à ces coordonnées' }).click()
    }
    expect(onjump).toHaveBeenCalledOnce()
    ;(document.activeElement as HTMLElement).blur()

    await x.click()
    await userEvent.keyboard('a') // other key: nothing special
    await userEvent.keyboard('{Escape}') // Escape cancels
    await expect.element(x).not.toHaveFocus()
    await expect.element(x).toHaveValue(7)
  })

  test('shows the history', async () => {
    const screen = await render(JumpPanel, {
      ...base,
      info: { x: 3, y: -4, c: 2, changes: 3, lastChange: 100_000 - 120_000 },
    })
    await expect.element(screen.getByText('3 changements · dernier il y a 2 minutes')).toBeVisible()
    await screen.rerender({ info: { x: 3, y: -4, c: 2, changes: 1, lastChange: 40_000 } })
    await expect.element(screen.getByText('1 changement · dernier il y a 1 minute')).toBeVisible()
    await screen.rerender({ info: { x: 3, y: -4, c: 2, changes: 0, lastChange: null } })
    await expect.element(screen.getByText('Peint avant le suivi des changements')).toBeVisible()
    await screen.rerender({ info: { x: 3, y: -4, c: 0, changes: 0, lastChange: null } })
    await expect.element(screen.getByText('Jamais peint')).toBeVisible()
    await screen.rerender({ colorLabel: 'Noir', info: { x: 3, y: -4, c: 5, changes: 0, lastChange: null } })
    await expect.element(screen.getByText('Noir ·')).toBeVisible()
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
  test('named radio buttons, arrow navigation', async () => {
    const screen = await render(Palette, { rows: config.palette, color: 1, colorNames: false })
    const black = screen.getByRole('radio', { name: 'Noir' })
    await expect.element(black).toBeChecked()
    await expect.element(black).toHaveAttribute('tabindex', '0')
    screen.component.focus()
    await expect.element(black).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(screen.getByRole('radio', { name: 'Bleu vif' })).toHaveFocus()
    await expect.element(screen.getByRole('radio', { name: 'Bleu vif' })).toBeChecked()
    await userEvent.keyboard('x') // other key: nothing
    await expect.element(screen.getByRole('radio', { name: 'Bleu vif' })).toBeChecked()

    await screen.getByRole('radio', { name: 'Blanc' }).click()
    await expect.element(screen.getByRole('radio', { name: 'Blanc' })).toBeChecked()
  })

  test('writes the selected colour name when colour names are on', async () => {
    const screen = await render(Palette, { rows: config.palette, color: 1, colorNames: false })
    expect(screen.container.querySelector('.caption')).toBeNull()
    await screen.rerender({ colorNames: true })
    await expect.element(screen.getByText('Noir', { exact: true })).toBeVisible()
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
    colorNames: false,
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
    await expect.element(button).toHaveAccessibleName('Couleurs, couleur actuelle : Rouge vif')

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

  test('writes the colour name next to the swatch when colour names are on', async () => {
    const screen = await render(Toolbar, { ...props, colorNames: true })
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
    const screen = await render(SitePanel, { onabout })
    await expect.element(screen.getByText('Pixels')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: 'Faire un don' })).toBeVisible()
    await screen.getByRole('button', { name: 'À propos' }).click()
    expect(onabout).toHaveBeenCalledOnce()
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
    const settings = { grid: true, colorNames: false, scale: 1 }
    const screen = await render(SettingsDialog, { settings })
    screen.component.open()
    const grid = screen.getByRole('checkbox', { name: 'Grille' })
    await expect.element(grid).toBeChecked()
    await expect.element(grid).toHaveAccessibleDescription(/touche G/)
    await grid.click()
    await screen.getByRole('checkbox', { name: 'Noms des couleurs' }).click()
    await screen.getByText('125 %').click() // the label: the radio itself is visually hidden
    expect(settings).toEqual({ grid: false, colorNames: true, scale: 1.25 })
  })
})

describe('DownloadDialog', () => {
  test('downloads in the chosen format and size, says when it is busy or failed', async () => {
    let finish = (): void => undefined
    const ondownload = vi.fn<(type: string, scale: number) => Promise<void>>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const screen = await render(DownloadDialog, { width: 1280, height: 720, ondownload })
    screen.component.open()
    await expect.element(screen.getByText(/1280 × 720 pixels/)).toBeVisible()
    // The labels: the radios themselves are visually hidden.
    await screen.getByText('×3').click()
    await expect.element(screen.getByText(/3840 × 2160 pixels/)).toBeVisible()
    await screen.getByText('JPEG').click()
    await expect.element(screen.getByText(/un peu flous/)).toBeVisible()
    const button = screen.getByRole('button', { name: 'Télécharger' })
    const status = screen.getByRole('status')
    await button.click()
    expect(ondownload).toHaveBeenCalledWith('image/jpeg', 3)
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
