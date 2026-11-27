<!-- Welcome, after the first pseudo is chosen (or replayed from "À propos"): a tour of the interface, each step
     showing where a control sits on a screen plan, next to an inert copy of the real component. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Flag from '~icons/mingcute/flag-1-fill'
  import { plural } from '../lib/format'
  import type { QuotaRules } from '../lib/quota'
  import KeyCap from './KeyCap.svelte'
  import Modal from './Modal.svelte'
  import NavControls from './NavControls.svelte'
  import Toolbar from './Toolbar.svelte'
  import { Button } from './ui/button'
  import { Kbd } from './ui/kbd'

  // quota: null when unlimited. rows, color: the palette and current colour, for the toolbar copy (no rows
  // before the configuration loads). report: reports are on. minimap: the real one, copied when the tour opens.
  type Props = {
    quota: QuotaRules | null
    rows: string[][]
    color: number
    report: boolean
    minimap: () => HTMLCanvasElement
  }
  const { quota, rows, color, report, minimap }: Props = $props()

  const noop = () => undefined // the copies' buttons: inert, they do nothing

  type Zone = 'board' | 'bottom' | 'bottom-right' | 'top-right' // part of the screen plan to highlight
  type Step = { title: string; zone: Zone; body: Snippet; shot: Snippet }

  let modal: { open: () => void; close: () => void }
  let pseudo = $state('')
  let i = $state(0)
  let miniShot = $state('') // the minimap, as an image
  let phone = $state(false) // small touch screen: no minimap there

  const steps: Step[] = $derived([
    { title: 'La toile', zone: 'board', body: board, shot: none },
    { title: quota ? 'En bas : couleur et stock' : 'En bas : la couleur', zone: 'bottom', body: tools, shot: toolbar },
    { title: 'Un clic, un pixel', zone: 'board', body: click, shot: cell },
    { title: 'En bas à droite : réglages et outils', zone: 'bottom-right', body: nav, shot: controls },
    ...(phone ? [] : [{ title: 'En haut à droite : la minicarte', zone: 'top-right', body: map, shot: mini } as const]),
    ...(report ? [{ title: 'Le drapeau : signaler', zone: 'bottom-right', body: flag, shot: flagShot } as const] : []),
  ])
  const step = $derived(steps[i])
  const last = $derived(i === steps.length - 1)
  const greeting = $derived(pseudo ? `Bienvenue, ${pseudo}. ` : '')
  const toolsText = $derived(
    `Zoomer, dézoomer, revenir en 0, 0, télécharger l'image, ${report ? 'signaler, ' : ''}les réglages, les raccourcis clavier`,
  )
  const stockText = $derived(
    quota &&
      `La jauge compte tes pixels : ${plural(quota.burst, 'pixel')} d'affilée au plus, et elle en regagne un en ${plural(quota.refillMs / 1000, 'seconde')}.`,
  )

  /** name: the pseudo to greet, '' when signed out. */
  export function open(name: string) {
    pseudo = name
    i = 0
    miniShot = minimap().toDataURL()
    phone = matchMedia('(pointer: coarse) and (max-width: 640px)').matches
    modal.open()
  }
</script>

