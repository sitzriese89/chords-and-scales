<!--
  @component
  The tag chips of a picker (SPEC §5.7, ADR-41): one toggle button per tag that can apply to
  the picker's kind. Items must carry every chip that is on (AND). "Clear tags" turns them all
  off.
-->
<script lang="ts" generics="T extends { id: string }">
  import type { TagFilter } from './filter.svelte';

  const { filter, label }: { filter: TagFilter<T>; label: string } = $props();
</script>

<div class="tags" role="group" aria-label={label}>
  {#each filter.available as tag (tag)}
    <button
      type="button"
      class="chip"
      aria-pressed={filter.isSelected(tag)}
      onclick={() => filter.toggle(tag)}>{tag}</button
    >
  {/each}
  {#if filter.active.length > 0}
    <button type="button" class="clear" onclick={() => filter.clear()}>Clear tags</button>
  {/if}
</div>

<style>
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  /* Chips are smaller than the shared buttons: a row of them reads as one filter. */
  button {
    min-height: 1.625rem;
    padding: 0 0.5rem;
    font-size: 0.8125rem;
  }

  .chip {
    border-radius: 999px;
  }

  .chip[aria-pressed='true'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .clear {
    color: var(--text-muted);
  }
</style>
