<!-- World statistics: key figures, activity over the last 24 hours, colours on the board, the most disputed pixel. -->
<script lang="ts">
  import { fetchStats, type Stats } from '../lib/api'
  import { colorName } from '../lib/colors'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'

  type Props = { colors: string[]; onjump: (x: number, y: number) => void }
  const { colors, onjump }: Props = $props()

  const TOP_COLORS = 8 // the rest is too small to read as bars

  let modal: { open: () => void; close: () => void }
  let stats = $state<Stats | null>(null)
  let failed = $state(false)
  let hovered = $state<number | null>(null) // hour bar under the pointer

  /** Opens on fresh figures (the server recomputes them at most every 10 s). */
  export async function open() {
    failed = false
    modal.open()
    try {
      stats = await fetchStats()
    } catch {
      failed = true
    }
  }

  const fmt = (n: number) => n.toLocaleString('fr-FR')
  const plural = (n: number, word: string) => `${fmt(n)} ${word}${n > 1 ? 's' : ''}`
  /** "14 h": the hour of the i-th bar, the last one being the current hour. */
  const hourLabel = (i: number) => `${String((new Date().getHours() - 23 + i + 24) % 24)} h`

  /** Share of the board painted, to 0.1 %; a few pixels do not read as "0 %". */
  function paintedShare(s: Stats) {
    const pct = Math.round((s.painted / s.pixels) * 1000) / 10
    return s.painted && !pct ? '< 0,1 %' : `${pct.toLocaleString('fr-FR')} %`
  }

  // Painted colours only (white is mostly the empty background), largest first.
  function topColors(s: Stats) {
    const shown = s.colors.map((count, c) => ({ c, count })).filter((e) => e.c !== 0 && e.count > 0)
    const total = shown.reduce((a, e) => a + e.count, 0)
    return shown
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_COLORS)
      .map((e) => ({ ...e, share: e.count / total }))
  }
</script>

<Modal bind:this={modal} title="Statistiques">
  {#if failed}
    <p class="note" role="alert">Impossible de charger les statistiques pour le moment.</p>
  {:else if !stats}
    <p class="note" role="status">Chargement…</p>
  {:else}
    {@const s = stats}
    {@const maxHour = Math.max(1, ...s.hours)}
    {@const dayTotal = s.hours.reduce((a, b) => a + b, 0)}
    {@const top = topColors(s)}
    <div class="tiles">
      <div class="tile"><span class="big">{fmt(s.placed)}</span><span>pixels posés</span></div>
      <div class="tile">
        <span class="big">{paintedShare(s)}</span>
        <span>de la toile peinte</span>
      </div>
      <div class="tile">
        <span class="big">{fmt(s.online)}</span><span>{s.online > 1 ? 'connectés' : 'connecté'}</span>
      </div>
    </div>

    <h3>Activité, dernières 24 h</h3>
    <p class="caption" aria-hidden="true">
      {hovered === null
        ? `${plural(dayTotal, 'pixel')} en 24 h`
        : `${hourLabel(hovered)} : ${plural(s.hours[hovered], 'pixel')}`}
    </p>
    <!-- Visual chart; screen readers get the summary below. -->
    <div class="hours" aria-hidden="true" onmouseleave={() => (hovered = null)}>
      {#each s.hours as n, i (i)}
        <div class="slot" onmouseenter={() => (hovered = i)} role="presentation">
          <div class="bar" style:height={`${String((n / maxHour) * 100)}%`}></div>
        </div>
      {/each}
    </div>
    <div class="axis" aria-hidden="true"><span>il y a 24 h</span><span>maintenant</span></div>
    <p class="sr-only">
      {`${plural(dayTotal, 'pixel')} posés ces dernières 24 heures, au plus ${plural(Math.max(...s.hours), 'pixel')} en une heure.`}
    </p>

    <h3>Couleurs sur la toile</h3>
    {#if top.length}
      <ul class="colors">
        {#each top as { c, share } (c)}
          <li>
            <span class="name">{colorName(colors[c])}</span>
            <span class="track"
              ><span class="share" style:width={`${String(share * 100)}%`} style:background={colors[c]}></span></span
            >
            <span class="pct">{`${String(Math.round(share * 100))} %`}</span>
          </li>
        {/each}
      </ul>
      <p class="note">Hors blanc, la couleur du fond.</p>
    {:else}
      <p class="note">Rien n'a encore été peint.</p>
    {/if}

    {#if s.hottest}
      {@const h = s.hottest}
      <h3>Pixel le plus disputé</h3>
      <div class="hot">
        <span>{`${String(h.x)}, ${String(h.y)} · peint ${fmt(h.changes)} fois`}</span>
        <Button
          variant="outline"
          size="sm"
          onclick={() => {
            modal.close()
            onjump(h.x, h.y)
          }}>Y aller</Button
        >
      </div>
    {/if}
  {/if}
</Modal>

<style>
  .note {
    margin: 0;
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  .big {
    font-size: var(--text-lg);
    font-weight: var(--font-weight-bold);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  h3 {
    margin: 18px 0 8px;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-bold);
  }
  .caption {
    margin: 0 0 6px;
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  /* 24 bars from a shared baseline, 2 px apart, rounded at the data end only. */
  .hours {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 64px;
    border-bottom: 2px solid var(--ink);
  }
  .slot {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .bar {
    width: 100%;
    min-height: 1px;
    border-radius: 3px 3px 0 0;
    background: var(--active);
  }
  .slot:hover .bar {
    background: var(--ink);
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  .colors {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px 10px;
    align-items: center;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .colors li {
    display: contents;
  }
  .name {
    font-weight: var(--font-weight-normal);
  }
  .track {
    height: 12px;
  }
  /* Outlined: white and pale colours stay visible on the white panel. */
  .share {
    display: block;
    height: 100%;
    min-width: 4px;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  .pct {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .hot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
</style>
