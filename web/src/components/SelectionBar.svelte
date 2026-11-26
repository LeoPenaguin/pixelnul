<!-- Moderation, while zones are drawn on the board: what is selected, fill it in the chosen colour, start over, stop. -->
<script lang="ts">
  import { area, type Point, type Rect } from '../lib/engine/camera'
  import { plural } from '../lib/format'
  import { Button } from './ui/button'

  type Props = {
    rects: Rect[]
    corner: Point | null // first corner of a zone drawn by clicks
    colorName: string // the colour chosen in the toolbar
    onfill: () => Promise<string | null> // resolves to a refusal
    onclear: () => void
    ondone: () => void
  }
  const { rects, corner, colorName, onfill, onclear, ondone }: Props = $props()

  let status = $state('')
  let busy = $state(false)

  // Read out on every change: a screen reader follows the drawing.
  const summary = $derived.by(() => {
    if (corner) return `Premier coin en ${String(corner.x)}, ${String(corner.y)} : choisis le coin opposé`
    if (rects.length === 0) return 'Glisse sur la toile pour tracer une zone, ou choisis deux coins (clic ou Entrée)'
    return `${plural(rects.length, 'zone')} · ${plural(
      rects.reduce((n, r) => n + area(r), 0),
      'pixel',
    )}`
  })

  async function fill() {
    busy = true
    status = (await onfill()) ?? 'Zones repeintes'
    busy = false
  }
</script>

<div class="panel selection" role="region" aria-label="Zones à repeindre">
  <p role="status">{summary}</p>
  <div class="row">
    <Button onclick={() => void fill()} disabled={busy || rects.length === 0}>{`Remplir en ${colorName}`}</Button>
    <Button variant="ghost" onclick={onclear} disabled={rects.length === 0}>Tout effacer</Button>
    <Button variant="ghost" onclick={ondone}>Terminer</Button>
  </div>
  {#if status}<small role="status">{status}</small>{/if}
</div>

<style>
  .selection {
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
    gap: 8px;
  }
  small {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
</style>
