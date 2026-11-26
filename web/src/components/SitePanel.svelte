<!-- Site panel (top left, above the X / Y panel): brand | site links | account. -->
<script lang="ts">
  import Heart from '~icons/mingcute/heart-fill'
  import UserIcon from '~icons/mingcute/user-3-fill'
  import type { User } from '../lib/api'
  import { Button } from './ui/button'
  import { Separator } from './ui/separator'

  // ponytail: placeholder (the code repository) until a donation page exists; put its URL here.
  const DONATE_URL = 'https://github.com/LeoPenaguin/pixels'

  // auth: sign-in on (otherwise no account button). user: null when signed out. onadmin: moderation (admins only).
  type Props = {
    onabout: () => void
    onstats: () => void
    auth: boolean
    user: User | null
    onaccount: () => void
    onadmin: () => void
  }
  const { onabout, onstats, auth, user, onaccount, onadmin }: Props = $props()
</script>

<header class="panel site">
  <!-- The logo is the favicon (Pixel-chat, 10 × 10 pixels): 3 px per pixel, 2 on phones to keep the panel on one row. -->
  <!-- Phones: logo, heart and account alone keep the panel on one row; the words stay for screen readers. -->
  <span class="brand">
    <img class="max-[480px]:size-5" src="/favicon.svg" alt="" width="30" height="30" />
    <span class="max-[480px]:sr-only">pixelnul</span>
  </span>
  <Separator orientation="vertical" decorative class="sep" />
  <nav aria-label="Site">
    <Button variant="ghost" aria-haspopup="dialog" onclick={onstats}>Stats</Button>
    <Button variant="ghost" aria-haspopup="dialog" onclick={onabout}>À propos</Button>
    <Button variant="ghost" class="donate" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
      <Heart aria-hidden="true" />
      <span class="max-[480px]:sr-only">Faire un don</span>
    </Button>
    {#if auth}
      <Separator orientation="vertical" decorative class="sep" />
      {#if user?.admin}
        <Button variant="ghost" aria-haspopup="dialog" onclick={onadmin}>Modération</Button>
      {/if}
      <!-- Signed in: the pseudo is the name. -->
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        aria-label={user ? `Mon compte : ${user.pseudo || 'pseudo à choisir'}` : undefined}
        onclick={onaccount}
      >
        <UserIcon aria-hidden="true" />
        <span>{user ? user.pseudo || 'Mon compte' : 'Se connecter'}</span>
      </Button>
    {/if}
  </nav>
</header>

<style>
  /* Positioned by App, in the top-left column. One row: brand, links, then the account. */
  .site {
    position: static;
    /* The panel is zoomed by the interface size setting: divide the screen width by it. */
    max-width: calc((100vw - 24px) / var(--ui-scale, 1));
    display: flex;
    flex-wrap: wrap; /* enlarged interface on a phone: the links go to a second line, never off-screen */
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: var(--font-weight-bold);
  }
  nav {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Like the toolbar separator: joins the panel border (cancels the 4 px padding). */
  .site :global(.sep) {
    margin: -4px 4px;
  }
  /* Same look as the "À propos" button next to it: only the heart is in colour. */
  .site :global(.donate svg) {
    color: var(--active);
  }
</style>
