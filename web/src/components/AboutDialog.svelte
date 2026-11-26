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
    pixelnul est une toile collaborative de 1280 × 720 pixels : chacun peut y poser des pixels, en direct avec tout le
    monde.
  </p>
  <p>
    Pour que chacun ait sa place, on dispose d'un nombre limité de pixels d'affilée ; le compteur en bas de l'écran se
    recharge avec le temps. Pour peindre, on se connecte (Google ou Discord) et on choisit un pseudo ; regarder reste
    libre.
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
    font-weight: var(--font-weight-normal);
  }
  p:last-child {
    margin-bottom: 0;
  }
  a {
    color: var(--active);
    font-weight: var(--font-weight-bold);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  a:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
