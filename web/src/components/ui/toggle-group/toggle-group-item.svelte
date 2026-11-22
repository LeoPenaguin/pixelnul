<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps = $props()
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  class={cn(
    'inline-flex h-8 flex-1 shrink-0 cursor-pointer items-center justify-center rounded-none border-l-2 border-foreground px-2 text-sm whitespace-nowrap transition-colors outline-none first:border-l-0 hover:bg-secondary focus-visible:z-10 focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-ring focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:font-bold',
    className,
  )}
  {value}
  {...restProps}
/>
