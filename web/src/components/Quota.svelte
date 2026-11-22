<!-- Quota gauge: one block per pixel of the burst, the refilling one filling up, and the count. -->
<script lang="ts">
  import { quotaAt, type QuotaRules, type QuotaSnapshot } from '../lib/quota'

  type Props = { rules: QuotaRules; snapshot: QuotaSnapshot; now: number }
  const { rules, snapshot, now }: Props = $props()

  const q = $derived(quotaAt(rules, snapshot, now))
  // Fill level of each block: 1 when available, the refill progress for the next one, 0 beyond.
  const blocks = $derived(
    Array.from({ length: rules.burst }, (_, i) => (i < q.available ? 1 : i === q.available ? q.progress : 0)),
  )
  // Only a refill animates: a painted pixel just disappears.
  let previous: number[] = []
  const rising = $derived.by(() => {
    const r = blocks.map((fill, i) => fill > (previous[i] ?? fill))
    previous = blocks
    return r
  })
  const s = (n: number) => (n > 1 ? 's' : '')
</script>

<div class="quota" class:empty={q.available === 0}>
  <span class="sr-only">
    {`${String(q.available)} pixel${s(q.available)} disponible${s(q.available)} sur ${String(rules.burst)}${
      q.full ? '' : `, prochain dans ${String(q.nextIn)} secondes`
    }`}
  </span>
  <!-- ponytail: 5 blocks per row fits the toolbar up to a burst of ~10-15; switch to a bar for bigger bursts. -->
  <span class="blocks" aria-hidden="true">
    {#each blocks as fill, i (i)}
      <span class="block" class:full={fill === 1}
        ><span class="fill" class:rising={rising[i]} style:height={`${String(fill * 100)}%`}></span></span
      >
    {/each}
  </span>
  <span class="num" aria-hidden="true">{q.available}</span>
</div>

<style>
  .quota {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 4px;
    --q: var(--ink);
  }
  .quota.empty {
    --q: var(--muted-foreground);
  }
  .blocks {
    display: grid;
    grid-template-columns: repeat(5, 12px);
    gap: 3px;
  }
  .block {
    display: flex;
    align-items: flex-end;
    height: 12px;
    border: 2px solid var(--ink);
    border-radius: 2px;
    background: var(--paper);
    overflow: hidden;
  }
  /* A refilled pixel pops; adding the class (re)starts the animation. */
  .block.full {
    animation: pop 260ms cubic-bezier(0.3, 1.8, 0.5, 1);
  }
  @keyframes pop {
    40% {
      transform: scale(1.35);
    }
  }
  .fill {
    width: 100%;
    background: var(--focus);
  }
  /* `now` ticks every 250 ms: the transition smooths the refill between ticks. */
  .fill.rising {
    transition: height 250ms linear;
  }
  .full .fill {
    background: var(--active);
  }
  .num {
    min-width: 2ch;
    font-size: 18px;
    font-weight: 700;
    color: var(--q);
    font-variant-numeric: tabular-nums;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill.rising,
    .block.full {
      transition: none;
      animation: none;
    }
  }
</style>
