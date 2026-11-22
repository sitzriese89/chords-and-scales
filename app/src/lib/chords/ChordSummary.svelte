<!--
  @component
  The heading row of the Chords page (SPEC §5.3, ADR-54): the chosen chord's symbol in the
  display style (ADR-33), its name (with a slash chord's bass, the Roman numeral and the degree
  it was chosen on), its tags (ADR-41) and its notes, then **▶ Strum**, **Clear chord** and
  "Add chord to sheet". Strum plays the shape chosen in the voicing browser if there is one,
  else the chord stacked up from its lowest root (lowest string first, ADR-28, ADR-32, ADR-37).
  "Add chord to sheet" puts the chord on the export sheet as a neck diagram: alone, or over the
  scale for a chord on a degree (ADR-43). While no chord is chosen it says how to choose one,
  or why the picked degree has none.

  The page has no fretboard: the chord's shapes follow in the voicing browser, which the app
  places under this row.
-->
<script lang="ts">
  import { getAudio } from '../audio';
  import { getSettings } from '../settings';
  import AddToSheet from '../sheet/AddToSheet.svelte';
  import { chordItem } from '../sheet/capture';
  import { getTagFilters } from '../tags';
  import { getChordState } from './state.svelte';
  import { chordView } from './view';

  const settings = getSettings();
  const audio = getAudio();
  const chordState = getChordState();
  const tagFilter = getTagFilters().chords;

  const active = $derived(chordState.active);
  const activeChordTags = $derived(active ? tagFilter.tagsOf(active.chord.id) : []);
  const view = $derived(active ? chordView(settings.current, active, chordState.voicing) : null);

  /** The chord for the export sheet: alone, or over the scale it was chosen on. */
  function addChord() {
    const shown = chordState.active;
    if (!shown) return null;
    return chordItem(settings.current, {
      root: shown.root,
      chordId: shown.chord.id,
      fromScale: shown.fromScale,
      bass: shown.bass,
    });
  }
</script>

<section class="chord-summary" aria-live="polite" aria-label="Chosen chord">
  {#if active && view}
    <div class="heading">
      <h2>{view.symbol}</h2>
      <span class="name">
        {view.name}{active.bass ? `, bass ${active.bass}` : ''}{active.numeral
          ? ` (${active.numeral})`
          : ''}{active.fromScale
          ? ` on degree ${(chordState.degree ?? 0) + 1} of ${chordState.scale.root} ${chordState.scale.info.name}`
          : ''}
      </span>
      <dl class="notes" aria-label="Notes of {view.symbol}">
        {#each view.notes as note (note.semitones)}
          <div class="note" class:root={note.semitones === 0}>
            <dt>{note.interval}</dt>
            <dd>{note.name}</dd>
          </div>
        {/each}
      </dl>
      <div class="actions">
        <button
          type="button"
          class="strum"
          disabled={view.strum.length === 0}
          aria-label="Strum {view.symbol}"
          onclick={() => audio.strum(view.strum)}
        >
          <span aria-hidden="true">▶</span> Strum
        </button>
        <button type="button" onclick={() => chordState.clear()}>Clear chord</button>
        <AddToSheet what="chord" make={addChord} />
        {#if settings.current.audio.muted}
          <span class="muted">Sound is muted.</span>
        {/if}
      </div>
    </div>
    <p class="muted chord-tags">
      Tags: {activeChordTags.length > 0 ? activeChordTags.join(', ') : 'none'}
    </p>
  {:else if chordState.problem}
    <p class="muted">{chordState.problem}</p>
  {:else if chordState.mode === 'symbol'}
    <p class="muted">Type a chord symbol under ☰ Choose chord to see its notes and shapes.</p>
  {:else}
    <p class="muted">
      Choose a chord with ☰ Choose chord, or a degree chord in Harmonize on the Scales page, to see
      its notes and shapes.
    </p>
  {/if}
</section>

<style>
  .chord-summary {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .name {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .notes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
  }

  .note {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 2.25rem;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--surface-raised);
  }

  .note.root {
    border-color: var(--fretboard-root);
    border-width: 2px;
  }

  dt {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  dd {
    margin: 0;
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
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

  button.strum {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  button.strum:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
