<!-- Segmented control: the items share one ink frame. shadcn's spacing and variants are dropped (one look here). -->
<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: ToggleGroupPrimitive.RootProps = $props()
</script>

<!-- Discriminated unions and destructuring (needed for bindable) do not get along: `value` is cast to `never`. -->
<ToggleGroupPrimitive.Root
  bind:value={value as never}
  bind:ref
  data-slot="toggle-group"
  class={cn('flex w-full overflow-hidden rounded-md border-2 border-foreground', className)}
  {...restProps}
/>
