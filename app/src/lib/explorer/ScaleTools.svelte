<!--
  @component
  The scale explorer's tool row (SPEC §5.1, ADR-52): **Harmonize** (§5.5, ADR-34) and **Select
  notes** (§5.4, ADR-38) side by side in one wrapping row, between the scale's summary and the
  neck. What a tool opens (the harmonize panel; the lookup's buttons and results) unfolds under
  the row across the full width, in the order of the buttons, so opening one never squeezes the
  other button. Both can be open at once.

  Harmonize is a disclosure: whether it is open is local and not saved. Select notes is the
  selection's mode toggle: the explorer owns `selection`, since its neck routes clicks to it.
  Harmonize is offered only when the app has a harmonizer.
-->
<script lang="ts">
  import { getChordState } from '../chords';
  import { HarmonizeView } from '../harmonize';
  import { FretboardLookup, type NoteSelection } from '../lookup';

  const { selection }: { selection: NoteSelection } = $props();

  const chordState = getChordState();
  const harmonizer = chordState.harmonizer;

  let harmonizing = $state(false);
</script>

<div class="tools">
  <div class="tool-row" role="group" aria-label="Scale tools">
    {#if harmonizer}
      <button
        type="button"
        class="harmonize"
        aria-expanded={harmonizing}
        aria-controls="harmonize-panel"
        onclick={() => (harmonizing = !harmonizing)}
      >
        Harmonize
      </button>
    {/if}
    <button
      type="button"
      class="select"
      aria-pressed={selection.selecting}
      onclick={() => (selection.selecting = !selection.selecting)}
    >
      Select notes
    </button>
  </div>

  {#if harmonizer && harmonizing}
    <HarmonizeView />
  {/if}

  {#if selection.selecting}
    <FretboardLookup {selection} />
  {/if}
</div>

<style>
  .tools {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .tool-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  button {
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .harmonize[aria-expanded='true'] {
    border-color: var(--accent);
  }

  .select[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
</style>
