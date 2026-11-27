<!-- Accessibility settings (the grid is toggled from the bottom-right controls). -->
<script lang="ts">
  import { UI_SCALES, type Settings } from '../lib/settings'
  import Modal from './Modal.svelte'
  import * as ToggleGroup from './ui/toggle-group'

  type Props = { settings: Settings }
  let { settings = $bindable() }: Props = $props()

  const id = $props.id()
  let modal: { open: () => void }

  export function open() {
    modal.open()
  }
</script>

<Modal bind:this={modal} title="Accessibilité">
  <p id={`${id}-scale`} class="legend">Taille de l'interface</p>
  <!-- Clicking the chosen size again must not unselect it: empty values are ignored. -->
  <ToggleGroup.Root
    type="single"
    aria-labelledby={`${id}-scale`}
    value={String(settings.scale)}
    onValueChange={(v) => {
      if (v) settings.scale = Number(v)
    }}
  >
    {#each UI_SCALES as s (s)}
      <ToggleGroup.Item value={String(s)}>{`${String(s * 100)} %`}</ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</Modal>

<style>
  .legend {
    margin: 0 0 8px;
  }
</style>
