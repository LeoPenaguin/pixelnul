<!-- Bottom toolbar: the palette button (opens its panel above), the quota, then the view toggles. -->
<script lang="ts">
  import Grid from '~icons/mingcute/grid-3x3-fill'
  import PaletteIcon from '~icons/mingcute/palette-fill'
  import { tick } from 'svelte'
  import { colorName } from '../lib/colors'
  import type { QuotaRules, QuotaSnapshot } from '../lib/quota'
  import Palette from './Palette.svelte'
  import Quota from './Quota.svelte'

  type Props = {
    rows: string[][]
    color: number
    open: boolean // palette is open
    showGrid: boolean
    ontogglegrid: () => void
    quota: QuotaRules | null // null: no limit
    snapshot: QuotaSnapshot
    now: number
  }
  let { rows, color = $bindable(), open = $bindable(), showGrid, ontogglegrid, quota, snapshot, now }: Props = $props()

  let button: HTMLButtonElement
  let palette = $state<{ focus: () => void }>()
  const hex = $derived(rows.flat()[color])

  /** Opens the palette (focus on the selected colour) or closes it. */
  export async function toggle() {
    if (open) {
      close()
      return
    }
    open = true
    await tick()
    palette?.focus()
  }

  /** Closes the palette; if focus was inside, hands it back to the button so it is not lost. */
  export function close() {
    const inside = document.activeElement?.closest('#palette-panel')
    open = false
    if (inside) button.focus()
  }
</script>

<div class="dock">
  {#if open}
    <Palette bind:this={palette} {rows} bind:color />
  {/if}

  <div class="panel toolbar" role="group" aria-label="Outils">
    <button
      type="button"
      bind:this={button}
      class="icon tool"
      class:active={open}
      title="Couleurs (C)"
      aria-label={`Couleurs, couleur actuelle : ${colorName(hex)}`}
      aria-keyshortcuts="C"
      aria-expanded={open}
      aria-controls="palette-panel"
      onclick={toggle}
    >
      <PaletteIcon width="20" height="20" aria-hidden="true" />
      <span class="current" style:background={hex}></span>
    </button>
    {#if quota}
      <span class="sep" aria-hidden="true"></span>
      <Quota rules={quota} {snapshot} {now} />
    {/if}
    <span class="sep" aria-hidden="true"></span>
    <button
      type="button"
      class="icon square"
      class:active={showGrid}
      title="Afficher / cacher la grille (G)"
      aria-label="Grille"
      aria-keyshortcuts="G"
      aria-pressed={showGrid}
      onclick={ontogglegrid}
    >
      <Grid width="20" height="20" aria-hidden="true" />
    </button>
  </div>
</div>

<style>
  .dock {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .toolbar {
    position: static;
    padding: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 8px;
    width: auto;
    height: 40px;
    padding: 0 10px;
  }
  .square {
    width: 40px;
    height: 40px;
  }
  .current {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 2px solid var(--ink);
  }
  .sep {
    width: 2px;
    align-self: stretch;
    margin: -4px 4px; /* joins the panel border, like the NavControls separators */
    background: var(--ink);
  }
</style>