{#snippet board()}
  <p>
    {`${greeting}1280 × 720 pixels, partagés par tout le monde, en direct. Glisser pour s'y déplacer ; pincer, ou Ctrl + molette, pour zoomer.`}
  </p>
{/snippet}

{#snippet tools()}
  <p>Le carré de couleur ouvre la palette (touche <Kbd><KeyCap key="C" /></Kbd>).</p>
  {#if stockText}<p>{stockText}</p>{/if}
{/snippet}

{#snippet click()}
  <p>
    Un clic sur la toile pose un pixel de ta couleur. Il apparaît chez tout le monde, tout de suite. Au clavier : les
    flèches pour viser, Entrée pour poser.
  </p>
{/snippet}

{#snippet nav()}
  <!-- The text in its own element: Svelte would otherwise add a branch for it. -->
  <p><span>{toolsText}</span> (touche <Kbd><KeyCap key="?" /></Kbd>).</p>
{/snippet}

{#snippet map()}
  <p>La toile autour de toi, vue de loin. Le cadre, c'est ce que tu vois. Clique ou glisse dedans pour te déplacer.</p>
{/snippet}

{#snippet flag()}
  <p>
    Un dessin qui dérape, ou un bug : le drapeau l'envoie aux modérateurs. Pour un dessin, vise-le d'abord, la zone
    autour du pixel visé part avec le signalement.
  </p>
{/snippet}

{#snippet none()}{/snippet}

{#snippet toolbar()}
  {#if rows.length}
    <!-- Infinity: a full gauge (capped at the burst). -->
    <Toolbar {rows} {color} open={false} {quota} snapshot={{ n: Infinity, at: 0 }} now={0} />
  {/if}
{/snippet}

{#snippet cell()}
  <div class="cells">
    {#each { length: 25 }, k (k)}
      <span class:on={k === 12} style:background={k === 12 ? rows.flat()[color] : undefined}></span>
    {/each}
  </div>
{/snippet}

{#snippet controls()}
  <NavControls
    onzoomin={noop}
    onzoomout={noop}
    onrecenter={noop}
    ondownload={noop}
    onsettings={noop}
    onhelp={noop}
    onreport={report ? noop : undefined}
  />
{/snippet}

{#snippet mini()}
  <img class="panel mini" src={miniShot} alt="" />
{/snippet}

{#snippet flagShot()}
  <div class="panel flag"><Flag class="size-5.5" aria-hidden="true" /></div>
{/snippet}

<Modal bind:this={modal} title={step.title}>
  <!-- Pictures only: the text below says the same thing. The copies are inert: nothing to click or focus. -->
  <div class="figure" aria-hidden="true">
    <div class={`plan ${step.zone}`}>
      <span class="z top-left"></span>
      <span class="z top-right"></span>
      <span class="z bottom"></span>
      <span class="z bottom-right"></span>
    </div>
    <div class="shot" inert>{@render step.shot()}</div>
  </div>
  <!-- Read out at each step: the focus stays on the buttons. -->
  <div aria-live="polite">{@render step.body()}</div>
  <div class="row">
    <span class="count">{`${String(i + 1)} / ${String(steps.length)}`}</span>
    <Button variant="ghost" disabled={i === 0} onclick={() => i--}>Précédent</Button>
    {#if last}
      <Button onclick={() => modal.close()}>Au travail</Button>
    {:else}
      <Button onclick={() => i++}>Suivant</Button>
    {/if}
  </div>
</Modal>

<style>
  p {
    margin: 0 0 16px;
    font-weight: var(--font-weight-normal);
  }
  /* Plan on the left, the component on the right; same height at every step, so the buttons stay put. */
  .figure {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 16px;
    min-height: 96px;
    margin-bottom: 16px;
  }
  /* The screen, in 16:9: the board, the site panel, the minimap, the toolbar, the navigation. */
  .plan {
    position: relative;
    flex: none;
    width: 128px;
    height: 72px;
    border: var(--stroke) solid var(--ink);
    border-radius: 6px;
    background: var(--paper);
  }
  .z {
    position: absolute;
    border: 2px solid var(--ink);
    border-radius: 2px;
    background: var(--paper);
  }
  .z.top-left {
    top: 4px;
    left: 4px;
    width: 40px;
    height: 10px;
  }
  .z.top-right {
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
  }
  .z.bottom {
    bottom: 4px;
    left: 44px;
    width: 32px;
    height: 10px;
  }
  .z.bottom-right {
    right: 4px;
    bottom: 4px;
    width: 10px;
    height: 32px;
  }
  .plan.board {
    background: color-mix(in oklch, var(--active) 35%, var(--paper));
  }
  .plan.bottom .z.bottom,
  .plan.bottom-right .z.bottom-right,
  .plan.top-right .z.top-right {
    background: var(--active);
  }
  /* The copies are panels made to sit on the screen's edges: here they sit in the flow, at the dialog's zoom. */
  .shot :global(.panel),
  .shot :global(.dock) {
    position: static;
    transform: none;
    zoom: 1;
  }
  /* Navigation laid out in a row, to fit the dialog. */
  .shot :global(.controls) {
    flex-direction: row;
  }
  /* Its separators turned upright, joining the panel border like the toolbar's. */
  .shot :global(.controls .sep) {
    width: 2px;
    height: auto;
    align-self: stretch;
    margin: -4px 4px;
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(5, 14px);
    gap: 1px;
    padding: 1px;
    background: color-mix(in oklch, var(--ink) 15%, var(--paper));
  }
  .cells span {
    height: 14px;
    background: var(--paper);
  }
  /* Framed inside its own cell (an outline would spill over the neighbours, under their paint): a white pixel
     stays visible. */
  .cells .on {
    box-shadow: inset 0 0 0 2px var(--ink);
  }
  .mini {
    width: 96px;
    height: 96px;
  }
  .flag {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }
  .count {
    margin-right: auto;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
