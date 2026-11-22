<!--
  @component
  The chord picker (SPEC §5.3, ADR-32, ADR-33, ADR-54), shown in the drawer behind
  "☰ Choose chord" on the Chords page. Three ways to choose a chord: a root and a quality from
  the catalog, a degree of the Scales page's scale (as a triad or a 7th chord), or a typed
  symbol, read by the core's parser, with the place it could not read marked. Chord names
  follow the Standard/Jazz style setting, chosen here.

  The user's own chords are made, edited and deleted in the root and quality picker (ADR-36);
  the editor's dialog, `ChordEditorDialog`, is mounted by the app outside the pages, so reverse
  lookup on the Scales page can open it too (ADR-53). That picker's qualities show their mood
  tags and can be filtered by tag with the chips; a chosen chord the filter hides stays chosen
  (ADR-41). **Random chord**, in the same picker, chooses a root and a quality from what the
  chips let through, as if the user had picked them (SPEC §5.8, ADR-42); `random` is the number
  source, tests pass a seeded one.

  What was chosen is shown on the Chords page (`ChordSummary` and the voicing browser).
-->
<script lang="ts">
  import { rootChoices } from '../explorer/view';
  import { getSettings, type ChordSymbolStyle } from '../settings';
  import { randomPick, rootPitchClass, spellRoot, type Random } from '../random';
  import { getTagFilters, HIDDEN_BY_TAGS, TagChips, tagList, withTags } from '../tags';
  import { getChord } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { chordSymbol } from './display';
  import type { ChordSize } from './harmonize';
  import { getChordState } from './state.svelte';
  import UserChordButtons from './UserChordButtons.svelte';

  const { random = Math.random }: { random?: Random } = $props();

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const chordState = getChordState();
  const tagFilter = getTagFilters().chords;

  const SIZES: [ChordSize, string][] = [
    ['triads', 'Triads'],
    ['sevenths', '7th chords'],
  ];
  const STYLES: [ChordSymbolStyle, string][] = [
    ['standard', 'Standard'],
    ['jazz', 'Jazz'],
  ];
  /** Two chords in a style, written by the core: `Cmaj7 Cm7♭5`, `CΔ7 Cø`. */
  const styleExample = (style: ChordSymbolStyle) =>
    ['maj7', 'min7b5'].map((id) => chordSymbol('C', { id }, style)).join(' ');
  const roots = rootChoices();
  // The catalog as the tag chips let it through, re-read when the user's chords or tag rules
  // changed (ADR-24, ADR-41).
  const families = $derived(tagFilter.families);
  const activeTags = $derived(tagFilter.active);
  const pickedChord = $derived.by(() => {
    void catalogs.revision;
    return chordState.chordId ? getChord(chordState.chordId) : undefined;
  });
  /** The chosen quality stays chosen when the chips hide it; the picker says so. */
  const hiddenByTags = $derived(
    pickedChord !== undefined && activeTags.length > 0 && !tagFilter.matches(pickedChord.id),
  );
  /** What the list shows: the filtered chords, plus a chosen one the chips hide, in its family. */
  const listed = $derived(
    pickedChord && hiddenByTags ? tagFilter.keeping(families, pickedChord.id) : families,
  );
  const emptyMessage = $derived(
    activeTags.length === 1
      ? `No chord has the tag ${tagList(activeTags)}.`
      : `No chord has all of the tags ${tagList(activeTags)}.`,
  );

  const active = $derived(chordState.active);
  const degreeAvailable = $derived(chordState.harmonizer !== null);

  /** The typed symbol split around the character the core could not read, and why. */
  const symbolError = $derived.by(() => {
    const problem = chordState.symbolProblem;
    if (!problem) return null;
    // The core counts characters (code points), not UTF-16 units.
    const chars = Array.from(chordState.symbol);
    const message = problem.message;
    return {
      before: chars.slice(0, problem.position).join(''),
      at: chars[problem.position] ?? '',
      after: chars.slice(problem.position + 1).join(''),
      column: problem.position + 1,
      message: `${message.charAt(0).toUpperCase()}${message.slice(1)}.`,
    };
  });

  function setStyle(style: ChordSymbolStyle) {
    // The value is always a valid setting; a failed save is shown by the store's warning.
    settings.update({ chordSymbols: style }).catch(() => {});
  }

  /** What Random chord draws from: the qualities the chips let through, never a kept one. */
  const randomSet = $derived(tagFilter.items);

  /**
   * A random root, spelled by the sharp/flat preference, and quality from `randomSet`, chosen as
   * root and quality; never the chord shown now while there is another pair.
   */
  function pickRandom() {
    const current = active
      ? { id: active.chord.id, pitchClass: rootPitchClass(active.root) }
      : null;
    const picked = randomPick(randomSet, current, random);
    if (!picked) return;
    chordState.chooseChord(
      spellRoot(picked.pitchClass, settings.current.accidentals),
      picked.item.id,
    );
  }

  function setDegree(event: Event & { currentTarget: HTMLSelectElement }) {
    const value = event.currentTarget.value;
    chordState.degree = value === '' ? null : Number(value);
  }
</script>

