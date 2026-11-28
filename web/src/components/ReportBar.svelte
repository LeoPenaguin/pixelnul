<!-- Report, first step: the next click (or Enter) on the board picks the drawing to report. -->
<script lang="ts">
  import { Button } from './ui/button'

  type Props = { oncancel: () => void }
  const { oncancel }: Props = $props()
</script>

<div class="panel aim" role="region" aria-label="Signaler">
  <p>Clique sur le dessin à signaler.</p>
  <div class="row">
    <Button onclick={oncancel}>Annuler</Button>
  </div>
</div>

<style>
  .aim {
    top: 12px;
    left: 50%;
    translate: -50% 0;
    max-width: calc((100vw - 24px) / var(--ui-scale, 1));
    padding: 8px 10px;
    animation: drop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoots a little: hard to miss */
  }
  @keyframes drop {
    from {
      opacity: 0;
      translate: -50% -24px;
      scale: 0.9;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aim {
      animation: none;
    }
  }
  p {
    margin: 0 0 8px;
    font-weight: var(--font-weight-normal);
  }
  .row {
    display: flex;
    gap: 6px;
  }
</style>
