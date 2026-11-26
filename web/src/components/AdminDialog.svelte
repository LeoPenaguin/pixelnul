<!-- Moderation (admins only): pending reports, zones to paint over (drawn on the board), ban or unban a player. -->
<script lang="ts">
  import type { Report } from '../lib/api'
  import { REASONS } from '../lib/reasons'
  import { ago } from '../lib/time'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Label } from './ui/label'

  type Props = {
    now: number
    onreports: () => Promise<Report[]>
    ondismiss: (id: string) => Promise<void>
    onjump: (x: number, y: number) => void
    onselect: () => void // starts drawing the zones to paint over, on the board
    onban: (pseudo: string, banned: boolean) => Promise<string | null> // resolves to a refusal
  }
  const { now, onreports, ondismiss, onjump, onselect, onban }: Props = $props()

  const LATER = 'Impossible pour le moment'

  const id = $props.id()
  let modal: { open: () => void; close: () => void }
  let reports = $state<Report[]>([])
  let reportStatus = $state('')
  let pseudo = $state('')
  let banStatus = $state('')

  export function open() {
    reports = []
    reportStatus = banStatus = ''
    modal.open()
    void load()
  }

  async function load() {
    try {
      reports = await onreports()
    } catch {
      reportStatus = LATER
    }
  }

  async function dismiss(r: Report) {
    try {
      await ondismiss(r.id)
      reports = reports.filter((o) => o.id !== r.id)
      reportStatus = 'Signalement classé'
    } catch {
      reportStatus = LATER
    }
  }

  /** Closes the dialog, then acts on the board. */
  function onboard(action: () => void) {
    modal.close()
    action()
  }

  async function ban(banned: boolean) {
    const p = pseudo.trim()
    banStatus = (await onban(p, banned)) ?? `${p} : ${banned ? 'compte banni' : 'bannissement levé'}`
  }
</script>

<Modal bind:this={modal} title="Modération">
  <h3>Signalements</h3>
  {#if reports.length === 0}
    <p>Aucun signalement en attente.</p>
  {:else}
    <ul>
      {#each reports as r (r.id)}
        <li>
          <strong>{REASONS[r.reason]}</strong>
          <span class="meta">{`${String(r.x)}, ${String(r.y)} · ${ago(r.at, now)} · ${r.by || 'anonyme'}`}</span>
          {#if r.comment}<p class="comment">{r.comment}</p>{/if}
          <div class="row">
            <Button
              size="sm"
              aria-label={`Voir ${String(r.x)}, ${String(r.y)}`}
              onclick={() => onboard(() => onjump(r.x, r.y))}>Voir</Button
            >
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Classer le signalement en ${String(r.x)}, ${String(r.y)}`}
              onclick={() => void dismiss(r)}>Classer</Button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  <span class="hint" role="status">{reportStatus}</span>

  <h3>Repeindre des zones</h3>
  <p>Trace une ou plusieurs zones sur la toile, puis remplis-les dans la couleur choisie.</p>
  <Button onclick={() => onboard(onselect)}>Sélectionner sur la toile</Button>

  <h3>Bannir un joueur</h3>
  <p>Un joueur banni ne peut plus peindre, tout de suite.</p>
  <form
    onsubmit={(e) => {
      e.preventDefault()
      void ban(true)
    }}
  >
    <Label for={`${id}-pseudo`}>Pseudo</Label>
    <div class="row">
      <Input class="flex-1" id={`${id}-pseudo`} bind:value={pseudo} maxlength={20} required />
      <Button type="submit">Bannir</Button>
      <Button onclick={() => void ban(false)} disabled={!pseudo.trim()}>Débannir</Button>
    </div>
    <span class="hint" role="status">{banStatus}</span>
  </form>
</Modal>

<style>
  p {
    margin: 0 0 12px;
    font-weight: var(--font-weight-normal);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding-bottom: 10px;
    border-bottom: 2px solid var(--ink);
  }
  strong {
    display: block;
    font-weight: var(--font-weight-bold);
  }
  .meta {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }
  .comment {
    margin: 4px 0 0;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
  .hint {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
</style>
