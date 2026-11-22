<!-- Content of a keyboard key: its text, or a library icon with its name for screen readers. -->
<script lang="ts" module>
  import type { Component } from 'svelte'

  export type Key = string | { icon: Component; name: string }
</script>

<script lang="ts">
  type Props = { key: Key; size?: number }
  const { key, size = 14 }: Props = $props()
</script>

{#if typeof key === 'string'}{key}{:else}<key.icon width={size} height={size} aria-hidden="true" /><span class="sr-only"
    >{key.name}</span
  >{/if}
