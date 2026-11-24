<!-- Top-left panel: coordinates of the targeted pixel, its colour and its history. -->
<script lang="ts">
  import type { PixelInfo } from '../lib/api'
  import { colorName } from '../lib/colors'
  import type { Point } from '../lib/engine/camera'
  import { plural } from '../lib/format'
  import { ago } from '../lib/time'

  type Props = {
    position: Point // targeted pixel, or view centre
    info: PixelInfo | null // history of `position`, once loaded
    color: string | null // hex colour of that pixel, with `info`
    now: number
  }
  const { position, info, color, now }: Props = $props()
  const name = $derived(color ? colorName(color) : '')
</script>

<div class="panel pixel">
  <p class="coords">
    <b>X</b><span>{position.x}</span>
    <b>Y</b><span>{position.y}</span>
    {#if color}<i class="swatch" style:background={color}></i>{/if}
  </p>
  {#if info}
    <div class="info">
      {#if info.lastChange}
        <strong>{`${name} · ${plural(info.changes, 'changement')}`}</strong>
        <span>{`${ago(info.lastChange, now)}${info.by ? ` par ${info.by}` : ''}`}</span>
      {:else if info.c}
        <strong>{name}</strong>
        <span>Peint avant le suivi des changements</span>
      {:else}
        <strong>Jamais peint</strong>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Positioned by App, in the top-left column. Fixed width: hovering does not resize it. */
  .pixel {
    position: static;
    width: 220px;
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
    align-items: center;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .coords span {
    min-width: 5ch;
  }
  b {
    font-weight: var(--font-weight-bold);
  }
  .swatch {
    width: 18px;
    height: 18px;
    margin-left: auto;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 2px solid var(--ink);
    line-height: 1.25;
    overflow-wrap: anywhere; /* long pseudos wrap instead of widening the panel */
  }
  strong {
    font-weight: var(--font-weight-bold);
  }
  .info span {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
</style>
