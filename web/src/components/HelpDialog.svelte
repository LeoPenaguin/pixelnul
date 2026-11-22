<!-- Keyboard shortcut list. -->
<script lang="ts">
  import Plus from '~icons/mingcute/add-fill'
  import ArrowDown from '~icons/mingcute/arrow-down-fill'
  import ArrowLeft from '~icons/mingcute/arrow-left-fill'
  import ArrowRight from '~icons/mingcute/arrow-right-fill'
  import ArrowUp from '~icons/mingcute/arrow-up-fill'
  import Minus from '~icons/mingcute/minimize-fill'
  import KeyCap, { type Key } from './KeyCap.svelte'
  import Modal from './Modal.svelte'

  let modal: { open: () => void; isOpen: () => boolean }

  export function open() {
    modal.open()
  }

  export function isOpen() {
    return modal.isOpen()
  }

  // Keys that are symbols use library icons; keys that are words or characters stay text.
  const SHORTCUTS: [keys: Key[], joiner: string, label: string][] = [
    [
      [
        { icon: ArrowLeft, name: 'flèche gauche' },
        { icon: ArrowUp, name: 'flèche haut' },
        { icon: ArrowRight, name: 'flèche droite' },
        { icon: ArrowDown, name: 'flèche bas' },
      ],
      ' ',
      'Déplacer le curseur (la vue suit)',
    ],
    [['Maj', 'flèches'], ' + ', 'Déplacer de 10 pixels'],
    [['Entrée', 'Espace'], ' ou ', 'Poser un pixel sous le curseur'],
    [
      [
        { icon: Plus, name: 'plus' },
        { icon: Minus, name: 'moins' },
      ],
      ' ',
      'Zoomer, dézoomer',
    ],
    [['0'], '', 'Revenir en 0, 0'],
    [['C'], '', 'Ouvrir ou fermer les couleurs (flèches pour choisir)'],
    [['G'], '', 'Afficher ou cacher la grille'],
    [['H'], '', 'Carte de chaleur : les endroits les plus disputés'],
    [['Tab'], '', "Passer d'un bouton à l'autre ; les champs X / Y permettent de sauter à un pixel"],
    [['Échap'], '', 'Fermer la palette ou cette aide'],
    [['?'], '', 'Afficher cette aide'],
  ]
</script>

<Modal bind:this={modal} title="Raccourcis clavier">
  <dl>
    {#each SHORTCUTS as [keys, joiner, label] (label)}
      <!-- One element per row (valid in a <dl>): its border is the full-width line between rows. -->
      <div class="row">
        <dt>
          {#each keys as k, i (i)}{#if i}{joiner}{/if}<kbd><KeyCap key={k} /></kbd>{/each}
        </dt>
        <dd>{label}</dd>
      </div>
    {/each}
  </dl>
</Modal>

<style>
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 16px;
    margin: 0;
  }
  /* Each row spans both columns and shares the list's columns, so keys and labels stay aligned. */
  .row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--ink);
  }
  .row:first-child {
    padding-top: 0;
    border-top: 0;
  }
  dt {
    white-space: nowrap;
  }
  dd {
    margin: 0;
    color: var(--muted-foreground);
    font-weight: var(--font-weight-normal);
  }
  /* Fixed height and an equal minimum width: one-character keys are square, words grow wider. */
  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    height: 24px;
    padding: 0 5px;
    border-radius: 4px;
    border: 2px solid var(--ink);
    background: var(--highlight);
    font: inherit;
    line-height: 1;
  }
  /* Icon keys: no side padding, so they stay square like one-character keys. */
  kbd:has(:global(svg)) {
    padding: 0;
  }
</style>
