<!-- Report: the content around the targeted pixel (or the view centre), or a bug, to the moderators. -->
<script lang="ts">
  import type { Point } from '../lib/engine/camera'
  import { NEEDS_COMMENT, REASONS } from '../lib/reasons'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Label } from './ui/label'

  type Props = {
    position: Point // targeted pixel, or view centre: frozen when the dialog opens
    onsend: (x: number, y: number, reason: string, comment: string) => Promise<string | null> // resolves to a refusal
  }
  const { position, onsend }: Props = $props()

  const MAX_COMMENT = 500 // characters, as the server allows

  const id = $props.id()
  let modal: { open: () => void }
  let at = $state<Point>({ x: 0, y: 0 })
  let reason = $state('hate')
  let comment = $state('')
  let error = $state('')
  let sending = $state(false)
  let sent = $state(false)
  const needed = $derived(NEEDS_COMMENT.includes(reason))

  export function open() {
    at = { ...position }
    reason = 'hate'
    comment = error = ''
    sent = false
    modal.open()
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    sending = true
    error = (await onsend(at.x, at.y, reason, comment.trim())) ?? ''
    sending = false
    sent = !error
  }
</script>

<Modal bind:this={modal} title="Signaler">
  {#if sent}
    <p role="status">Merci, c'est envoyé : la modération va regarder.</p>
  {:else}
    <form onsubmit={submit}>
      <fieldset>
        <legend>Que veux-tu signaler ?</legend>
        {#each Object.entries(REASONS) as [value, label] (value)}
          <label class="choice"
            ><input
              type="radio"
              name={`${id}-reason`}
              checked={reason === value}
              onchange={() => (reason = value)}
            /><span>{label}</span></label
          >
        {/each}
      </fieldset>
      {#if reason !== 'bug'}
        <p>
          {`Le contenu autour de ${String(at.x)}, ${String(at.y)} (sous ton curseur, ou au centre de ta vue) sera montré à la modération.`}
        </p>
      {/if}
      <Label for={`${id}-comment`}>{needed ? 'Description' : 'Précisions (facultatif)'}</Label>
      <textarea
        id={`${id}-comment`}
        bind:value={comment}
        rows="3"
        maxlength={MAX_COMMENT}
        required={needed}
        aria-invalid={error ? 'true' : undefined}></textarea>
      {#if error}<small class="error" role="alert">{error}</small>{/if}
      <div class="row">
        <Button type="submit" disabled={sending}>Envoyer</Button>
      </div>
    </form>
  {/if}
</Modal>

<style>
  p {
    margin: 0 0 12px;
    font-weight: var(--font-weight-normal);
  }
  fieldset {
    margin: 0 0 12px;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 6px;
    font-weight: var(--font-weight-medium);
  }
  .choice {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 2px 0;
    font-weight: var(--font-weight-normal);
  }
  input[type='radio'] {
    accent-color: var(--foreground);
  }
  /* Same look as the shadcn Input, which has no multi-line version here. */
  textarea {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 6px 8px;
    border: 2px solid var(--foreground);
    border-radius: var(--radius-md);
    background: var(--secondary);
    color: var(--foreground);
    font: inherit;
    font-size: var(--text-sm);
    resize: vertical;
  }
  textarea:focus-visible {
    outline: 3px solid var(--ring);
    outline-offset: 1px;
  }
  textarea[aria-invalid] {
    border-color: var(--destructive);
  }
  .error {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
    color: var(--destructive);
    font-weight: var(--font-weight-medium);
  }
  .row {
    margin-top: 12px;
  }
</style>
