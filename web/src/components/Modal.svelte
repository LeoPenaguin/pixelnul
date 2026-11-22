<!-- Modal shell shared by the dialogs. Native <dialog>: the browser traps focus, handles Escape and restores focus. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Close from '~icons/mingcute/close-fill'

  type Props = { title: string; children: Snippet }
  const { title, children }: Props = $props()
  const id = $props.id()
  let dialog: HTMLDialogElement

  export function open() {
    dialog.showModal()
  }

  export function isOpen() {
    return dialog.open
  }
</script>

<!-- A click on the backdrop (outside the content) closes the dialog; Escape does the same. -->
<dialog
  class="panel modal"
  bind:this={dialog}
  aria-labelledby={id}
  onclick={(e) => {
    if (e.target === dialog) dialog.close()
  }}
>
  <div class="head">
    <h2 {id}>{title}</h2>
    <button
      type="button"
      class="icon"
      aria-label="Fermer"
      title="Fermer (Échap)"
      onclick={() => {
        dialog.close()
      }}
    >
      <Close width="16" height="16" aria-hidden="true" />
    </button>
  </div>
  {@render children()}
</dialog>

<style>
  .modal {
    margin: auto; /* Tailwind's reset zeroes the margin that centres a modal dialog */
    max-width: min(440px, calc(100vw - 32px));
    padding: 16px 18px;
    line-height: 1.4;
  }
  .modal::backdrop {
    background: rgb(17 17 17 / 0.35);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
</style>
