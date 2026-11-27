<!-- What the site is, its rules, where the code lives, and the welcome tour to replay. -->
<script lang="ts">
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'

  type Props = { onwelcome: () => void }
  const { onwelcome }: Props = $props()

  let modal: { open: () => void; close: () => void }

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
    Le code source est sur <a href="https://github.com/LeoPenaguin/pixelnul" target="_blank" rel="noopener noreferrer"
      >GitHub</a
    >.
  </p>
  <!-- Bottom right, like the welcome tour's own buttons. -->
  <div class="actions">
    <Button
      onclick={() => {
        modal.close()
        onwelcome()
      }}>Revoir la présentation</Button
    >
  </div>
</Modal>

<style>
  p {
    margin: 0 0 10px;
    font-weight: var(--font-weight-normal);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
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
