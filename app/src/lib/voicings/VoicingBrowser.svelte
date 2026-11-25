<!--
  @component
  The voicing browser on the Chords page (SPEC §5.6, ADR-37, ADR-54), set off from the chord's
  heading row by a rule: the constraints (max fret span, start fret, and open strings, muted
  strings and inversions as toggle chips) in one toolbar, saved in the settings, and the
  core's ranked shapes of the chosen chord on the current instrument, tuning, fret count and
  capo, best first, as a grid of cards across the page's width (ADR-59): each a chord diagram
  (ADR-49) drawn to its card's width, over a footer with the shape (`x32010`) and, where they
  apply, its bass and left-out tones. The footer is visual: the shape is the button's and the
  diagram's accessible name. Choosing a shape marks it (`aria-pressed`, an accent-tinted card,
  a 2px ring and a tick) and strums it; choosing it again unchooses it. No neck shows it. Nothing is shown while no chord is chosen. "Add shape
  to sheet", at the heading's far end and enabled while a shape is chosen, puts its diagram on
  the export sheet (ADR-43).

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
  /**
   * The grid's diagrams are drawn larger than the sheet's (ADR-54). This is their natural
   * size; the card has the last word: the diagram is drawn to its width (ADR-59), about 200 px
   * on a laptop-wide window, six cards in a row.
   */
  const DIAGRAM_SCALE = 1.75;

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

  /** Chooses the shape and strums it; choosing the chosen one again unchooses it. */
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

  /** A shape's bass when it is an inversion and the tones it leaves out: `bass 3`, `no 5`. */
  function notes(voicing: ChordVoicing): string[] {
    const parts: string[] = [];
    if (voicing.bass !== '1') parts.push(`bass ${voicing.bass}`);
    if (voicing.omitted.length > 0) parts.push(`no ${voicing.omitted.join(', ')}`);
    return parts;
  }

  /** What a shape is called: `x32010`, with its bass and left-out tones. */
  function describe(voicing: ChordVoicing): string {
    return [shapeText(voicing), ...notes(voicing)].join(', ');
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
      <span class="add-shape">
        <AddToSheet what="shape" disabled={!chordState.voicing} make={addShape} />
      </span>
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
      <span class="divider" aria-hidden="true"></span>
      <!-- Toggle chips: the native checkbox lies invisibly over its chip, so focus, Space and
           screen readers work as for any checkbox. -->
      <label class="toggle">
        <input
          type="checkbox"
          checked={constraints.openStrings}
          onchange={(e) => constrain({ openStrings: e.currentTarget.checked })}
        />
        <span>Open strings</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          checked={constraints.mutedStrings}
          onchange={(e) => constrain({ mutedStrings: e.currentTarget.checked })}
        />
        <span>Muted strings</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          checked={constraints.inversions}
          onchange={(e) => constrain({ inversions: e.currentTarget.checked })}
        />
        <span>Inversions</span>
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
          {@const extra = notes(voicing)}
          {@const pressed = chosen === shapeKey(voicing)}
          <li>
            <button
              type="button"
              class="voicing"
              aria-pressed={pressed}
              aria-label="{index + 1}. {text}"
              onclick={() => choose(voicing)}
            >
              <ChordDiagram
                {voicing}
                capo={settings.current.instrument.capo}
                leftHanded={settings.current.leftHanded}
                {label}
                scale={DIAGRAM_SCALE}
                ariaLabel="{symbol}: {text}"
              />
              <!-- The footer repeats the accessible name, so screen readers skip it. -->
              <span class="footer" aria-hidden="true">
                {#if pressed}<span class="tick">✓</span>{/if}
                <span class="shape">{shapeText(voicing)}</span>
                {#if extra.length > 0}<span class="note">{extra.join(' · ')}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  /* A section of its own under the chord's heading row: a rule and room above it. */
  .voicings {
    flex: 1 1 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    margin-top: 0.75rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--border);
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1.125rem;
  }

  /* "Add shape to sheet" belongs to the chosen shape, not the title: it sits at the far end. */
  .add-shape {
    margin-left: auto;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* The constraints as one toolbar. */
  fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-raised);
    min-width: 0;
  }

  legend {
    float: left;
    padding: 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  .divider {
    align-self: stretch;
    width: 1px;
    background: var(--border);
  }

  .toggle {
    position: relative;
  }

  .toggle input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .toggle span {
    display: block;
    box-sizing: border-box;
    min-height: 1.75rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--surface);
    line-height: calc(1.75rem - 2px);
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
  }

  .toggle:hover span {
    border-color: var(--text-muted);
  }

  .toggle input:checked + span {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .toggle input:focus-visible + span {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  input[type='number'] {
    width: 4rem;
  }

  .problem {
    margin: 0;
    color: var(--text-danger);
    font-size: 0.875rem;
  }

  /* The shapes fill the width (ADR-56): as many columns as fit, the cards stretched to them. */
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    min-width: 0;
  }

  /* A voicing card (ADR-59): the diagram across its width, the footer at the bottom. */
  .voicing {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0.25rem 0.25rem 0.375rem;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      transform 120ms ease;
  }

  .voicing:hover {
    transform: translateY(-1px);
  }

  /*
    The diagram fills the card's width, keeping its proportions: a wide shape (five or six
    frets) shrinks to that width instead of spilling.
  */
  .voicing :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  /* The chosen shape: an accent-tinted card, a 2px accent ring and a tick. Hover is a border. */
  .voicing[aria-pressed='true'] {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface-raised));
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0 0.5rem;
    margin-top: auto;
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }

  .shape {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .note {
    color: var(--text-muted);
  }

  .tick {
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.125rem;
    text-align: center;
  }

  /* On the tint the note takes the full text colour, so it stays readable in every theme. */
  .voicing[aria-pressed='true'] .note {
    color: var(--text);
  }

  /* A phone-wide window: two shapes in a row. */
  @media (max-width: 40rem) {
    .list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }
  }
</style>
