<!-- Legend of the heatmap mode, shown while it replaces the board: its scale runs up to the board's maximum. -->
<script lang="ts">
  import { HEAT_NONE, HEAT_RAMP } from '../lib/heat'

  type Props = { max: number } // change count of the most painted pixel
  const { max }: Props = $props()
</script>

<div class="panel legend" role="group" aria-label="Légende de la carte de chaleur">
  <span class="title">Carte de chaleur</span>
  <span class="step"><span class="swatch" style:background={HEAT_NONE}></span>0</span>
  <span class="step">
    1
    <span class="ramp" style:background={`linear-gradient(to right, ${HEAT_RAMP.join(', ')})`}></span>
    <span>{String(max)}</span>
  </span>
  <span class="hint note">fois peint · H pour revenir</span>
</div>

<style>
  /* Above the toolbar: the top of the screen belongs to the site and X / Y panels. */
  .legend {
    bottom: 76px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    white-space: nowrap;
  }
  .title {
    font-weight: var(--font-weight-bold);
  }
  .step {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .swatch,
  .ramp {
    height: 14px;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  .swatch {
    width: 14px;
  }
  .ramp {
    width: 120px;
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
