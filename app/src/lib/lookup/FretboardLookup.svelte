<!--
  @component
  Reverse lookup on the explorer's neck (SPEC §5.3 input mode 3, §5.4, ADR-38): the panel shown
  while select mode is on. **Select notes** in the explorer's tool row (`ScaleTools`, ADR-52)
  turns select mode on: clicks on the neck then add or remove notes (the explorer routes them to
  `selection`), the lowest selected note is the bass, and the chords and scales the core finds
  are listed under the selected notes, best first, on every click. Clicking a chord chooses it in
  the chord panel (and so on the neck); clicking a scale makes it the explorer's scale and root.
  **Save as scale** and **Save as chord** open the editors with the selection, on the bass.
  **Clear selection** empties it. Chord names follow the Standard/Jazz setting (ADR-33).
-->
<script lang="ts">
  import { getChordState } from '../chords';
  import { displayRoot } from '../explorer/view';
  import { getScaleEditor } from '../explorer/scale-editor.svelte';
  import { getSettings } from '../settings';
  import type { NoteSelection } from './selection.svelte';
  import { selectionDraft, type ChordResult, type ScaleResult } from './view';

  const { selection }: { selection: NoteSelection } = $props();

  const settings = getSettings();
  const chordState = getChordState();
  const scaleEditor = getScaleEditor();

  const notes = $derived(selection.notes);
  const results = $derived(selection.results);
  /** The selected notes with their octaves, lowest first: `A2 (bass) E3 A3 C♯4 E4`. */
  const notesText = $derived(
    notes.map((note, i) => (i === 0 ? `${note.pitch} (bass)` : note.pitch)).join(' '),
  );
  const enough = $derived(new Set(notes.map((note) => note.pitchClass)).size >= 2);

  function ignore() {
    // The values are always valid settings; a failed save is shown by the store's warning.
  }

  /** Whether the chord panel shows this chord, bass included. */
  function isChosen(result: ChordResult): boolean {
    const active = chordState.active;
    return (
      active !== null &&
      active.root === result.root &&
      active.chord.id === result.chordId &&
      (active.bass ?? null) === result.bass
    );
  }

  function isShown(result: ScaleResult): boolean {
    const { root, scale } = settings.current.lastView;
    return scale === result.scaleId && displayRoot(root) === result.root;
  }

  function chooseChord(result: ChordResult) {
    chordState.chooseChord(result.root, result.chordId, result.bass);
    if (settings.current.chordPanel.collapsed) {
      settings.update({ chordPanel: { collapsed: false } }).catch(ignore);
    }
  }

  /** The scale becomes the explorer's; a chosen chord is cleared so the neck shows the scale. */
  function chooseScale(result: ScaleResult) {
    chordState.clear();
    settings.update({ lastView: { root: result.root, scale: result.scaleId } }).catch(ignore);
  }

  function saveAs(kind: 'scale' | 'chord') {
    const draft = selectionDraft(notes, kind);
    if (!draft) return;
    if (kind === 'scale') scaleEditor.newScale(draft.intervals, draft.root);
    else chordState.newChord(draft.intervals, draft.root);
  }
</script>

<section id="lookup-panel" class="lookup" aria-label="Find chords and scales">
  <div class="controls">
    <button type="button" disabled={notes.length === 0} onclick={() => selection.clear()}>
      Clear selection
    </button>
    <button type="button" disabled={!enough} onclick={() => saveAs('scale')}>
      Save as scale
    </button>
    <button type="button" disabled={!enough} onclick={() => saveAs('chord')}>
      Save as chord
    </button>
  </div>

  <p class="selected" aria-live="polite">
    {#if notes.length === 0}
      Click notes on the neck to find the chords and scales they make.
    {:else}
      <span class="label">Selected:</span>
      <span class="note">{notesText}</span>
    {/if}
  </p>

  {#if notes.length > 0 && !enough}
    <p class="hint">Select at least two different notes.</p>
  {:else if enough}
    <div class="results">
      <section aria-labelledby="lookup-chords">
        <h3 id="lookup-chords">Chords</h3>
        {#if results.chords.length === 0}
          <p class="hint">No chord in the catalog has exactly these notes.</p>
        {:else}
          <ol aria-label="Chords of the selected notes">
            {#each results.chords as result (result.key)}
              <li>
                <button
                  type="button"
                  class="result"
                  aria-pressed={isChosen(result)}
                  onclick={() => chooseChord(result)}
                >
                  <span class="name">{result.symbol}</span>
                  <span class="detail">{result.description}</span>
                </button>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
      <section aria-labelledby="lookup-scales">
        <h3 id="lookup-scales">Scales</h3>
        {#if results.scales.length === 0}
          <p class="hint">No scale in the catalog has all these notes.</p>
        {:else}
          <ol aria-label="Scales with the selected notes">
            {#each results.scales as result (result.key)}
              <li>
                <button
                  type="button"
                  class="result"
                  aria-pressed={isShown(result)}
                  onclick={() => chooseScale(result)}
                >
                  <span class="name">{result.name}</span>
                  <span class="detail"
                    >{result.extra === 0
                      ? 'no other notes'
                      : `${result.extra} other note${result.extra === 1 ? '' : 's'}`}</span
                  >
                </button>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .lookup {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
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

  button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .selected,
  .hint {
    margin: 0;
    font-size: 0.875rem;
  }

  .hint {
    color: var(--text-muted);
  }

  .label {
    color: var(--text-muted);
  }

  .note {
    font-weight: 600;
  }

  .results {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.5rem 1rem;
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 0.9375rem;
  }

  ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .result {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.25rem 0.5rem;
    text-align: left;
  }

  .result[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .name {
    font-weight: 600;
  }

  .detail {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
