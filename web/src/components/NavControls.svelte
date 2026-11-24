<!-- Bottom-right controls: zoom, recenter, download, settings, keyboard help. -->
<script lang="ts">
  import type { Component } from 'svelte'
  import Plus from '~icons/mingcute/add-fill'
  import Download from '~icons/mingcute/download-2-fill'
  import Keyboard from '~icons/mingcute/keyboard-fill'
  import Minus from '~icons/mingcute/minimize-fill'
  import Gear from '~icons/mingcute/settings-1-fill'
  import KeyCap, { type Key } from './KeyCap.svelte'
  import { Button } from './ui/button'
  import { Kbd } from './ui/kbd'
  import { Separator } from './ui/separator'
  import * as Tooltip from './ui/tooltip'

  type Props = {
    onzoomin: () => void
    onzoomout: () => void
    onrecenter: () => void
    ondownload: () => void
    onsettings: () => void
    onhelp: () => void
  }
  const { onzoomin, onzoomout, onrecenter, ondownload, onsettings, onhelp }: Props = $props()
</script>

<!-- `key` (shown) and `keys` (aria-keyshortcuts): empty when the button has no shortcut. -->
{#snippet tool(label: string, key: Key, keys: string, onclick: () => void, Icon: Component | string, dialog = false)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          aria-keyshortcuts={keys || undefined}
          aria-haspopup={dialog ? 'dialog' : undefined}
          {onclick}
        >
          {#if typeof Icon === 'string'}
            <span class="text" aria-hidden="true">{Icon}</span>
          {:else}
            <!-- size-* class: the shadcn button shrinks unsized icons to 16 px --><Icon
              class="size-5.5"
              aria-hidden="true"
            />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="left" sideOffset={8}
      ><span>{label}</span>{#if key}<Kbd><KeyCap {key} size={12} /></Kbd>{/if}</Tooltip.Content
    >
  </Tooltip.Root>
{/snippet}

<!-- ponytail: provider local to the only tooltip user; move it to App when other panels get tooltips. -->
<Tooltip.Provider delayDuration={300}>
  <div class="panel controls" role="group" aria-label="Navigation">
    {@render tool('Zoomer', { icon: Plus, name: 'plus' }, '+', onzoomin, Plus)}
    {@render tool('Dézoomer', { icon: Minus, name: 'moins' }, '-', onzoomout, Minus)}
    <Separator class="sep" />
    {@render tool('Recentrer sur 0, 0', '0', '0', onrecenter, '0,0')}
    <Separator class="sep" />
    {@render tool("Télécharger l'image", '', '', ondownload, Download, true)}
    {@render tool('Paramètres', '', '', onsettings, Gear, true)}
    <Separator class="sep help" />
    <span class="help">{@render tool('Raccourcis clavier', '?', 'Shift+?', onhelp, Keyboard, true)}</span>
  </div>
</Tooltip.Provider>

<style>
  .controls {
    right: 12px;
    bottom: 16px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  span.help {
    display: contents;
  }
  /* Phones: above the toolbar, which takes the width. Zoomed with the panel, so it scales with the toolbar. */
  @media (max-width: 480px) {
    .controls {
      bottom: 76px;
    }
  }
  /* No keyboard on small touch screens: the shortcut list is useless there. */
  @media (pointer: coarse) and (max-width: 640px) {
    .controls :global(.help) {
      display: none;
    }
  }
  /* Same look as the toolbar separator: 2 px, joining the panel border (cancels the 4 px padding). */
  .controls :global(.sep) {
    width: auto;
    margin: 2px -4px;
  }
  /* Text face ("0,0"): clearer than any icon for "back to the origin". */
  .text {
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--tracking-tight);
  }
</style>
