<!-- Site panel (top left, above the X / Y panel): brand, then site links. -->
<script lang="ts">
  import Heart from '~icons/mingcute/heart-fill'
  import { Button } from './ui/button'

  // ponytail: placeholder (the code repository) until a donation page exists; put its URL here.
  const DONATE_URL = 'https://github.com/LeoPenaguin/pixels'

  type Props = { onabout: () => void; onstats: () => void }
  const { onabout, onstats }: Props = $props()
</script>

<header class="panel site">
  <!-- The name next to it already says "Pixels": the logo is decorative. -->
  <img src="/logo.svg" alt="" width="24" height="24" />
  <span class="name">Pixels</span>
  <nav aria-label="Site">
    <Button variant="ghost" aria-haspopup="dialog" onclick={onstats}>Stats</Button>
    <Button variant="ghost" aria-haspopup="dialog" onclick={onabout}>À propos</Button>
    <a class="donate" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
      <Heart width="16" height="16" aria-hidden="true" />
      Faire un don
    </a>
  </nav>
</header>

<style>
  /* Positioned by App, in the top-left column. */
  /* Fixed width, wider than its content; the links sit on the right. */
  .site {
    position: static;
    /* The panel is zoomed by the interface size setting: divide the screen width by it. */
    width: min(380px, calc((100vw - 24px) / var(--ui-scale, 1)));
    display: flex;
    flex-wrap: wrap; /* enlarged interface on a phone: the links go to a second line, never off-screen */
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
  }
  .name {
    font-size: var(--text-base);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--tracking-tight);
  }
  nav {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }
  .donate {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border-radius: var(--radius);
    color: var(--ink);
    white-space: nowrap;
  }
  /* Same weight as the "À propos" button next to it: only the heart is in colour. */
  .donate:hover {
    background: var(--highlight);
  }
  .donate:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
  .donate :global(svg) {
    color: var(--active);
  }
</style>
