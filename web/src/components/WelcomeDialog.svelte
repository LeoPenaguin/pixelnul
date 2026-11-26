<!-- Welcome, after the first pseudo is chosen: a few steps on what to click, then off to have fun. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Flag from '~icons/mingcute/flag-1-fill'
  import { plural } from '../lib/format'
  import type { QuotaRules } from '../lib/quota'
  import KeyCap from './KeyCap.svelte'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Kbd } from './ui/kbd'

  type Props = { quota: QuotaRules | null } // null: no limit, the stock step is skipped
  const { quota }: Props = $props()

  let modal: { open: () => void; close: () => void }
  let pseudo = $state('')
  let i = $state(0)

  const steps = $derived([
    { title: `Bienvenue ${pseudo} !`, body: hello },
    { title: 'Choisis une couleur, puis clique', body: paint },
    ...(quota ? [{ title: 'Ton stock de pixels', body: stock }] : []),
    { title: 'Promène-toi sur la toile', body: move },
    { title: 'Amuse-toi bien !', body: fun },
  ] satisfies { title: string; body: Snippet }[])
  // Only read on the stock step, which needs a quota.
  const stockText = $derived(
    quota &&
      `Tu peux poser ${plural(quota.burst, 'pixel')} d'affilée. Le compteur à côté de la couleur se recharge tout seul, d'un pixel en ${plural(quota.refillMs / 1000, 'seconde')}.`,
  )
  const step = $derived(steps[i])
  const last = $derived(i === steps.length - 1)

  export function open(name: string) {
    pseudo = name
    i = 0
    modal.open()
  }
</script>

{#snippet hello()}
  <p>
    pixelnul est une toile de 1280 × 720 pixels que tout le monde peint ensemble, en direct. Voici l'essentiel, en
    quelques étapes.
  </p>
{/snippet}

{#snippet paint()}
  <p>
    En bas de l'écran, le bouton de la couleur ouvre la palette (touche <Kbd><KeyCap key="C" /></Kbd>). Clique ensuite
    sur la toile : ton pixel apparaît aussitôt chez tout le monde.
  </p>
{/snippet}

{#snippet stock()}
  <p>{stockText}</p>
{/snippet}

{#snippet move()}
  <p>
    Glisse pour te déplacer ; pour zoomer, pince ou utilise Ctrl + molette. La minicarte en haut à droite et les boutons
    en bas à droite t'aident aussi, et <Kbd><KeyCap key="?" /></Kbd> liste les raccourcis clavier.
  </p>
{/snippet}

{#snippet fun()}
  <p>
    Recouvrir les dessins des autres fait partie du jeu, mais reste respectueux : rien de haineux ni de choquant. Si tu
    vois quelque chose qui dérape, le drapeau <Flag class="inline size-4 align-[-2px]" aria-hidden="true" /> en bas à droite
    permet de le signaler.
  </p>
{/snippet}

<Modal bind:this={modal} title={step.title}>
  <!-- Read out at each step: the focus stays on the buttons. -->
  <div aria-live="polite">{@render step.body()}</div>
  <div class="row">
    <span class="count">{`${String(i + 1)} / ${String(steps.length)}`}</span>
    <Button variant="ghost" disabled={i === 0} onclick={() => i--}>Précédent</Button>
    {#if last}
      <Button onclick={() => modal.close()}>C'est parti !</Button>
    {:else}
      <Button onclick={() => i++}>Suivant</Button>
    {/if}
  </div>
</Modal>

<style>
  p {
    margin: 0 0 16px;
    font-weight: var(--font-weight-normal);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }
  .count {
    margin-right: auto;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
