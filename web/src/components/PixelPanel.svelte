<!-- Top-left panel: coordinates of the targeted pixel and its history. -->
<script lang="ts">
  import type { PixelInfo } from '../lib/api'
  import type { Point } from '../lib/engine/camera'
  import { plural } from '../lib/format'
  import { ago } from '../lib/time'

  type Props = {
    position: Point // targeted pixel, or view centre
    info: PixelInfo | null // history of `position`, once loaded
    colorLabel: string | null // colour name of a painted pixel
    now: number
  }
  const { position, info, colorLabel, now }: Props = $props()
</script>

<div class="panel pixel">
  <p class="coords">
    <b>X</b><span>{position.x}</span>
    <b>Y</b><span>{position.y}</span>
  </p>
  {#if info}
    <div class="info">
      {#if colorLabel}<strong>{`${colorLabel} · `}</strong>{/if}
      <span>
        {#if info.lastChange}
          {`${plural(info.changes, 'changement')} · dernier ${ago(info.lastChange, now)}${info.by ? ` par ${info.by}` : ''}`}
        {:else if info.c}
          Peint avant le suivi des changements
        {:else}
          Jamais peint
        {/if}
      </span>
    </div>
  {/if}
</div>

<style>
  /* Positioned by App, in the top-left column. */
  .pixel {
    position: static;
    padding: 8px 10px;
  }
  /* Small touch screens: no hover to target a pixel and little room; the board is navigated by hand. */
  @media (pointer: coarse) and (max-width: 640px) {
    .pixel {
      display: none;
    }
  }
  .coords {
    display: flex;
    gap: 4px;
    align-items: baseline;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .coords span {
    min-width: 5ch;
  }
  .info {
    padding-top: 8px;
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  strong,
  b {
    font-weight: var(--font-weight-bold);
    color: var(--ink);
  }
</style>
