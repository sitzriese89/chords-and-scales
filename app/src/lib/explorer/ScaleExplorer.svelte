<!--
  @component
  The Scales page (ADR-55, "neck first"): the scale's notes on the root across the whole neck
  of the current instrument (tuning, fret count, capo, left-handed from the settings), and
  never a chord: the chosen chord and its shapes are on the Chords page (ADR-54). Top to
  bottom, which is also the reading and tab order:

  1. the summary row: the scale's name, its notes as one inline line, and at its right end the
     view toggles (`ViewControls`: labels, accidentals), which wrap below on a narrow window;
  2. the neck on a raised panel; on a narrow window it keeps a minimum width and scrolls
     sideways inside the panel instead of shrinking the dots;
  3. the tool row (`ScaleTools`, ADR-52: Harmonize, ADR-34, and Select notes, ADR-38, with
     "Add scale to sheet" at its right end) and the panels the tools open;
  4. the tab of one position (ADR-25): heading, Play, "Add tab to sheet" and the position
     controls on the left, the tab on the right; one column on a narrow window. The
     position's notes are highlighted on the neck.

  Everything shown comes from the core (`explorerView`). "Add scale to sheet" and "Add tab to
  sheet" put the neck or the tab, as shown, on the export sheet (ADR-43).

  In reverse lookup's select mode (ADR-38) a click on the neck selects or unselects the note
  there (playing it when it is added) instead of only playing it, and the selected notes are
  ringed on the neck over what it shows.
-->
<script lang="ts">
  import { getAudio } from '../audio';
  import { Fretboard, MIN_NECK_WIDTH, type FretPosition } from '../fretboard';
  import { NoteSelection, withSelection } from '../lookup';
  import { getSettings } from '../settings';
  import AddToSheet from '../sheet/AddToSheet.svelte';
  import { scaleItem, tabItem } from '../sheet/capture';
  import { PositionControls, TabView } from '../tab';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import ScaleTools from './ScaleTools.svelte';
  import ViewControls from './ViewControls.svelte';
  import { explorerView, positionKey } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const audio = getAudio();
  // The neck shows the scale only; chords and their shapes are on the Chords page (ADR-54).
  const view = $derived.by(() => {
    // Re-read the catalogs when a user scale or tuning was saved or deleted (ADR-24).
    void catalogs.revision;
    return explorerView(settings.current);
  });
  const title = $derived(`${view.root} ${view.scale.name}`);

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
    <!-- One inline line, "A 1 · C ♭3 · …"; the root is underlined as well as coloured. -->
    <ul class="notes" aria-label="Notes of {title}">
      {#each view.notes as note (note.semitones)}
        <li class:root={note.semitones === 0}>
          <span class="name">{note.name}</span>
          <span class="interval">{note.interval}</span>
        </li>
      {/each}
    </ul>
    <div class="view-controls">
      <ViewControls />
    </div>
  </div>

  {#each view.fallbacks as fallback (fallback)}
    <p class="fallback">{fallback}</p>
  {/each}

  <div class="neck">
    <div class="neck-drawing" style:min-width="{MIN_NECK_WIDTH}px">
      <Fretboard
        strings={view.tuning.notes.length}
        frets={view.frets}
        capo={view.capo}
        {dots}
        selected={selecting ? selection.notes : []}
        leftHanded={settings.current.leftHanded}
        ariaLabel="Fretboard: {title}, {view.tuning.name} tuning{selecting
          ? ', selecting notes'
          : ''}"
        onactivate={activate}
      />
    </div>
  </div>

  <ScaleTools {selection}>
    {#snippet end()}
      <AddToSheet what="scale" make={() => scaleItem(settings.current)} />
    {/snippet}
  </ScaleTools>

  <section class="tab-section" aria-labelledby="tab-title">
    <div class="tab-side">
      <div class="tab-heading">
        <h3 id="tab-title">Tab: {view.position.description}</h3>
        <button
          type="button"
          class="play primary"
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
    </div>
    {#if view.tabNotes.length > 0}
      <div class="tab-main">
        <TabView
          strings={view.tabStrings}
          notes={view.tabNotes}
          capo={view.capo}
          ariaLabel="Tab: {title}, {view.position.description}"
        />
      </div>
    {/if}
  </section>
</section>

<style>
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
    font-size: 1.5rem;
  }

  .notes {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notes li {
    white-space: nowrap;
  }

  /* " · " between the notes; generated, so screen readers read the list, not the dots. */
  .notes li + li::before {
    content: '·';
    content: '·' / '';
    padding: 0 0.5em;
    color: var(--text-muted);
  }

  .name {
    font-weight: 700;
    color: var(--text);
  }

  .interval {
    color: var(--text-muted);
  }

  /* The root is underlined, not only coloured (SPEC §5.1: never colour alone). */
  .root .name {
    text-decoration: underline 2px var(--fretboard-root);
    text-underline-offset: 0.2em;
  }

  .view-controls {
    margin-left: auto;
  }

  .fallback {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .neck {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-raised);
    overflow-x: auto;
  }

  .tab-section {
    display: grid;
    grid-template-columns: minmax(0, 24rem) minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem 1.5rem;
    min-width: 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .tab-side {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .tab-main {
    min-width: 0;
  }

  @media (max-width: 40rem) {
    .tab-section {
      grid-template-columns: minmax(0, 1fr);
    }
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

  .muted-note {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
