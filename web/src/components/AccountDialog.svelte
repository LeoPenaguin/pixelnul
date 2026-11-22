<!-- Account: sign in (signed out), choose a pseudo (first sign-in), or manage it (pseudo, sign out, delete). -->
<script lang="ts">
  import type { User } from '../lib/api'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Label } from './ui/label'
  import { Separator } from './ui/separator'

  type Props = {
    user: User | null
    onsave: (pseudo: string) => Promise<string | null> // resolves to the reason of a refusal
    onsignout: () => Promise<void>
    ondelete: () => Promise<void>
  }
  const { user, onsave, onsignout, ondelete }: Props = $props()

  const id = $props.id()
  let modal: { open: () => void; close: () => void }
  let draft = $state('')
  let error = $state('')
  let saving = $state(false)
  let confirming = $state(false) // second step of the deletion
  let input = $state<HTMLInputElement | null>(null)

  const title = $derived(!user ? 'Se connecter' : user.pseudo ? 'Mon compte' : 'Choisis ton pseudo')

  export function open() {
    draft = user?.pseudo ?? ''
    error = ''
    confirming = false
    modal.open()
  }

  async function save(e: SubmitEvent) {
    e.preventDefault()
    saving = true
    error = (await onsave(draft.trim())) ?? ''
    saving = false
    if (!error) modal.close()
  }

  async function then(action: () => Promise<void>) {
    await action()
    modal.close()
  }
</script>

<!-- Straight to the pseudo, rather than the close button. -->
<Modal bind:this={modal} {title} initialFocus={() => input ?? undefined}>
  {#if !user}
    <p>Connecte-toi pour poser des pixels. Regarder la toile reste libre, sans compte.</p>
    <!-- A link: Google's page opens in this tab. -->
    <Button href="/api/auth/login" size="lg">Continuer avec Google</Button>
    <p class="hint note">Seul un identifiant de compte Google est gardé : ni ton nom, ni ton e-mail.</p>
  {:else}
    {#if !user.pseudo}
      <p>Il s'affichera dans l'historique des pixels que tu poses. Tu pourras le changer plus tard.</p>
    {/if}
    <form onsubmit={save}>
      <Label for={`${id}-pseudo`} class="pseudo">Pseudo</Label>
      <div class="row">
        <Input
          class="flex-1"
          bind:ref={input}
          id={`${id}-pseudo`}
          bind:value={draft}
          autocomplete="nickname"
          maxlength={20}
          required
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-hint`}
        />
        <Button type="submit" disabled={saving}>Enregistrer</Button>
      </div>
      <small id={`${id}-hint`} class="hint" class:error role={error ? 'alert' : undefined}
        >{error || '3 à 20 lettres, chiffres, points, tirets ou soulignés'}</small
      >
    </form>
    {#if user.pseudo}
      <Separator class="my-4" />
      {#if confirming}
        <p>Ton compte et ton pseudo seront supprimés. Tes pixels restent sur la toile, sans nom.</p>
        <div class="row">
          <Button variant="destructive" onclick={() => void then(ondelete)}>Supprimer définitivement</Button>
          <Button onclick={() => (confirming = false)}>Annuler</Button>
        </div>
      {:else}
        <div class="row">
          <Button onclick={() => void then(onsignout)}>Se déconnecter</Button>
          <Button onclick={() => (confirming = true)}>Supprimer mon compte</Button>
        </div>
      {/if}
    {/if}
  {/if}
</Modal>

<style>
  p {
    margin: 0 0 12px;
    font-weight: var(--font-weight-normal);
  }
  .note {
    margin: 12px 0 0;
    font-size: var(--text-sm);
  }
  :global(.modal .pseudo) {
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  small {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
  small.error {
    color: var(--destructive);
    font-weight: var(--font-weight-medium);
  }
</style>
