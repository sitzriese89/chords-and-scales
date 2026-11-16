<!--
  @component
  Harmonize for the explorer's scale (SPEC §5.5, ADR-34). The Harmonize button opens a row with
  the chord on every degree, as triads or 7th chords, each with its Roman numeral; degrees where
  no chord forms are marked "no chord". Clicking a chord chooses it in the chord panel by its
  degree, so the neck shows it over the dimmed scale (ADR-32), and expands the panel if it is
  collapsed. The size is the chord panel's: the toggle here and the one there are the same.
  Chord names follow the Standard/Jazz setting (ADR-33).

  Shown only when the app has a harmonizer (the chord panel's degree input is on).
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

  let open = $state(false);
  const scale = $derived(chordState.scale);
  const title = $derived(`${scale.root} ${scale.info.name}`);
  const row = $derived.by(() => {
    // Re-read the catalogs when a user scale or chord was saved or deleted (ADR-24).
    void catalogs.revision;
    if (!open || !harmonizer) return [];
    return harmonizeRow(
      harmonizer,
      { id: scale.info.id, root: scale.root, notes: scale.notes },
      chordState.size,
      settings.current,
    );
  });
  /** The degree whose chord is on the neck, if it was chosen by degree. */
  const chosen = $derived(
    chordState.mode === 'degree' && chordState.active ? chordState.degree : null,
  );

  function choose(degree: number) {
    chordState.chooseDegree(degree);
    if (settings.current.chordPanel.collapsed) {
      // A failed save is shown by the store's warning.
      settings.update({ chordPanel: { collapsed: false } }).catch(() => {});
    }
  }
</script>

{#if harmonizer}
  <section class="harmonize" aria-label="Harmonize {title}">
    <div class="controls">
      <button
        type="button"
        class="open"
        aria-expanded={open}
        aria-controls="harmonize-row"
        onclick={() => (open = !open)}
      >
        Harmonize
      </button>
      {#if open}
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
      {/if}
    </div>

    {#if open}
      <ol id="harmonize-row" class="row" aria-label="Chords of {title}">
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
    {/if}
  </section>
{/if}

<style>
  .harmonize {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }

  button {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
  }

  .open {
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
  }

  .open[aria-expanded='true'] {
    border-color: var(--accent);
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
    color: var(--text-muted);
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

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3.5rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
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
