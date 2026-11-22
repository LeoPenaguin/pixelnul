<!-- Colour palette: a radio group, one row of shades per line. Arrow keys change the colour
     (selection follows focus). -->
<script lang="ts">
  import { colorName } from '../lib/colors'
  import { paletteMove } from '../lib/keyboard'

  type Props = { rows: string[][]; color: number; colorNames: boolean }
  let { rows, color = $bindable(), colorNames }: Props = $props()

  const swatches: HTMLButtonElement[] = $state([])
  const starts = $derived(rows.map((_, r) => rows.slice(0, r).flat().length))

  /** Focuses the selected colour (on open). */
  export function focus() {
    swatches[color].focus()
  }

  function keydown(e: KeyboardEvent) {
    const next = paletteMove(e.key, color, rows)
    if (next === null) return
    e.preventDefault()
    color = next
    swatches[next].focus()
  }
</script>

<div class="panel popover" id="palette-panel">
  <div class="swatches" role="radiogroup" aria-label="Couleur" tabindex="-1" onkeydown={keydown}>
    {#each rows as row, r (r)}
      {#each row as hex, i (hex)}
        {@const index = starts[r] + i}
        <button
          type="button"
          bind:this={swatches[index]}
          class="swatch"
          class:selected={index === color}
          style:background={hex}
          style:grid-row={r + 1}
          role="radio"
          aria-label={colorName(hex)}
          title={colorName(hex)}
          aria-checked={index === color}
          tabindex={index === color ? 0 : -1}
          onclick={() => (color = index)}
        ></button>
      {/each}
    {/each}
  </div>
  <!-- The radios already carry the names for screen readers: this one is for the eyes. -->
  {#if colorNames}<p class="caption" aria-hidden="true">{colorName(rows.flat()[color])}</p>{/if}
</div>

<style>
  .popover {
    position: static;
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
  .swatch {
    border-radius: 6px;
    border: 2px solid var(--ink);
    cursor: pointer;
    padding: 0;
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch:focus-visible,
  .swatch.selected {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .swatch:hover {
      transform: none;
    }
  }
</style>
