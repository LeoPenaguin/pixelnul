<!-- Legend of the heatmap mode, in the toolbar's place (no painting meanwhile) and with its look:
     its scale runs from painted once to the board's maximum. -->
<script lang="ts">
  import { HEAT_RAMP } from '../lib/heat'
  import { Separator } from './ui/separator'

  type Props = { max: number } // change count of the most painted pixel
  const { max }: Props = $props()
</script>

<div class="panel legend" role="group" aria-label="Légende de la heatmap">
  <span class="title">Heatmap</span>
  <Separator orientation="vertical" decorative class="sep" />
  <span class="scale">
    <span>1</span>
    <span class="ramp" style:background={`linear-gradient(to right, ${HEAT_RAMP.join(', ')})`}></span>
    <span>{String(max)}</span>
  </span>
  <span class="hint note">fois peint · H pour revenir</span>
</div>

<style>
  /* Where the toolbar sits, same height (40 px content in a 4 px padding). */
  .legend {
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    padding: 4px 12px;
    white-space: nowrap;
  }
  .title {
    font-weight: var(--font-weight-bold);
  }
  .legend :global(.sep) {
    margin: -4px 4px; /* joins the panel border, like the toolbar separator */
  }
  .scale {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .ramp {
    width: 120px;
    height: 14px;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  /* Phones: the note is dropped to fit the width. */
  @media (max-width: 640px) {
    .note {
      display: none;
    }
    .ramp {
      width: 80px;
    }
  }
</style>
