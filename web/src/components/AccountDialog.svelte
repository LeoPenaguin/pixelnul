<!-- Account: sign in (signed out), choose a pseudo (first sign-in), or manage it (pseudo, sign out, delete). -->
<script lang="ts">
  import type { User } from '../lib/api'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'

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
  let input = $state<HTMLInputElement>()

  const title = $derived(!user ? 'Se connecter' : user.pseudo ? 'Mon compte' : 'Choisis ton pseudo')

  export function open() {
    draft = user?.pseudo ?? ''
    error = ''
    confirming = false
    modal.open()
    input?.focus() // straight to the pseudo, rather than the close button
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

<Modal bind:this={modal} {title}>
  {#if !user}
    <p>Connecte-toi pour poser des pixels. Regarder la toile reste libre, sans compte.</p>
    <a class="google" href="/api/auth/login">Continuer avec Google</a>
    <p class="hint note">Seul un identifiant de compte Google est gardé : ni ton nom, ni ton e-mail.</p>
  {:else}
    {#if !user.pseudo}
      <p>Il s'affichera dans l'historique des pixels que tu poses. Tu pourras le changer plus tard.</p>
    {/if}
    <form onsubmit={save}>
      <label for={`${id}-pseudo`}>Pseudo</label>
      <div class="row">
        <input
          class="field"
          bind:this={input}
          id={`${id}-pseudo`}
          bind:value={draft}
          autocomplete="nickname"
          maxlength="20"
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
      <hr />
      {#if confirming}
        <p>Ton compte et ton pseudo seront supprimés. Tes pixels restent sur la toile, sans nom.</p>
        <div class="row">
          <Button variant="destructive" onclick={() => void then(ondelete)}>Supprimer définitivement</Button>
          <Button variant="ghost" onclick={() => (confirming = false)}>Annuler</Button>
        </div>
      {:else}
        <div class="row">
          <Button variant="outline" onclick={() => void then(onsignout)}>Se déconnecter</Button>
          <Button variant="ghost" onclick={() => (confirming = true)}>Supprimer mon compte</Button>
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
  /* A link (Google's page opens in this tab), styled as the main button. */
  .google {
    display: inline-flex;
    align-items: center;
    height: 36px;
    padding: 0 14px;
    border-radius: var(--radius);
    background: var(--primary);
    color: var(--primary-foreground);
    font-weight: var(--font-weight-medium);
  }
  .google:hover {
    background: color-mix(in oklch, var(--primary), transparent 20%);
  }
  .google:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
  .note {
    margin: 12px 0 0;
    font-size: var(--text-sm);
  }
  label {
    display: block;
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
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
  hr {
    margin: 16px 0;
    border: 0;
    border-top: 1px solid var(--ink);
  }
</style>
