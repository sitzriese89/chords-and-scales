<!--
  @component
  Harmonize for the explorer's scale (SPEC §5.5, ADR-34): the panel that the **Harmonize** button
  in the explorer's tool row (`ScaleTools`, ADR-52) opens. It shows the chord on every degree, as triads or 7th chords, each with its Roman numeral; degrees where
  no chord forms are marked "no chord". Clicking a chord chooses it by its degree, as the chord
  picker's degree input does, and switches to the Chords page, which shows it with its shapes
  (ADR-54). The size is the chord picker's: the toggle here and the one there are the same.
  Chord names follow the Standard/Jazz setting (ADR-33).

  Shown only when the app has a harmonizer (the chord picker's degree input is on); the tool row
  offers the button only then.
-->
<script lang="ts">
  import { getChordState, type ChordSize } from '../chords';
  import { getSettings } from '../settings';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { harmonizeRow } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const chordState = getChordState();
  const harmonizer = chordState.harmonizer;

  const SIZES: [ChordSize, string][] = [
    ['triads', 'Triads'],
    ['sevenths', '7th chords'],
  ];

  const scale = $derived(chordState.scale);
  const title = $derived(`${scale.root} ${scale.info.name}`);
  const row = $derived.by(() => {
    // Re-read the catalogs when a user scale or chord was saved or deleted (ADR-24).
    void catalogs.revision;
    if (!harmonizer) return [];
    return harmonizeRow(
      harmonizer,
      { id: scale.info.id, root: scale.root, notes: scale.notes },
      chordState.size,
      settings.current,
    );
  });
  /** The degree whose chord is chosen, if it was chosen by degree. */
  const chosen = $derived(
    chordState.mode === 'degree' && chordState.active ? chordState.degree : null,
  );

  /** Chooses the degree's chord and shows it, with its shapes, on the Chords page (ADR-54). */
  function choose(degree: number) {
    chordState.chooseDegree(degree);
    // A failed save is shown by the store's warning.
    settings.update({ page: 'chords' }).catch(() => {});
  }
</script>

{#if harmonizer}
  <section id="harmonize-panel" class="harmonize" aria-label="Harmonize {title}">
    <fieldset class="sizes">
      <legend>Harmonize as</legend>
      {#each SIZES as [size, text] (size)}
        <label>
          <input
            type="radio"
            name="harmonize-size"
            value={size}
            checked={chordState.size === size}
            onchange={() => (chordState.size = size)}
          />
          {text}
        </label>
      {/each}
    </fieldset>

    <ol class="row" aria-label="Chords of {title}">
      {#each row as cell (cell.degree)}
        <li>
          {#if cell.chord}
            <button
              type="button"
              class="cell chord"
              aria-pressed={chosen === cell.degree}
              title="{cell.chord.name} on degree {cell.degree + 1}"
              onclick={() => choose(cell.degree)}
            >
              <span class="numeral">{cell.chord.numeral}</span>
              <span class="symbol">{cell.chord.symbol}</span>
            </button>
          {:else}
            <div class="cell none" title="No chord forms on degree {cell.degree + 1}">
              <span class="numeral">{cell.note.name}</span>
              <span class="symbol">no chord</span>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .harmonize {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  /* A plain radio group, not a segmented control. */
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
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The degree chords are cells, not text buttons: two lines, the symbol in body text. */
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 1rem;
    line-height: 1.5;
  }

  .chord {
    border-color: var(--border-strong);
  }

  .chord[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .none {
    border-style: dashed;
    color: var(--text-muted);
  }

  .numeral {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .symbol {
    font-weight: 600;
  }

  .none .symbol {
    font-weight: 400;
    font-size: 0.875rem;
    font-style: italic;
  }
</style>
