<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import XIcon from '~icons/mingcute/close-fill'
  import { Button } from '$components/ui/button/index.js'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'
  import DialogOverlay from './dialog-overlay.svelte'
  import DialogPortal from './dialog-portal.svelte'
  import type { Snippet } from 'svelte'
  import type { ComponentProps } from 'svelte'

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>
    children: Snippet
  } = $props()
</script>

<DialogPortal {...portalProps}>
  <DialogOverlay />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      'fixed top-1/2 left-1/2 z-50 w-full -translate-1/2  outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none',
      className,
    )}
    {...restProps}
  >
    {@render children()}
    <DialogPrimitive.Close data-slot="dialog-close">
      {#snippet child({ props })}
        <Button variant="ghost" class="absolute top-3 right-3" size="icon" title="Fermer (Échap)" {...props}>
          <XIcon class="size-5" aria-hidden="true" />
          <span class="sr-only">Fermer</span>
        </Button>
      {/snippet}
    </DialogPrimitive.Close>
  </DialogPrimitive.Content>
</DialogPortal>
