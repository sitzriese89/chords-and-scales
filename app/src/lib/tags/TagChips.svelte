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

  button {
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    padding: 0.0625rem 0.5rem;
    cursor: pointer;
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
    border-radius: 0.375rem;
    color: var(--text-muted);
  }

  button:hover {
    border-color: var(--accent);
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
