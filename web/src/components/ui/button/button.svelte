<script lang="ts" module>
  import { type VariantProps, tv } from 'tailwind-variants'
  import { cn, type WithElementRef } from '$lib/utils.js'
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

  export const buttonVariants = tv({
    // Focus: the same red outline as every other control.
    base: "rounded-md border-2 border-transparent text-sm font-medium inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none cursor-pointer focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variants: {
      // Text buttons are neo-brutal, like the panels: ink border and a hard shadow that a press pushes in.
      // `ghost` is for icon buttons and links sitting flat inside a panel.
      variant: {
        default:
          'border-foreground bg-background text-foreground shadow-[2px_2px_0_var(--ink)] hover:bg-secondary active:translate-[2px] active:shadow-none motion-reduce:active:translate-none',
        destructive:
          'border-foreground bg-destructive text-white shadow-[2px_2px_0_var(--ink)] hover:bg-[color-mix(in_oklch,var(--destructive),var(--ink)_20%)] active:translate-[2px] active:shadow-none motion-reduce:active:translate-none',
        ghost: 'hover:bg-secondary',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5',
        sm: 'h-7 gap-1 px-2.5 text-[0.8rem]',
        lg: 'h-9 gap-1.5 px-3',
        icon: 'size-8',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  })

  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant']
  export type ButtonSize = VariantProps<typeof buttonVariants>['size']

  // With `href`, the button is a link (same look): shadcn-svelte's upstream behaviour.
  export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
    WithElementRef<HTMLAnchorAttributes> & {
      variant?: ButtonVariant
      size?: ButtonSize
    }
</script>

<script lang="ts">
  let {
    class: className,
    variant = 'default',
    size = 'default',
    ref = $bindable(null),
    href,
    type = 'button',
    disabled,
    children,
    ...restProps
  }: ButtonProps = $props()
</script>

{#if href}
  <a bind:this={ref} data-slot="button" class={cn(buttonVariants({ variant, size }), className)} {href} {...restProps}>
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={cn(buttonVariants({ variant, size }), className)}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
