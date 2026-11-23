<!--
  @component
  An "Add … to sheet" button (SPEC §5.10, ADR-43): adds the item `make` returns to the export
  sheet and says so next to the button until the next click. `what` names the item in the
  button ("Add scale to sheet"); `disabled` while there is nothing to add.
-->
<script lang="ts">
  import type { SheetItem } from './schema';
  import { getSheet } from './store.svelte';

  interface Props {
    /** What is added, for the button: `scale`, `tab`, `chord`, `shape`. */
    what: string;
    /** The item to add, made at the time of the click. */
    make: () => SheetItem | null;
    disabled?: boolean;
  }

  let { what, make, disabled = false }: Props = $props();

  const sheet = getSheet();
  let added = $state<string | null>(null);

  function add() {
    const item = make();
    if (!item) return;
    sheet.add(item);
    const count = sheet.items.length;
    added = `Added to the sheet (${count === 1 ? '1 item' : `${count} items`}).`;
  }
</script>

<span class="add">
  <button type="button" {disabled} onclick={add}>Add {what} to sheet</button>
  {#if added}
    <span class="status" role="status">{added}</span>
  {/if}
</span>

<style>
  .add {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
  }

  .status {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