<div class="chord-picker">
  <fieldset class="modes">
    <legend>Choose a chord by</legend>
    <label>
      <input
        type="radio"
        name="chord-mode"
        value="root"
        checked={chordState.mode === 'root'}
        onchange={() => (chordState.mode = 'root')}
      />
      Root and quality
    </label>
    <label>
      <input
        type="radio"
        name="chord-mode"
        value="degree"
        checked={chordState.mode === 'degree'}
        disabled={!degreeAvailable}
        onchange={() => (chordState.mode = 'degree')}
      />
      Degree of the scale
    </label>
    <label>
      <input
        type="radio"
        name="chord-mode"
        value="symbol"
        checked={chordState.mode === 'symbol'}
        onchange={() => (chordState.mode = 'symbol')}
      />
      Typed symbol
    </label>
  </fieldset>
  {#if !degreeAvailable}
    <p class="muted">Choosing by degree is not available yet.</p>
  {/if}

  {#if chordState.mode === 'root'}
    <div class="field">
      <label for="chord-root">Chord root</label>
      <select
        id="chord-root"
        value={chordState.root}
        onchange={(e) => (chordState.root = e.currentTarget.value)}
      >
        {#each roots as root (root)}
          <option value={root}>{root}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <span class="label">Filter by tag</span>
      <TagChips filter={tagFilter} label="Filter chords by tag" />
    </div>
    <div class="field">
      <label for="chord-quality">Chord quality</label>
      <select
        id="chord-quality"
        value={chordState.chordId}
        aria-describedby={hiddenByTags ? 'chord-hidden' : undefined}
        onchange={(e) => (chordState.chordId = e.currentTarget.value)}
      >
        <option value="">Choose a chord…</option>
        {#each listed as family (family.name)}
          <optgroup label={family.name}>
            {#each family.items as { item: chord, tags } (chord.id)}
              {@const kept = hiddenByTags && chord.id === pickedChord?.id}
              <option value={chord.id} data-name={chord.name} data-hidden={kept ? '' : undefined}
                >{withTags(chord.name, tags)}{kept ? ` ${HIDDEN_BY_TAGS}` : ''}</option
              >
            {/each}
          </optgroup>
        {/each}
      </select>
      {#if families.length === 0}
        <p id="chord-empty" class="muted" role="status">{emptyMessage}</p>
      {/if}
      {#if hiddenByTags && pickedChord}
        <p id="chord-hidden" class="muted">
          {pickedChord.name} stays chosen, but it doesn’t have every tag you picked.
        </p>
      {/if}
    </div>
    <div>
      <button
        type="button"
        disabled={randomSet.length === 0}
        aria-describedby={randomSet.length === 0 ? 'chord-empty' : undefined}
        onclick={pickRandom}>Random chord</button
      >
    </div>
    <UserChordButtons />
  {:else if chordState.mode === 'symbol'}
    <div class="field">
      <label for="chord-symbol">Chord symbol</label>
      <input
        id="chord-symbol"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="F#m7b5"
        value={chordState.symbol}
        aria-invalid={symbolError ? 'true' : undefined}
        aria-describedby="chord-symbol-help"
        oninput={(e) => (chordState.symbol = e.currentTarget.value)}
      />
      {#if symbolError}
        <p id="chord-symbol-help" class="error">
          <code class="typed" aria-hidden="true"
            >{symbolError.before}<mark class:end={symbolError.at === ''}
              >{symbolError.at || ' '}</mark
            >{symbolError.after}</code
          >
          <span>{symbolError.message} (character {symbolError.column})</span>
        </p>
      {:else}
        <p id="chord-symbol-help" class="muted">
          Any common spelling: Cmaj7, CΔ7, F#m7b5, Bbø, G7/B.
        </p>
      {/if}
    </div>
  {:else}
    <div class="field">
      <label for="chord-degree"
        >Degree of {chordState.scale.root} {chordState.scale.info.name}</label
      >
      <select
        id="chord-degree"
        value={chordState.degree === null ? '' : String(chordState.degree)}
        aria-describedby={chordState.problem ? 'chord-degree-problem' : undefined}
        onchange={setDegree}
      >
        <option value="">Choose a degree…</option>
        {#each chordState.scale.notes as note, index (index)}
          <option value={String(index)}>{note.interval} · {note.name}</option>
        {/each}
      </select>
      {#if chordState.problem}
        <p id="chord-degree-problem" class="muted">{chordState.problem}</p>
      {/if}
    </div>
    <fieldset class="sizes">
      <legend>Chord size</legend>
      {#each SIZES as [size, text] (size)}
        <label>
          <input
            type="radio"
            name="chord-size"
            value={size}
            checked={chordState.size === size}
            onchange={() => (chordState.size = size)}
          />
          {text}
        </label>
      {/each}
    </fieldset>
  {/if}

  <fieldset class="styles">
    <legend>Chord names</legend>
    {#each STYLES as [style, text] (style)}
      <label>
        <input
          type="radio"
          name="chord-symbols"
          value={style}
          checked={settings.current.chordSymbols === style}
          onchange={() => setStyle(style)}
        />
        {text}
        <span class="example">{styleExample(style)}</span>
      </label>
    {/each}
  </fieldset>
</div>

<style>
  .chord-picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
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

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field label,
  .field .label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .example {
    color: var(--text-muted);
  }

  input[type='text'] {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.5rem;
    max-width: 100%;
  }

  input[aria-invalid='true'] {
    border-color: var(--text-danger);
  }

  .error {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0;
    color: var(--text-danger);
    font-size: 0.875rem;
  }

  .typed {
    color: var(--text);
    font-family: monospace;
    white-space: pre;
  }

  mark {
    color: inherit;
    font-weight: 700;
    background: transparent;
    text-decoration: underline wavy var(--text-danger);
    text-underline-offset: 0.2em;
  }

  mark.end {
    border-bottom: 2px solid var(--text-danger);
    text-decoration: none;
  }

  select {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.5rem;
    max-width: 100%;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
