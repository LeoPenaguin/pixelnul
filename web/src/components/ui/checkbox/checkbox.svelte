<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from 'bits-ui'
  import CheckIcon from '~icons/mingcute/check-fill'
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js'

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props()
</script>

<CheckboxPrimitive.Root
  bind:ref
  data-slot="checkbox"
  class={cn(
    'size-4.5 rounded-sm border-2 border-foreground bg-background text-foreground data-checked:bg-accent peer relative flex shrink-0 items-center justify-center outline-none focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1 after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )}
  bind:checked
  {...restProps}
>
  {#snippet children({ checked: on })}
    <div data-slot="checkbox-indicator" class="[&>svg]:size-3.5 grid place-content-center text-current transition-none">
      {#if on}
        <CheckIcon />
      {/if}
    </div>
  {/snippet}
</CheckboxPrimitive.Root>
