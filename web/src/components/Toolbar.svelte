<!-- Bottom toolbar, for painting only: the current colour (opens the palette above), then the quota. -->
<script lang="ts">
  import { tick } from 'svelte'
  import { colorName } from '../lib/colors'
  import type { QuotaRules, QuotaSnapshot } from '../lib/quota'
  import Palette from './Palette.svelte'
  import Quota from './Quota.svelte'
  import { Button } from './ui/button'
  import { Separator } from './ui/separator'

  type Props = {
    rows: string[][]
    color: number
    open: boolean // palette is open
    quota: QuotaRules | null // null: no limit
    snapshot: QuotaSnapshot
    now: number
  }
  let { rows, color = $bindable(), open = $bindable(), quota, snapshot, now }: Props = $props()

  let button = $state<HTMLElement | null>(null)
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
    if (inside) button?.focus()
  }
</script>

<div class="dock">
  {#if open}
    <Palette bind:this={palette} {rows} bind:color onpick={close} />
  {/if}

  <div class="panel toolbar" role="group" aria-label="Outils">
    <Button
      variant="ghost"
      size="icon-lg"
      bind:ref={button}
      class="tool"
      title="Couleurs (C)"
      aria-label={`Couleurs, couleur actuelle : ${colorName(hex)}`}
      aria-keyshortcuts="C"
      aria-expanded={open}
      aria-controls="palette-panel"
      onclick={toggle}
    >
      <span class="current" style:background={hex}></span>
      <!-- Written out, so the colour never depends on sight of the swatch alone. -->
      <span aria-hidden="true">{colorName(hex)}</span>
    </Button>
    {#if quota}
      <Separator orientation="vertical" class="sep" />
      <Quota rules={quota} {snapshot} {now} />
    {/if}
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
  .toolbar :global(.tool) {
    gap: 8px;
    height: 40px;
    width: auto;
    padding: 0 10px 0 7px;
  }
  .toolbar :global(.tool[aria-expanded='true']) {
    background: var(--active);
  }
  /* The current colour is the main state while painting: a large swatch, no extra icon. */
  .current {
    width: 26px;
    height: 26px;
    border-radius: var(--radius);
    border: 2px solid var(--ink);
  }
  .toolbar :global(.sep) {
    margin: -4px 4px; /* joins the panel border, like the NavControls separators */
  }
</style>
