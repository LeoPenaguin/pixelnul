<!-- Display and accessibility settings. -->
<script lang="ts">
  import { SCALES, type Settings } from '../lib/settings'
  import Modal from './Modal.svelte'

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
  <label class="check">
    <input type="checkbox" bind:checked={settings.grid} aria-keyshortcuts="G" aria-describedby={`${id}-grid`} />
    Grille
  </label>
  <small id={`${id}-grid`}>Lignes entre les pixels quand on zoome (touche G)</small>

  <h3>Accessibilité</h3>
  <label class="check">
    <input type="checkbox" bind:checked={settings.colorNames} aria-describedby={`${id}-names`} />
    Noms des couleurs
  </label>
  <small id={`${id}-names`}
    >Écrits dans la barre d'outils, la palette et le panneau X / Y, pour ne pas dépendre des couleurs seules</small
  >
  <fieldset>
    <legend>Taille de l'interface</legend>
    <div class="segmented">
      {#each SCALES as s (s)}
        <label>
          <input type="radio" name="scale" checked={settings.scale === s} onchange={() => (settings.scale = s)} />
          <span>{`${String(s * 100)} %`}</span>
        </label>
      {/each}
    </div>
  </fieldset>
</Modal>

<style>
  h3 {
    margin: 16px 0 8px;
    padding-top: 12px;
    border-top: 1px solid var(--ink);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  h3:first-of-type {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .check {
    display: flex;
    gap: 10px;
    align-items: center;
    cursor: pointer;
  }
  /* Hint under its checkbox, aligned with the label text. */
  small {
    display: block;
    margin: 4px 0 12px 28px;
    line-height: 1.35;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-normal);
    color: var(--muted-foreground);
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    flex: none;
    accent-color: var(--active);
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 8px;
  }
  input[type='checkbox']:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
</style>
