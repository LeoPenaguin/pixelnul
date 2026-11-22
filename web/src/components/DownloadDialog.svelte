<!-- Downloads a PNG of the whole board (lossless: pixel art stays sharp), in the chosen size. -->
<script lang="ts">
  import { IMAGE_SCALES } from '../lib/download'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import * as ToggleGroup from './ui/toggle-group'

  type Props = { width: number; height: number; ondownload: (scale: number) => Promise<void> }
  const { width, height, ondownload }: Props = $props()

  const id = $props.id()
  let modal: { open: () => void }
  let scale = $state(1)
  let status = $state<'idle' | 'busy' | 'failed'>('idle')

  export function open() {
    status = 'idle'
    modal.open()
  }

  async function download() {
    status = 'busy'
    try {
      await ondownload(scale)
      status = 'idle'
    } catch {
      status = 'failed'
    }
  }
</script>

<Modal bind:this={modal} title="Télécharger l'image">
  <p>Toute la toile, telle qu'elle est en ce moment, en PNG.</p>
  <!-- Clicking the chosen option again must not unselect it: empty values are ignored. -->
  <div class="group">
    <p id={`${id}-size`} class="legend">Taille</p>
    <ToggleGroup.Root
      type="single"
      aria-labelledby={`${id}-size`}
      value={String(scale)}
      onValueChange={(v) => {
        if (v) scale = Number(v)
      }}
    >
      {#each IMAGE_SCALES as s (s)}
        <ToggleGroup.Item value={String(s)}>{`×${String(s)}`}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
    <p class="hint">
      {`${String(width * scale)} × ${String(height * scale)} pixels : chaque pixel de la toile devient un carré de ${String(scale)} × ${String(scale)}.`}
    </p>
  </div>
  <div class="actions">
    <!-- Announced: preparing the image can take a moment, and it can fail. -->
    <span class="hint status" role="status">
      {#if status === 'busy'}Préparation de l'image…{:else if status === 'failed'}Échec du téléchargement, réessaie dans
        un instant.{/if}
    </span>
    <Button onclick={download} disabled={status === 'busy'}>Télécharger</Button>
  </div>
</Modal>

<style>
  p {
    margin: 0 0 12px;
    font-weight: var(--font-weight-normal);
  }
  .group {
    margin: 0 0 14px;
  }
  .legend {
    margin-bottom: 8px;
  }
  .hint {
    margin: 8px 0 0;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
  }
  .status {
    flex: 1;
  }
</style>
