<!-- Report: the drawing around the pixel picked on the board, or a bug, to the moderators. -->
<script lang="ts">
  import type { Point } from '../lib/engine/camera'
  import { NEEDS_COMMENT, REASONS } from '../lib/reasons'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Label } from './ui/label'

  type Props = {
    onsend: (x: number, y: number, reason: string, comment: string) => Promise<string | null> // resolves to a refusal
  }
  const { onsend }: Props = $props()

  const MAX_COMMENT = 500 // characters, as the server allows

  const id = $props.id()
  let modal: { open: () => void }
  let at = $state<Point>({ x: 0, y: 0 })
  let reason = $state('hate')
  let comment = $state('')
  let error = $state('')
  let sending = $state(false)
  let sent = $state(false)
  const bug = $derived(reason === 'bug')
  const drawing = Object.entries(REASONS).filter(([value]) => value !== 'bug') // a bug has its own button
  const needed = $derived(NEEDS_COMMENT.includes(reason))

  /** Opens on the picked pixel, or, with bug, for a bug (no place, no reason to pick). */
  export function open(p: Point, isBug = false) {
    at = { ...p }
    reason = isBug ? 'bug' : 'hate'
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

<Modal bind:this={modal} title={bug ? 'Signaler un bug' : 'Signaler un dessin'}>
  {#if sent}
    <p role="status">Merci, c'est envoyé : la modération va regarder.</p>
  {:else}
    <form onsubmit={submit}>
      {#if !bug}
        <p>{`Le dessin autour de ${String(at.x)}, ${String(at.y)} sera montré à la modération.`}</p>
        <fieldset>
          <legend>Qu'est-ce qui ne va pas ?</legend>
          {#each drawing as [value, label] (value)}
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
