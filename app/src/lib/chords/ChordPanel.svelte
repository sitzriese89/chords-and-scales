<!--
  @component
  The docked chord panel (SPEC §5.3, ADR-10, ADR-32, ADR-33). Three ways to choose a chord: a
  root and a quality from the catalog, a degree of the scale in the explorer (as a triad or a
  7th chord), or a typed symbol, read by the core's parser, with the place it could not read
  marked. Chord names follow the Standard/Jazz style setting, chosen here. The chosen chord is
  drawn on the explorer's neck: alone for root and quality or a symbol, over the dimmed scale
  for a degree. The panel lists the chord's notes and strums it (lowest
  string first, ADR-28): the shape chosen in the voicing browser if there is one, else the
  chord stacked up from its lowest root (ADR-32, ADR-37). The user's own chords are made, edited
  and deleted in the root and quality picker (ADR-36); the editor's dialog,
  `ChordEditorDialog`, is mounted by the app outside the pages, so reverse lookup on the Scales
  page can open it too (ADR-53). That picker's qualities show their mood
  tags and can be filtered by tag with the chips; a chosen chord the filter hides stays chosen
  (ADR-41). **Random chord**, in the same picker, chooses a root and a quality from what the
  chips let through, as if the user had picked them (SPEC §5.8, ADR-42); `random` is the number
  source, tests pass a seeded one. "Add chord to sheet" puts the chord, as the neck shows it
  without a chosen shape, on the export sheet (ADR-43).

  `children` is placed at the end of the panel's body: the app puts the voicing browser there
  (ADR-37), so this module does not depend on it.

  The panel can be collapsed to its title bar and resized by its top edge (drag, or the arrow
  keys when the edge has focus); both are saved in the settings.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getAudio } from '../audio';
  import { rootChoices } from '../explorer/view';
  import {
    getSettings,
    MAX_PANEL_HEIGHT,
    MIN_PANEL_HEIGHT,
    type ChordSymbolStyle,
  } from '../settings';
  import { randomPick, rootPitchClass, spellRoot, type Random } from '../random';
  import AddToSheet from '../sheet/AddToSheet.svelte';
  import { chordItem } from '../sheet/capture';
  import { getTagFilters, HIDDEN_BY_TAGS, TagChips, tagList, withTags } from '../tags';
  import { getChord } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { chordSymbol } from './display';
  import type { ChordSize } from './harmonize';
  import { getChordState } from './state.svelte';
  import UserChordButtons from './UserChordButtons.svelte';
  import { chordPanelView } from './view';

  const { children, random = Math.random }: { children?: Snippet; random?: Random } = $props();

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const audio = getAudio();
  const chordState = getChordState();
  const tagFilter = getTagFilters().chords;

  const collapsed = $derived(settings.current.chordPanel.collapsed);
  /** The height while the edge is being dragged; the saved height otherwise. */
  let dragHeight = $state<number | null>(null);
  const height = $derived(dragHeight ?? settings.current.chordPanel.height);

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
  const activeChordTags = $derived(active ? tagFilter.tagsOf(active.chord.id) : []);
  const view = $derived(
    active ? chordPanelView(settings.current, active, chordState.voicing) : null,
  );
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

  function ignore() {
    // The values are always valid settings; a failed save is shown by the store's warning.
  }

  const clamp = (value: number) =>
    Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(value)));

  function toggle() {
    settings.update({ chordPanel: { collapsed: !collapsed } }).catch(ignore);
  }

  function saveHeight(value: number) {
    settings.update({ chordPanel: { height: clamp(value) } }).catch(ignore);
  }

  let dragStart: { y: number; height: number } | null = null;

  function startDrag(event: PointerEvent) {
    dragStart = { y: event.clientY, height };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function drag(event: PointerEvent) {
    // The edge is above the panel: dragging up makes it taller.
    if (dragStart) dragHeight = clamp(dragStart.height + dragStart.y - event.clientY);
  }

  function endDrag() {
    if (!dragStart) return;
    dragStart = null;
    if (dragHeight !== null) saveHeight(dragHeight);
    dragHeight = null;
  }

  const KEY_STEP = 24;

  function resizeKey(event: KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowUp: height + KEY_STEP,
      ArrowDown: height - KEY_STEP,
      Home: MIN_PANEL_HEIGHT,
      End: MAX_PANEL_HEIGHT,
    };
    if (!(event.key in steps)) return;
    event.preventDefault();
    saveHeight(steps[event.key]);
  }

  function setStyle(style: ChordSymbolStyle) {
    settings.update({ chordSymbols: style }).catch(ignore);
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

  /** The chord as the neck shows it, for the export sheet: alone, or over the scale. */
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

  function setDegree(event: Event & { currentTarget: HTMLSelectElement }) {
    const value = event.currentTarget.value;
    chordState.degree = value === '' ? null : Number(value);
  }
</script>

<div class="chord-panel">
  {#if !collapsed}
    <!-- A focusable separator is the ARIA window splitter pattern. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="edge"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chord panel"
      aria-valuenow={height}
      aria-valuemin={MIN_PANEL_HEIGHT}
      aria-valuemax={MAX_PANEL_HEIGHT}
      tabindex="0"
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
      onkeydown={resizeKey}
    ></div>
  {/if}

  <header>
    <h2>Chords</h2>
    {#if collapsed && view}
      <span class="current">{view.symbol}</span>
    {/if}
    <button
      type="button"
      class="toggle"
      aria-expanded={!collapsed}
      aria-controls="chord-panel-body"
      onclick={toggle}
    >
      {collapsed ? 'Expand' : 'Collapse'}
    </button>
  </header>

  <div id="chord-panel-body" class="body" hidden={collapsed} style:height="{height}px">
    <div class="inputs">
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
                  <option
                    value={chord.id}
                    data-name={chord.name}
                    data-hidden={kept ? '' : undefined}
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
                  >{symbolError.at || '\u00a0'}</mark
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
            onchange={setDegree}
          >
            <option value="">Choose a degree…</option>
            {#each chordState.scale.notes as note, index (index)}
              <option value={String(index)}>{note.interval} · {note.name}</option>
            {/each}
          </select>
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

    <div class="result" aria-live="polite">
      {#if active && view}
        <div class="heading">
          <h3>{view.symbol}</h3>
          <span class="name">
            {view.name}{active.bass ? `, bass ${active.bass}` : ''}{active.numeral
              ? ` (${active.numeral})`
              : ''}{active.fromScale
              ? ` on degree ${(chordState.degree ?? 0) + 1} of ${chordState.scale.root} ${chordState.scale.info.name}`
              : ''}
          </span>
        </div>
        <p class="muted chord-tags">
          Tags: {activeChordTags.length > 0 ? activeChordTags.join(', ') : 'none'}
        </p>
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
          <button type="button" class="clear" onclick={() => chordState.clear()}>Clear chord</button
          >
          <AddToSheet what="chord" make={addChord} />
          {#if settings.current.audio.muted}
            <span class="muted">Sound is muted.</span>
          {/if}
        </div>
      {:else if chordState.problem}
        <p class="muted">{chordState.problem}</p>
      {:else if chordState.mode === 'symbol'}
        <p class="muted">Type a chord symbol to see it on the neck.</p>
      {:else}
        <p class="muted">Choose a chord to see it on the neck.</p>
      {/if}
    </div>

    {@render children?.()}
  </div>
</div>

<style>
  .chord-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .edge {
    height: 0.5rem;
    margin: -0.25rem 0 0;
    border-radius: 0.25rem;
    cursor: ns-resize;
    touch-action: none;
    background: linear-gradient(
      to bottom,
      transparent 0.1875rem,
      var(--border-strong) 0.1875rem,
      var(--border-strong) 0.3125rem,
      transparent 0.3125rem
    );
  }

  .edge:hover,
  .edge:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .current {
    font-weight: 600;
  }

  .toggle {
    margin-left: auto;
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

  .body {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 1rem 2rem;
    overflow: auto;
  }

  .body[hidden] {
    display: none;
  }

  .inputs,
  .result {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .inputs {
    flex: 0 1 18rem;
  }

  .result {
    flex: 1 1 18rem;
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

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
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

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
