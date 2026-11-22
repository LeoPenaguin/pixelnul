<!-- Top-left panel: coordinates of the targeted pixel (editable to jump there) and its history. -->
<script lang="ts">
  import ArrowRight from '~icons/mingcute/arrow-right-fill'
  import type { PixelInfo } from '../lib/api'
  import type { Point } from '../lib/engine/camera'
  import { plural } from '../lib/format'
  import { ago } from '../lib/time'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Label } from './ui/label'

  type Props = {
    position: Point // targeted pixel, or view centre
    info: PixelInfo | null // history of `position`, once loaded
    colorLabel: string | null // colour name of a painted pixel
    now: number
    onjump: (x: number, y: number) => void
  }
  const { position, info, colorLabel, now, onjump }: Props = $props()

  // The fields follow `position`, except while being edited.
  let editing = $state(false)
  let fx = $state<number | null>(null)
  let fy = $state<number | null>(null)
  $effect.pre(() => {
    if (editing) return
    fx = position.x
    fy = position.y
  })

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (fx === null || fy === null || !Number.isInteger(fx) || !Number.isInteger(fy)) return
    onjump(fx, fy)
    ;(document.activeElement as HTMLElement).blur()
  }

  function cancel(e: KeyboardEvent) {
    if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur()
  }
</script>

<div class="panel jump">
  <form
    class="row"
    aria-label="Aller à un pixel"
    onsubmit={submit}
    onfocusin={() => (editing = true)}
    onfocusout={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) editing = false
    }}
  >
    <Label
      >X <Input
        class="coord"
        type="number"
        step="1"
        bind:value={fx}
        onkeydown={cancel}
        aria-label="Coordonnée X"
      /></Label
    >
    <Label
      >Y <Input
        class="coord"
        type="number"
        step="1"
        bind:value={fy}
        onkeydown={cancel}
        aria-label="Coordonnée Y"
      /></Label
    >
    <Button
      variant="ghost"
      size="icon"
      type="submit"
      title="Aller à ces coordonnées (Entrée)"
      aria-label="Aller à ces coordonnées"
    >
      <ArrowRight class="size-5" aria-hidden="true" />
    </Button>
  </form>
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
  .jump {
    position: static;
    padding: 4px 4px 4px 10px;
  }
  /* Small touch screens: no hover to target a pixel and little room; the board is navigated by hand. */
  @media (pointer: coarse) and (max-width: 640px) {
    .jump {
      display: none;
    }
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .info {
    padding: 10px 6px 6px 0;
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  strong {
    font-weight: var(--font-weight-bold);
    color: var(--ink);
  }
  .row :global(label) {
    gap: 4px;
    font-weight: var(--font-weight-bold);
  }
  .jump :global(.coord) {
    width: 8ch;
    padding: 4px 6px;
    font-variant-numeric: tabular-nums;
  }
</style>
