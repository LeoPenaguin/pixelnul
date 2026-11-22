<!-- Downloads an image of the whole board, in the chosen format and size. -->
<script lang="ts">
  import { IMAGE_SCALES, type ImageType } from '../lib/download'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'

  type Props = { width: number; height: number; ondownload: (type: ImageType, scale: number) => Promise<void> }
  const { width, height, ondownload }: Props = $props()

  const FORMATS: [type: ImageType, name: string, hint: string][] = [
    ['image/png', 'PNG', 'Sans perte : chaque pixel reste net. Le plus sûr.'],
    ['image/webp', 'WebP', 'Sans perte visible, fichier plus léger.'],
    ['image/jpeg', 'JPEG', 'Le plus léger, mais les bords des pixels deviennent un peu flous.'],
  ]

  let modal: { open: () => void }
  let chosen = $state(0) // index in FORMATS
  let scale = $state(1)
  let status = $state<'idle' | 'busy' | 'failed'>('idle')

  export function open() {
    status = 'idle'
    modal.open()
  }

  async function download() {
    status = 'busy'
    try {
      await ondownload(FORMATS[chosen][0], scale)
      status = 'idle'
    } catch {
      status = 'failed'
    }
  }
</script>

<Modal bind:this={modal} title="Télécharger l'image">
  <p>Toute la toile, telle qu'elle est en ce moment.</p>
  <fieldset>
    <legend>Taille</legend>
    <div class="segmented">
      {#each IMAGE_SCALES as s (s)}
        <label>
          <input type="radio" name="size" checked={scale === s} onchange={() => (scale = s)} />
          <span>{`×${String(s)}`}</span>
        </label>
      {/each}
    </div>
    <p class="hint">
      {`${String(width * scale)} × ${String(height * scale)} pixels : chaque pixel de la toile devient un carré de ${String(scale)} × ${String(scale)}.`}
    </p>
  </fieldset>
  <fieldset>
    <legend>Format</legend>
    <div class="segmented">
      {#each FORMATS as [t, name], i (t)}
        <label>
          <input type="radio" name="format" checked={chosen === i} onchange={() => (chosen = i)} />
          <span>{name}</span>
        </label>
      {/each}
    </div>
    <p class="hint">{FORMATS[chosen][2]}</p>
  </fieldset>
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
  fieldset {
    margin: 0 0 14px;
    padding: 0;
    border: 0;
  }
  legend {
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
