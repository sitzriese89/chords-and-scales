<!--
  @component
  The neck for the current last view: the scale's notes on the root across the whole neck of
  the current instrument (tuning, fret count, capo, left-handed from the settings), with a
  summary of the scale and its Harmonize row (ADR-34) above it, and under it the tab of one
  position with its controls (ADR-25); the position's notes are highlighted on the neck. Everything shown comes from the
  core (`explorerView`). "Add scale to sheet" and "Add tab to sheet" put the neck or the tab, as
  shown, on the export sheet (ADR-43).

  Reverse lookup (ADR-38) sits above the neck: in its select mode a click on the neck selects or
  unselects the note there (playing it when it is added) instead of only playing it, and the
  selected notes are ringed on the neck over what it shows.
-->
<script lang="ts">
  import { getAudio } from '../audio';
  import { getChordState } from '../chords';
  import { Fretboard, type FretPosition } from '../fretboard';
  import { HarmonizeView } from '../harmonize';
  import { FretboardLookup, NoteSelection, withSelection } from '../lookup';
  import { getSettings } from '../settings';
  import AddToSheet from '../sheet/AddToSheet.svelte';
  import { scaleItem, tabItem } from '../sheet/capture';
  import { PositionControls, TabView } from '../tab';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { explorerView, positionKey } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const audio = getAudio();
  const chords = getChordState();
  // PROTOTYPE (redesign): the prototype shell turns the chord overlay off.
  const {
    showChord = true,
    tools = 'top',
  }: { showChord?: boolean; tools?: 'top' | 'bottom' | 'row' | 'summary' } = $props();
  const view = $derived.by(() => {
    // Re-read the catalogs when a user scale or tuning was saved or deleted (ADR-24).
    void catalogs.revision;
    return explorerView(settings.current, showChord ? chords.onNeck : null);
  });
  const title = $derived(`${view.root} ${view.scale.name}`);
  /** What the neck shows: the scale, or a chord (over the scale when it comes from it). */
  const neckTitle = $derived(
    view.chord
      ? view.chord.overScale
        ? `${view.chord.name} over ${title}`
        : `${view.chord.name} chord`
      : title,
  );

  /** The notes selected for reverse lookup; not saved. */
  const selection = new NoteSelection(settings, catalogs);
  const selecting = $derived(selection.selecting);
  const dots = $derived(
    selecting ? withSelection(view.dots, selection.notes, settings.current.labels) : view.dots,
  );

  /**
   * A click on a dot sounds it at its real pitch (tuning and fret, from the core). In select mode
   * a click selects or unselects the position instead, and sounds a note it adds.
   */
  function activate(position: FretPosition) {
    if (selecting) {
      const added = selection.toggle(position);
      if (added) audio.playNote(added.midi);
      return;
    }
    const midi = view.pitches.get(positionKey(position));
    if (midi !== undefined) audio.playNote(midi);
  }

  /** The tab's position in its direction (up, down, or both), as shown in the tab. */
  function playPosition() {
    audio.playSequence(view.tabNotes.map((note) => note.midi));
  }
</script>

<section class="explorer" aria-labelledby="explorer-title">
  <div class="summary">
    <h2 id="explorer-title">{title}</h2>
    <dl class="notes" aria-label="Notes of {title}">
      {#each view.notes as note (note.semitones)}
        <div class="note" class:root={note.semitones === 0}>
          <dt>{note.interval}</dt>
          <dd>{note.name}</dd>
        </div>
      {/each}
    </dl>
    {#if tools === 'summary'}
      <div class="tools-inline">
        <HarmonizeView />
        <FretboardLookup {selection} />
      </div>
    {:else}
      <AddToSheet what="scale" make={() => scaleItem(settings.current)} />
    {/if}
  </div>

  {#if tools === 'top'}
    <HarmonizeView />

    <FretboardLookup {selection} />
  {:else if tools === 'row'}
    <div class="tools-row">
      <HarmonizeView />
      <FretboardLookup {selection} />
    </div>
  {/if}

  {#each view.fallbacks as fallback (fallback)}
    <p class="fallback">{fallback}</p>
  {/each}

  <div class="neck">
    <Fretboard
      strings={view.tuning.notes.length}
      frets={view.frets}
      capo={view.capo}
      {dots}
      selected={selecting ? selection.notes : []}
      leftHanded={settings.current.leftHanded}
      ariaLabel="Fretboard: {neckTitle}, {view.tuning.name} tuning{selecting
        ? ', selecting notes'
        : ''}"
      onactivate={activate}
    />
  </div>

  <section class="tab-section" aria-labelledby="tab-title">
    <div class="tab-heading">
      <h3 id="tab-title">Tab: {view.position.description}</h3>
      <button
        type="button"
        class="play"
        disabled={view.tabNotes.length === 0}
        aria-label="Play {view.position.description}"
        onclick={playPosition}
      >
        <span aria-hidden="true">▶</span> Play
      </button>
      <AddToSheet
        what="tab"
        disabled={view.tabNotes.length === 0}
        make={() => tabItem(settings.current, view.position.pattern)}
      />
      {#if settings.current.audio.muted}
        <span class="muted-note">Sound is muted.</span>
      {/if}
    </div>
    <PositionControls position={view.position} />
    {#if view.tabNotes.length > 0}
      <TabView
        strings={view.tabStrings}
        notes={view.tabNotes}
        capo={view.capo}
        ariaLabel="Tab: {title}, {view.position.description}"
      />
    {/if}
  </section>

  {#if tools === 'bottom'}
    <div class="tools-bottom">
      <HarmonizeView />
      <FretboardLookup {selection} />
    </div>
  {/if}
</section>

<style>
  /* PROTOTYPE (redesign) */
  .tools-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: flex-start;
  }

  .tools-inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: flex-start;
  }

  .tools-bottom {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .explorer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1.25rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
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

  .fallback {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .neck {
    overflow-x: auto;
  }

  .tab-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .tab-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }

  .play {
    font: inherit;
    font-size: 0.875rem;
    color: var(--accent-text);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }

  .play:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .play:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .muted-note {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
