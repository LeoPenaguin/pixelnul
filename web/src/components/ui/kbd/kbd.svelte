<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props()
</script>

<kbd
  bind:this={ref}
  data-slot="kbd"
  class={cn(
    'pointer-events-none inline-grid h-6 min-w-6 place-items-center rounded-sm border-2 border-foreground bg-secondary px-1.5 font-[inherit] leading-none text-foreground select-none has-[svg]:px-0 in-data-[slot=tooltip-content]:h-auto in-data-[slot=tooltip-content]:min-w-0 in-data-[slot=tooltip-content]:border-0 in-data-[slot=tooltip-content]:px-1.25 in-data-[slot=tooltip-content]:text-xs in-data-[slot=tooltip-content]:font-bold',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</kbd>
