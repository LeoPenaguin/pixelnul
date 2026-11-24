<!-- Round close cross straddling the top-right corner of its panel (which must be positioned). -->
<script lang="ts">
  import XIcon from '~icons/mingcute/close-fill'
  import { Button } from './ui/button'

  // Rest props: bits-ui's Dialog.Close hands its own (onclick, aria…) through them.
  const props: Record<string, unknown> = $props()
</script>

<Button variant="ghost" size="icon" class="close-x" title="Fermer (Échap)" {...props}>
  <XIcon class="size-4" aria-hidden="true" />
  <span class="sr-only">Fermer</span>
</Button>

<style>
  /* Unlayered, so these win over the button's utilities. */
  :global(.close-x) {
    position: absolute;
    top: -14px;
    right: -14px;
    z-index: 1;
    border: var(--stroke) solid var(--ink);
    border-radius: 50%;
    background: var(--paper);
    box-shadow: 2px 2px 0 var(--ink);
  }
  :global(.close-x:hover) {
    background: var(--highlight);
  }
  /* Pressed: the button sinks onto its shadow. */
  :global(.close-x:active) {
    transform: translate(2px, 2px);
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.close-x:active) {
      transform: none;
    }
  }
</style>
