<!-- Display and accessibility settings. -->
<script lang="ts">
  import { UI_SCALES, type Settings } from '../lib/settings'
  import Modal from './Modal.svelte'
  import { Checkbox } from './ui/checkbox'
  import { Label } from './ui/label'
  import * as ToggleGroup from './ui/toggle-group'

  type Props = { settings: Settings }
  let { settings = $bindable() }: Props = $props()

  const id = $props.id()
  let modal: { open: () => void }

  export function open() {
    modal.open()
  }
</script>

<Modal bind:this={modal} title="Paramètres">
  <h3>Affichage</h3>
  <Label class="check">
    <Checkbox
      checked={settings.grid}
      onCheckedChange={(v: boolean) => (settings.grid = v)}
      aria-keyshortcuts="G"
      aria-describedby={`${id}-grid`}
    />
    Grille
  </Label>
  <small id={`${id}-grid`} class="hint">Lignes entre les pixels quand on zoome (touche G)</small>

  <h3>Accessibilité</h3>
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
  :global(.modal .check) {
    gap: 10px;
    font-size: inherit;
    cursor: pointer;
  }
  /* Hint under its checkbox, aligned with the label text. */
  small {
    display: block;
    margin: 4px 0 12px 28px;
    line-height: 1.35;
    font-size: var(--text-sm);
  }
  .legend {
    margin: 0 0 8px;
  }
</style>
