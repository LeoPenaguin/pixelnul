<!-- Colour palette: a radio group, one row of shades per line. Arrow keys change the colour
     (selection follows focus). -->
<script lang="ts">
  import { colorName } from '../lib/colors'
  import { paletteMove } from '../lib/keyboard'
  import CloseButton from './CloseButton.svelte'
  import { Button } from './ui/button'

  // onpick: a colour was clicked (the arrow keys only change it, the palette stays open to keep browsing).
  type Props = { rows: string[][]; color: number; onpick: () => void; onclose: () => void }
  let { rows, color = $bindable(), onpick, onclose }: Props = $props()

  let group: HTMLElement
  const swatch = (i: number) => group.querySelectorAll<HTMLElement>('[role=radio]')[i]
  const starts = $derived(rows.map((_, r) => rows.slice(0, r).flat().length))
  // Grid lines: a thin rule sets the neutrals (first row) and the earth tones (last row) apart from the hue ramps.
  const lines = $derived(rows.flatMap((_, r) => (r === 1 || (r > 1 && r === rows.length - 1) ? ['rule', r] : [r])))
  const template = $derived(lines.map((l) => (l === 'rule' ? '9px' : '26px')).join(' '))
  // The caption previews the hovered colour, and comes back to the selected one as soon as the pointer leaves it.
  let hovered = $state<number | null>(null)
  const shown = $derived(rows.flat()[hovered ?? color])

  /** Focuses the selected colour (on open). */
  export function focus() {
    swatch(color).focus()
  }

  function keydown(e: KeyboardEvent) {
    const next = paletteMove(e.key, color, rows)
    if (next === null) return
    e.preventDefault()
    color = next
    swatch(next).focus()
  }
</script>

<div class="panel popover" id="palette-panel">
  <div
    bind:this={group}
    class="swatches"
    style:grid-template-rows={template}
    role="radiogroup"
    aria-label="Couleur"
    tabindex="-1"
    onkeydown={keydown}
  >
    {#each lines as line, l (l)}
      {#if line === 'rule'}<i class="rule" style:grid-row={String(l + 1)}></i>{/if}
    {/each}
    {#each rows as row, r (r)}
      {#each row as hex, i (hex)}
        {@const index = starts[r] + i}
        <Button
          variant="ghost"
          class={['swatch', { selected: index === color }]}
          style={`background: ${hex}; grid-row: ${String(lines.indexOf(r) + 1)}`}
          role="radio"
          aria-label={colorName(hex)}
          title={colorName(hex)}
          aria-checked={index === color}
          tabindex={index === color ? 0 : -1}
          onpointerenter={() => (hovered = index)}
          onpointerleave={() => (hovered = null)}
          onclick={() => {
            color = index
            onpick()
          }}
        ></Button>
      {/each}
    {/each}
  </div>
  <!-- The radios already carry the names for screen readers: this one is for the eyes. -->
  <p class="caption" aria-hidden="true">
    <i class="preview" style:background={shown}></i>{colorName(shown)}
  </p>
  <CloseButton onclick={onclose} />
</div>

<style>
  .popover {
    position: relative; /* anchors the close cross */
    padding: 10px;
  }
  .swatches {
    display: grid;
    grid-auto-columns: 26px;
    gap: 4px;
  }
  .rule {
    grid-column: 1 / -1;
    align-self: center;
    height: 2px;
    border-radius: 1px;
    background: var(--ink);
    opacity: 0.2;
  }
  .caption {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
    margin: 10px 0 0;
  }
  .preview {
    width: 14px;
    height: 14px;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  /* Unlayered, so these win over the button's utilities: the swatch is all colour. */
  .swatches :global(.swatch) {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 2px solid var(--ink);
    cursor: pointer;
    padding: 0;
  }
  .swatches :global(.swatch:hover) {
    transform: scale(1.1);
  }
  .swatches :global(.swatch:focus-visible),
  .swatches :global(.swatch.selected) {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .swatches :global(.swatch:hover) {
      transform: none;
    }
  }
</style>
