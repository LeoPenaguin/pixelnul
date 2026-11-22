<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLInputAttributes } from 'svelte/elements'

  // No file inputs here: shadcn's `type="file"` branch is dropped. `value` typed, not `any`.
  type Props = WithElementRef<Omit<HTMLInputAttributes, 'value'>> & { value?: string | number | null }

  let { ref = $bindable(null), value = $bindable(), class: className, ...restProps }: Props = $props()
</script>

<input
  bind:this={ref}
  data-slot="input"
  class={cn(
    'h-8 w-full min-w-0 rounded-md border-2 border-foreground bg-secondary px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
    className,
  )}
  bind:value
  {...restProps}
/>
