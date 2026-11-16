<!--
  @component
  The neck for the current last view: the scale's notes on the root across the whole neck of
  the current instrument (tuning, fret count, capo, left-handed from the settings), with a
  summary of the scale and its Harmonize row (ADR-33) above it, and under it the tab of one position with its controls
  (ADR-25); the position's notes are highlighted on the neck. Everything shown comes from the
  core (`explorerView`).
-->
<script lang="ts">
  import { getAudio } from '../audio';
  import { getChordState } from '../chords';
  import { Fretboard, type FretPosition } from '../fretboard';
  import { HarmonizeView } from '../harmonize';
  import { getSettings } from '../settings';
  import { PositionControls, TabView } from '../tab';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { explorerView, positionKey } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const audio = getAudio();
  const chords = getChordState();
  const view = $derived.by(() => {
    // Re-read the catalogs when a user scale or tuning was saved or deleted (ADR-24).
    void catalogs.revision;
    return explorerView(settings.current, chords.onNeck);
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

  /** A click on a dot sounds it at its real pitch (tuning and fret, from the core). */
  function playDot(position: FretPosition) {
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
  </div>

  <HarmonizeView />

  {#each view.fallbacks as fallback (fallback)}
    <p class="fallback">{fallback}</p>
  {/each}

  <div class="neck">
    <Fretboard
      strings={view.tuning.notes.length}
      frets={view.frets}
      capo={view.capo}
      dots={view.dots}
      leftHanded={settings.current.leftHanded}
      ariaLabel="Fretboard: {neckTitle}, {view.tuning.name} tuning"
      onactivate={playDot}
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
