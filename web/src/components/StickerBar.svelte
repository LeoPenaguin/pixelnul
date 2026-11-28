<!-- Moderation, while pasting stickers: pick one, then each click (or Enter) on the board pastes it centred there. -->
<script lang="ts">
  import { STICKERS } from '../lib/stickers'
  import { Button } from './ui/button'

  type Props = {
    picked: number // index in STICKERS
    status: string // what the last paste did
    onpick: (i: number) => void
    ondone: () => void
  }
  const { picked, status, onpick, ondone }: Props = $props()
</script>

<div class="panel stickers" role="region" aria-label="Stickers">
  <p>Clique sur la toile pour coller le sticker choisi.</p>
  <div class="row">
    {#each STICKERS as s, i (s.name)}
      <button
        type="button"
        class="sticker"
        aria-label={s.name}
        title={s.name}
        aria-pressed={i === picked}
        onclick={() => onpick(i)}
      >
        <svg
          viewBox={`0 0 ${String(Math.max(...s.rows.map((r) => r.length)))} ${String(s.rows.length)}`}
          aria-hidden="true"
        >
          {#each s.rows as row, y (y)}
            {#each row as ch, x (x)}
              {#if ch !== '.'}<rect {x} {y} width="1" height="1" fill={s.colors[ch]} />{/if}
            {/each}
          {/each}
        </svg>
      </button>
    {/each}
    <Button variant="ghost" onclick={ondone}>Terminer</Button>
  </div>
  <small role="status">{status}</small>
</div>

<style>
  .stickers {
    top: 12px;
    left: 50%;
    translate: -50% 0;
    max-width: calc((100vw - 24px) / var(--ui-scale, 1));
    padding: 8px 10px;
  }
  p {
    margin: 0 0 8px;
    font-weight: var(--font-weight-normal);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .sticker {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
  }
  .sticker[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--active);
  }
  .sticker:focus-visible {
    outline: 3px solid var(--ring);
    outline-offset: 1px;
  }
  svg {
    width: 24px;
    height: 24px;
    shape-rendering: crispEdges;
  }
  small {
    display: block;
    min-height: 1lh;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
</style>
