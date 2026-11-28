<!-- Moderation (admins only), in tabs: pending reports; tools on the board (zones to paint over, stickers, an
     image); ban or unban a player; empty the board. -->
<script lang="ts">
  import { Tabs } from 'bits-ui'
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
    onstamp: (file: File, x: number, y: number) => Promise<string | null> // lays an image centred on x, y
    onstickers: () => void // starts pasting stickers, on the board
    onreset: () => Promise<string | null> // empties the board; resolves to a refusal
    onwelcome: () => Promise<string | null> // lays the welcome image back on 0, 0; resolves to a refusal
  }
  const { now, onreports, ondismiss, onjump, onselect, onban, onstamp, onstickers, onreset, onwelcome }: Props =
    $props()

  const LATER = 'Impossible pour le moment'

  const id = $props.id()
  let modal: { open: () => void; close: () => void }
  let tab = $state('reports')
  let reports = $state<Report[]>([])
  let reportStatus = $state('')
  let pseudo = $state('')
  let banStatus = $state('')
  let sx = $state(0)
  let sy = $state(0)
  let stampStatus = $state('')
  let confirm = $state('') // the reset waits for the word typed in full
  let resetStatus = $state('')

  export function open() {
    reports = []
    tab = 'reports'
    reportStatus = banStatus = stampStatus = resetStatus = confirm = ''
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

  async function stamp(lay: () => Promise<string | null>) {
    stampStatus = 'Pose en cours…'
    stampStatus = (await lay()) ?? 'Image posée'
  }

  async function reset() {
    resetStatus = 'Effacement…'
    resetStatus = (await onreset()) ?? 'Toile effacée'
    confirm = ''
  }

  async function ban(banned: boolean) {
    const p = pseudo.trim()
    banStatus = (await onban(p, banned)) ?? `${p} : ${banned ? 'compte banni' : 'bannissement levé'}`
  }
</script>

<Modal bind:this={modal} title="Modération">
  <Tabs.Root class="admin-tabs" bind:value={tab}>
    <Tabs.List class="tabs" aria-label="Parties de la modération">
      <Tabs.Trigger class="tab" value="reports"
        >{reports.length ? `Signalements (${String(reports.length)})` : 'Signalements'}</Tabs.Trigger
      >
      <Tabs.Trigger class="tab" value="board">Toile</Tabs.Trigger>
      <Tabs.Trigger class="tab" value="players">Joueurs</Tabs.Trigger>
      <Tabs.Trigger class="tab danger" value="reset">Effacer</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="reports">
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
    </Tabs.Content>

    <Tabs.Content value="board">
      <p>Ces outils ferment la fenêtre et s'utilisent sur la toile.</p>
      <div class="row">
        <Button onclick={() => onboard(onselect)}>Repeindre des zones</Button>
        <Button onclick={() => onboard(onstickers)}>Coller des stickers</Button>
      </div>
      <h3>Accueil</h3>
      <p>La tête de chat et « Salut ! », au centre de la toile (0, 0), là où la vue s'ouvre.</p>
      <Button onclick={() => void stamp(onwelcome)}>Poser l'accueil</Button>
      <h3>Poser une image</h3>
      <p>Un PNG : chaque couleur devient la plus proche de la palette, la transparence laisse la toile telle quelle.</p>
      <form
        onsubmit={(e) => {
          e.preventDefault()
          const file = new FormData(e.currentTarget).get('image') as File // required: always there
          void stamp(() => onstamp(file, sx, sy))
        }}
      >
        <Label for={`${id}-image`}>Image</Label>
        <!-- Native: the Input component has no file variant. -->
        <input class="file" id={`${id}-image`} name="image" type="file" accept="image/png" required />
        <div class="row">
          <Label for={`${id}-x`}>Centre en x</Label>
          <Input class="w-24" id={`${id}-x`} type="number" bind:value={sx} required />
          <Label for={`${id}-y`}>y</Label>
          <Input class="w-24" id={`${id}-y`} type="number" bind:value={sy} required />
          <Button type="submit">Poser</Button>
        </div>
        <span class="hint" role="status">{stampStatus}</span>
      </form>
    </Tabs.Content>

    <Tabs.Content value="players">
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
    </Tabs.Content>

    <Tabs.Content value="reset">
      <p>
        Remet tous les pixels en blanc, pour tout le monde, d'un coup. La toile d'avant reste en sauvegarde sur le
        serveur (jusqu'au prochain effacement).
      </p>
      <form
        onsubmit={(e) => {
          e.preventDefault()
          void reset()
        }}
      >
        <Label for={`${id}-confirm`}>Tape EFFACER pour confirmer</Label>
        <div class="row">
          <Input class="flex-1" id={`${id}-confirm`} bind:value={confirm} autocomplete="off" />
          <Button type="submit" variant="destructive" disabled={confirm !== 'EFFACER'}>Effacer la toile</Button>
        </div>
        <span class="hint" role="status">{resetStatus}</span>
      </form>
    </Tabs.Content>
  </Tabs.Root>
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
  .file {
    display: block;
    font-size: var(--text-sm);
  }
  /* Same width on every tab: the dialog does not jump when switching. */
  :global(.admin-tabs) {
    width: min(420px, 100%);
  }
  /* Tabs: underlined like links, the current one in bold with the accent. */
  :global(.tabs) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 14px;
    border-bottom: 2px solid var(--ink);
  }
  :global(.tab) {
    margin-bottom: -2px;
    padding: 4px 10px;
    border: 2px solid transparent;
    border-radius: 6px 6px 0 0;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  :global(.tab[data-state='active']) {
    border-color: var(--ink);
    border-bottom-color: var(--paper);
    background: var(--paper);
    font-weight: var(--font-weight-bold);
  }
  :global(.tab.danger) {
    color: var(--destructive);
  }
  :global(.tab:focus-visible) {
    outline: 3px solid var(--ring);
    outline-offset: 1px;
  }
  .hint {
    display: block;
    margin-top: 6px;
    font-size: var(--text-sm);
  }
</style>
