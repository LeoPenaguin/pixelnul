<!-- Site panel (top left, above the X / Y panel): brand, then site links. -->
<script lang="ts">
  import Heart from '~icons/mingcute/heart-fill'
  import { Button } from './ui/button'

  // ponytail: placeholder (the code repository) until a donation page exists; put its URL here.
  const DONATE_URL = 'https://github.com/LeoPenaguin/pixels'

  type Props = { onabout: () => void }
  const { onabout }: Props = $props()
</script>

<header class="panel site">
  <!-- The name next to it already says "Pixels": the logo is decorative. -->
  <img src="/logo.svg" alt="" width="24" height="24" />
  <span class="name">Pixels</span>
  <nav aria-label="Site">
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
    width: min(380px, calc(100vw - 24px));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 10px;
  }
  .name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
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
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: transparent;
    font-size: 14px;
    color: var(--ink);
    white-space: nowrap;
  }
  .donate:hover {
    background: var(--active);
  }
  .donate:focus-visible {
    outline: var(--stroke) solid var(--focus);
    outline-offset: 1px;
  }
  .donate :global(svg) {
    color: var(--active);
  }
  .donate:hover :global(svg) {
    color: var(--ink);
  }
</style>
