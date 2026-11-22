<!--
  @component
  The voicing browser in the chord panel (SPEC §5.6, ADR-37): the constraints (max fret span,
  start fret, open strings, muted strings, inversions), saved in the settings, and the core's
  ranked shapes of the panel's chord on the current instrument, tuning, fret count and capo, best
  first, each as a chord diagram (ADR-49) with no shape text under it: the shape (`x32010`)
  is the button's and the diagram's accessible name. Choosing a shape shows only its positions on the explorer's
  neck and strums it; choosing it again shows every position of the chord again. Nothing is
  shown while no chord is chosen. "Add shape to sheet", while a shape is chosen, puts its diagram on the
  export sheet (ADR-43).

  The shapes are the chord's own: a slash chord's bass (`Am7/G`) is not voiced, so the list is
  headed by the chord without it and says so.
-->
<script lang="ts">
  import { getAudio } from '../audio';
  import { chordSymbol } from '../chords/display';
  import { getChordState } from '../chords/state.svelte';
  import { shapePitches } from '../chords/strum';
  import { getSettings, MAX_VOICING_SPAN, type Settings } from '../settings';
  import AddToSheet from '../sheet/AddToSheet.svelte';
  import { voicingItem } from '../sheet/capture';
  import type { ChordVoicing } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import ChordDiagram from './ChordDiagram.svelte';
  import { shapeText } from './diagram';
  import { dotLabeller, shapeKey, voicingList } from './list';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const audio = getAudio();
  const chordState = getChordState();

  const SPANS = Array.from({ length: MAX_VOICING_SPAN }, (_, i) => i + 1);

  const active = $derived(chordState.active);
  const chord = $derived(active ? { root: active.root, chordId: active.chord.id } : null);
  const list = $derived.by(() => {
    // Re-read the catalogs when the user's chords or tunings changed (ADR-24).
    void catalogs.revision;
    return chord ? voicingList(settings.current, chord) : [];
  });
  /** The chord the shapes are of: without a slash chord's bass, which they don't voice. */
  const symbol = $derived(
    active ? chordSymbol(active.root, active.chord, settings.current.chordSymbols) : '',
  );
  const label = $derived(
    chord ? dotLabeller(settings.current.labels, chord, settings.current.accidentals) : () => '',
  );
  const chosen = $derived(chordState.voicing ? shapeKey(chordState.voicing) : null);
  const constraints = $derived(settings.current.voicings);

  function ignore() {
    // The values are always valid settings; a failed save is shown by the store's warning.
  }

  function constrain(change: Partial<Settings['voicings']>) {
    settings.update({ voicings: change }).catch(ignore);
  }

  /** The highest start fret: the neck's last fret (frets are absolute, ADR-18). */
  const lastFret = $derived(settings.current.instrument.frets);
  let startProblem = $state<string | null>(null);

  /** Saves a typed start fret, 0 to the last fret; anything else is refused and put back. */
  function setStartFret(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const value = input.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value > lastFret) {
      startProblem = `The start fret is a fret from 0 to ${lastFret}.`;
      input.value = String(constraints.startFret);
      return;
    }
    startProblem = null;
    constrain({ startFret: value });
  }

  /** Shows the shape alone on the neck and strums it; the chosen one again shows them all. */
  function choose(voicing: ChordVoicing) {
    if (chosen === shapeKey(voicing)) {
      chordState.voicing = null;
      return;
    }
    chordState.voicing = voicing;
    audio.strum(shapePitches(voicing));
  }

  /** The chosen shape as a chord diagram on the export sheet (ADR-43). */
  function addShape() {
    const voicing = chordState.voicing;
    if (!voicing || !chord) return null;
    return voicingItem(settings.current, chord, shapeKey(voicing));
  }

  /** What a shape is called: `x32010`, with its bass and left-out tones. */
  function describe(voicing: ChordVoicing): string {
    const parts = [shapeText(voicing)];
    if (voicing.bass !== '1') parts.push(`bass ${voicing.bass}`);
    if (voicing.omitted.length > 0) parts.push(`no ${voicing.omitted.join(', ')}`);
    return parts.join(', ');
  }
</script>

{#if active}
  <section class="voicings" aria-labelledby="voicings-title">
    <div class="heading">
      <h3 id="voicings-title">Voicings of {symbol}</h3>
      <span class="muted" aria-live="polite">
        {list.length === 0
          ? 'No shapes'
          : list.length === 1
            ? '1 shape'
            : `${list.length} shapes, best first`}
      </span>
      {#if chordState.voicing}
        <button type="button" onclick={() => (chordState.voicing = null)}>
          Show all positions
        </button>
        <AddToSheet what="shape" make={addShape} />
      {/if}
    </div>
    {#if active.bass}
      <p class="muted">Shapes of {symbol}; the {active.bass} bass isn't voiced.</p>
    {/if}

    <fieldset class="constraints">
      <legend>Constraints</legend>
      <label>
        Max fret span
        <select
          value={String(constraints.maxSpan)}
          onchange={(e) => constrain({ maxSpan: Number(e.currentTarget.value) })}
        >
          {#each SPANS as span (span)}
            <option value={String(span)}>{span}</option>
          {/each}
        </select>
      </label>
      <label>
        Start fret
        <input
          type="number"
          min="0"
          max={lastFret}
          step="1"
          value={constraints.startFret}
          onchange={setStartFret}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={constraints.openStrings}
          onchange={(e) => constrain({ openStrings: e.currentTarget.checked })}
        />
        Open strings
      </label>
      <label>
        <input
          type="checkbox"
          checked={constraints.mutedStrings}
          onchange={(e) => constrain({ mutedStrings: e.currentTarget.checked })}
        />
        Muted strings
      </label>
      <label>
        <input
          type="checkbox"
          checked={constraints.inversions}
          onchange={(e) => constrain({ inversions: e.currentTarget.checked })}
        />
        Inversions
      </label>
    </fieldset>
    {#if startProblem}
      <p class="problem" role="alert">{startProblem}</p>
    {/if}

    {#if list.length === 0}
      <p class="muted">No playable shape of {symbol} fits these constraints on this neck.</p>
    {:else}
      <ol class="list" aria-label="Voicings of {symbol}">
        {#each list as voicing, index (shapeKey(voicing))}
          {@const text = describe(voicing)}
          <li>
            <button
              type="button"
              class="voicing"
              aria-pressed={chosen === shapeKey(voicing)}
              aria-label="{index + 1}. {text}"
              onclick={() => choose(voicing)}
            >
              <ChordDiagram
                {voicing}
                capo={settings.current.instrument.capo}
                leftHanded={settings.current.leftHanded}
                {label}
                ariaLabel="{symbol}: {text}"
              />
              {#if voicing.bass !== '1' || voicing.omitted.length > 0}
                <span class="note">
                  {[
                    voicing.bass !== '1' ? `bass ${voicing.bass}` : '',
                    voicing.omitted.length > 0 ? `no ${voicing.omitted.join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  .voicings {
    flex: 1 1 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    float: left;
    padding: 0;
    margin-right: 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  select,
  input[type='number'] {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.125rem 0.375rem;
  }

  input[type='number'] {
    width: 4rem;
  }

  .problem {
    margin: 0;
    color: var(--text-danger);
    font-size: 0.875rem;
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

  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .voicing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.375rem 0.25rem 0.25rem;
    border-color: var(--border);
  }

  .voicing[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .voicing:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .note {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
</style>
