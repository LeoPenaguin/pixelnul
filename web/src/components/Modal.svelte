<!-- Modal shell shared by the dialogs: shadcn's Dialog (focus trap, Escape, click outside, focus restored),
     in the panels' look. The content only exists while open. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import * as Dialog from './ui/dialog'

  // initialFocus: element to focus on open (default: the first focusable one, the close button).
  type Props = { title: string; children: Snippet; initialFocus?: () => HTMLElement | undefined }
  const { title, children, initialFocus }: Props = $props()
  let shown = $state(false)

  export function open() {
    shown = true
  }

  export function close() {
    shown = false
  }

  function autofocus(e: Event) {
    const el = initialFocus?.()
    if (!el) return
    e.preventDefault()
    el.focus()
  }
</script>

<Dialog.Root bind:open={shown}>
  <Dialog.Content class="panel modal" onOpenAutoFocus={autofocus}>
    <!-- The body scrolls, not the panel: the close cross straddles its corner. -->
    <div class="body">
      <Dialog.Title class="title">{title}</Dialog.Title>
      {@render children()}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Always inside the screen, 16 px from its edges, scrolling when taller. The panel is zoomed by the
     interface size setting: the screen size is divided by it. */
  :global(.modal) {
    max-width: min(440px, calc((100vw - 32px) / var(--ui-scale, 1)));
    line-height: 1.4;
  }
  .body {
    max-height: calc((100dvh - 32px) / var(--ui-scale, 1));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px 18px;
  }
  :global(.modal) :global(.title) {
    margin: 4px 8px 14px 0;
    font-size: var(--text-base);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--tracking-tight);
    line-height: 1.2;
  }
  /* Section titles of every dialog; the first one sits right under the title. */
  :global(.modal) :global(h3) {
    margin: 18px 0 8px;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-bold);
  }
  :global(.modal .title + h3) {
    margin-top: 0;
  }
</style>
