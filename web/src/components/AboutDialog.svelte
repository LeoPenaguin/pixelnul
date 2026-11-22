<!-- What the site is, its rules, and where the code lives. -->
<script lang="ts">
  import Modal from './Modal.svelte'

  let modal: { open: () => void }

  export function open() {
    modal.open()
  }
</script>

<Modal bind:this={modal} title="À propos">
  <p>
    Pixels est une toile collaborative de 1920 × 1080 pixels : chacun peut y poser des pixels, en direct avec tout le
    monde.
  </p>
  <p>
    Pour que chacun ait sa place, on dispose d'un nombre limité de pixels d'affilée ; le compteur en bas de l'écran se
    recharge avec le temps. Pas de compte : les limites s'appliquent par connexion.
  </p>
  <p>
    Le code source est sur <a href="https://github.com/LeoPenaguin/pixels" target="_blank" rel="noopener noreferrer"
      >GitHub</a
    >.
  </p>
</Modal>

<style>
  p {
    margin: 0 0 10px;
    font-weight: 400;
  }
  p:last-child {
    margin-bottom: 0;
  }
  a {
    color: var(--active);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
