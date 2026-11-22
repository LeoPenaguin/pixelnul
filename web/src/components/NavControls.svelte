<!-- Bottom-right navigation buttons: zoom, recenter, keyboard help. -->
<script lang="ts">
  import type { Component } from 'svelte'
  import Plus from '~icons/mingcute/add-fill'
  import Keyboard from '~icons/mingcute/keyboard-fill'
  import Minus from '~icons/mingcute/minimize-fill'
  import KeyCap, { type Key } from './KeyCap.svelte'
  import { Button } from './ui/button'
  import * as Tooltip from './ui/tooltip'

  type Props = {
    onzoomin: () => void
    onzoomout: () => void
    onrecenter: () => void
    onhelp: () => void
  }
  const { onzoomin, onzoomout, onrecenter, onhelp }: Props = $props()
</script>

{#snippet tool(label: string, key: Key, keys: string, onclick: () => void, Icon: Component | string, dialog = false)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon-lg"
          aria-label={label}
          aria-keyshortcuts={keys}
          aria-haspopup={dialog ? 'dialog' : undefined}
          {onclick}
        >
          {#if typeof Icon === 'string'}
            <span class="text" aria-hidden="true">{Icon}</span>
          {:else}
            <Icon width="18" height="18" aria-hidden="true" />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="left" sideOffset={8}
      ><span>{label}</span><kbd><KeyCap {key} size={12} /></kbd></Tooltip.Content
    >
  </Tooltip.Root>
{/snippet}

<!-- ponytail: provider local to the only tooltip user; move it to App when other panels get tooltips. -->
<Tooltip.Provider delayDuration={300}>
  <div class="panel controls" role="group" aria-label="Navigation">
    {@render tool('Zoomer', { icon: Plus, name: 'plus' }, '+', onzoomin, Plus)}
    {@render tool('Dézoomer', { icon: Minus, name: 'moins' }, '-', onzoomout, Minus)}
    <hr />
    {@render tool('Recentrer sur 0, 0', '0', '0', onrecenter, '0,0')}
    <hr />
    {@render tool('Raccourcis clavier', '?', 'Shift+?', onhelp, Keyboard, true)}
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
  /* Same look as the toolbar separator: 2 px, joining the panel border (cancels the 4 px padding). */
  hr {
    margin: 2px -4px;
    border: 0;
    border-top: 2px solid var(--ink);
  }
  /* Text face ("0,0"): clearer than any icon for "back to the origin". */
  .text {
    font: 700 13px var(--font);
    letter-spacing: -0.02em;
  }
  kbd {
    display: inline-flex;
    align-items: center;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--highlight);
    color: var(--ink);
    font: 700 12px var(--font);
  }
</style>
