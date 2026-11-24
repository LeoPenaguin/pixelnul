<!-- Moderation (admins only): paint over a rectangle in the chosen colour, ban or unban a player. -->
<script lang="ts">
  import type { Point } from '../lib/engine/camera'
  import Modal from './Modal.svelte'
  import { Button } from './ui/button'
  import { Input } from './ui/input'
  import { Label } from './ui/label'

  type Props = {
    from: Point // targeted pixel: both corners start there
    colorName: string // the colour chosen in the toolbar
    onfill: (x0: number, y0: number, x1: number, y1: number) => Promise<string | null> // resolves to a refusal
    onban: (pseudo: string, banned: boolean) => Promise<string | null>
  }
  const { from, colorName, onfill, onban }: Props = $props()

  const id = $props.id()
  let modal: { open: () => void }
  let corners = $state([0, 0, 0, 0]) // x0, y0, x1, y1
  let pseudo = $state('')
  let fillStatus = $state('')
  let banStatus = $state('')

  const CORNERS = ['X du premier coin', 'Y du premier coin', 'X du coin opposé', 'Y du coin opposé']

  export function open() {
    corners = [from.x, from.y, from.x, from.y]
    fillStatus = banStatus = ''
    modal.open()
  }

  async function fill(e: SubmitEvent) {
    e.preventDefault()
    const [x0, y0, x1, y1] = corners
    fillStatus = (await onfill(x0, y0, x1, y1)) ?? 'Rectangle rempli'
  }

  async function ban(banned: boolean) {
    const p = pseudo.trim()
    banStatus = (await onban(p, banned)) ?? `${p} : ${banned ? 'compte banni' : 'bannissement levé'}`
  }
</script>

<Modal bind:this={modal} title="Modération">
  <h3>Repeindre un rectangle</h3>
  <p>{`En ${colorName}, la couleur choisie, coins compris.`}</p>
  <form onsubmit={fill}>
    <div class="grid">
      {#each CORNERS as label, i (label)}
        <div>
          <Label for={`${id}-c${String(i)}`}>{label}</Label>
          <Input id={`${id}-c${String(i)}`} type="number" required bind:value={corners[i]} />
        </div>
      {/each}
    </div>
    <div class="row">
      <Button type="submit">Remplir</Button>
      <span class="hint" role="status">{fillStatus}</span>
    </div>
  </form>

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
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
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
