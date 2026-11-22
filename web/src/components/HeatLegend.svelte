<!-- Legend of the heatmap mode, shown while it replaces the board. -->
<script lang="ts">
  import { HEAT_STEPS } from '../lib/heat'
</script>

<div class="panel legend" role="group" aria-label="Légende de la carte de chaleur">
  <span class="title">Carte de chaleur</span>
  <span class="steps">
    {#each HEAT_STEPS as [min, color, label] (min)}
      <span class="step"><span class="swatch" style:background={color}></span>{label}</span>
    {/each}
  </span>
  <span class="note">fois peint · H pour revenir</span>
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
  .steps {
    display: flex;
    gap: 8px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  .note {
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  /* Phones: the note is dropped to fit the width. */
  @media (max-width: 640px) {
    .note {
      display: none;
    }
  }
</style>
