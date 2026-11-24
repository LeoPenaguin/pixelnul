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
  <div bind:this={group} class="swatches" role="radiogroup" aria-label="Couleur" tabindex="-1" onkeydown={keydown}>
    {#each rows as row, r (r)}
      {#each row as hex, i (hex)}
        {@const index = starts[r] + i}
        <Button
          variant="ghost"
          class={['swatch', { selected: index === color }]}
          style={`background: ${hex}; grid-row: ${String(r + 1)}`}
          role="radio"
          aria-label={colorName(hex)}
          title={colorName(hex)}
          aria-checked={index === color}
          tabindex={index === color ? 0 : -1}
          onclick={() => {
            color = index
            onpick()
          }}
        ></Button>
      {/each}
    {/each}
  </div>
  <!-- The radios already carry the names for screen readers: this one is for the eyes. -->
  <p class="caption" aria-hidden="true">{colorName(rows.flat()[color])}</p>
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
    grid-auto-rows: 26px;
    gap: 4px;
  }
  .caption {
    margin: 10px 0 0;
    text-align: center;
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
