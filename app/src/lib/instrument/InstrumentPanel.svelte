<!--
  @component
  The instrument settings (SPEC §5.1, ADR-24): string count, tuning, the user's own tunings
  (new, edit, delete), fret count, capo, left-handed and theme. Every change is a setting and
  is saved at once (ADR-17); the neck follows it. Custom tunings are saved to `tunings.toml`
  through `UserCatalogs`, which tells the rest of the app that the catalog changed.
-->
<script lang="ts">
  import {
    getSettings,
    MAX_FRETS,
    MAX_STRINGS,
    MIN_FRETS,
    MIN_STRINGS,
    type Theme,
  } from '../settings';
  import { formatNote, getTuning, newTuningId, type Tuning } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { standardTuning, tuningsWithStrings, type TuningDraft } from './presets';
  import TuningEditor from './TuningEditor.svelte';

  const settings = getSettings();
  const catalogs = getUserCatalogs();

  const instrument = $derived(settings.current.instrument);
  const current = $derived.by(() => {
    void catalogs.revision;
    return getTuning(instrument.tuning);
  });
  /** The string count shown: the tuning's own, so the two never disagree. */
  const strings = $derived(current?.notes.length ?? instrument.strings);
  const mine = $derived(new Set(catalogs.userTunings.map((t) => t.id)));
  const groups = $derived.by(() => {
    void catalogs.revision;
    const offered = tuningsWithStrings(strings);
    const builtIn = offered.filter((t) => !mine.has(t.id));
    return [
      { label: 'Guitar', tunings: builtIn.filter((t) => t.kind === 'guitar'), own: false },
      { label: 'Bass', tunings: builtIn.filter((t) => t.kind === 'bass'), own: false },
      { label: 'Your tunings', tunings: offered.filter((t) => mine.has(t.id)), own: true },
    ].filter((group) => group.tunings.length > 0);
  });
  const isMine = $derived(current !== undefined && mine.has(current.id));
  const openStrings = $derived(
    current?.notes.map((midi) => formatNote(midi, settings.current.accidentals)).join(' ') ?? '',
  );

  const stringCounts = Array.from(
    { length: MAX_STRINGS - MIN_STRINGS + 1 },
    (_, i) => MIN_STRINGS + i,
  );
  const themes: { value: Theme; text: string }[] = [
    { value: 'system', text: 'System' },
    { value: 'light', text: 'Light' },
    { value: 'dark', text: 'Dark' },
  ];

  type Editing = { mode: 'new'; initial: TuningDraft } | { mode: 'edit'; tuning: Tuning };
  let editing = $state<Editing | null>(null);
  let confirmingDelete = $state(false);
  let problem = $state<string | null>(null);
  let fretsProblem = $state<string | null>(null);
  let capoProblem = $state<string | null>(null);

  function report(error: unknown) {
    problem = error instanceof Error ? error.message : String(error);
  }

  /** Selects `tuning`, keeping the string count and kind in step with it. */
  function pick(tuning: Tuning): Promise<void> {
    problem = null;
    return settings.update({
      instrument: { tuning: tuning.id, strings: tuning.notes.length, kind: tuning.kind },
    });
  }

  function setStrings(event: Event & { currentTarget: HTMLSelectElement }) {
    const tuning = standardTuning(Number(event.currentTarget.value), instrument.kind);
    if (tuning) pick(tuning).catch(report);
    confirmingDelete = false;
  }

  function setTuning(event: Event & { currentTarget: HTMLSelectElement }) {
    const tuning = getTuning(event.currentTarget.value);
    if (tuning) pick(tuning).catch(report);
    confirmingDelete = false;
  }

  function startNew() {
    const base = current ?? standardTuning(strings, instrument.kind);
    editing = {
      mode: 'new',
      initial: { name: '', kind: base?.kind ?? instrument.kind, notes: base?.notes ?? [] },
    };
    confirmingDelete = false;
  }

  function startEdit() {
    if (current) editing = { mode: 'edit', tuning: current };
    confirmingDelete = false;
  }

  async function saveNew(draft: TuningDraft) {
    const tuning: Tuning = {
      id: newTuningId(draft.kind, draft.notes.length, draft.name),
      ...draft,
    };
    await catalogs.saveUserTunings([...catalogs.userTunings, tuning]);
    editing = null;
    await pick(tuning).catch(report);
  }

  /** Saves a changed tuning under its id; the settings keep pointing at it. */
  async function saveEdit(id: string, draft: TuningDraft) {
    const tuning: Tuning = { id, ...draft };
    await catalogs.saveUserTunings(catalogs.userTunings.map((t) => (t.id === id ? tuning : t)));
    editing = null;
    if (instrument.tuning === id) await pick(tuning).catch(report);
  }

  /** Deletes the selected tuning; the neck falls back to the string count's standard. */
  async function deleteCurrent() {
    const gone = current;
    if (!gone) return;
    try {
      await catalogs.saveUserTunings(catalogs.userTunings.filter((t) => t.id !== gone.id));
    } catch (error) {
      report(error);
      return;
    }
    confirmingDelete = false;
    if (editing?.mode === 'edit' && editing.tuning.id === gone.id) editing = null;
    // A deleted override of a built-in id brings the built-in back; otherwise fall back.
    const next = getTuning(gone.id) ?? standardTuning(gone.notes.length, gone.kind);
    if (next) await pick(next).catch(report);
  }

  function setFrets(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const frets = input.valueAsNumber;
    // A shorter neck takes the capo along; the settings check the rest.
    settings.update({ instrument: { frets, capo: Math.min(instrument.capo, frets - 1) } }).then(
      () => (fretsProblem = null),
      () => {
        fretsProblem = `The fret count is a whole number from ${MIN_FRETS} to ${MAX_FRETS}.`;
        input.value = String(instrument.frets);
      },
    );
  }

  function setCapo(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    settings.update({ instrument: { capo: input.valueAsNumber } }).then(
      () => (capoProblem = null),
      () => {
        capoProblem = `The capo goes on fret 0 (none) to ${instrument.frets - 1}.`;
        input.value = String(instrument.capo);
      },
    );
  }

  function ignore() {
    // Always a valid setting; a failed save is shown by the store's warning.
  }
</script>

<div class="panel">
  <div class="field">
    <label for="instrument-strings">Strings</label>
    <select id="instrument-strings" value={strings} onchange={setStrings}>
      {#each stringCounts as count (count)}
        <option value={count}>{count}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="instrument-tuning">Tuning</label>
    <select
      id="instrument-tuning"
      value={instrument.tuning}
      onchange={setTuning}
      aria-describedby="instrument-open-strings"
    >
      {#if !current}
        <option value={instrument.tuning} disabled>Missing: {instrument.tuning}</option>
      {/if}
      {#each groups as group (group.label)}
        <optgroup label={group.label}>
          {#each group.tunings as tuning (tuning.id)}
            <option value={tuning.id}>
              {group.own ? `${tuning.name} (${tuning.kind})` : tuning.name}
            </option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <p id="instrument-open-strings" class="hint">
      {#if current}
        <span class="kind">{current.kind === 'guitar' ? 'Guitar' : 'Bass'}</span>, low to high:
        {openStrings}
      {/if}
    </p>
  </div>

  <div class="actions">
    <button type="button" onclick={startNew}>New tuning</button>
    {#if isMine}
      <button type="button" onclick={startEdit}>Edit</button>
      <button type="button" onclick={() => (confirmingDelete = true)}>Delete</button>
    {/if}
  </div>

  {#if confirmingDelete && current}
    <div class="confirm" role="group" aria-label="Delete {current.name}">
      <p>Delete “{current.name}”? This can't be undone.</p>
      <div class="actions">
        <button type="button" class="danger" onclick={deleteCurrent}>Delete tuning</button>
        <button type="button" onclick={() => (confirmingDelete = false)}>Keep it</button>
      </div>
    </div>
  {/if}

  {#if problem}
    <p class="error" role="alert">{problem}</p>
  {/if}

  {#if editing?.mode === 'new'}
    {#key editing}
      <TuningEditor
        title="New tuning"
        initial={editing.initial}
        accidentals={settings.current.accidentals}
        onsave={saveNew}
        oncancel={() => (editing = null)}
      />
    {/key}
  {:else if editing?.mode === 'edit'}
    {@const tuning = editing.tuning}
    {#key tuning}
      <TuningEditor
        title="Edit tuning"
        initial={{ name: tuning.name, kind: tuning.kind, notes: tuning.notes }}
        accidentals={settings.current.accidentals}
        onsave={(draft) => saveEdit(tuning.id, draft)}
        oncancel={() => (editing = null)}
      />
    {/key}
  {/if}

  <div class="row">
    <div class="field">
      <label for="instrument-frets">Frets</label>
      <input
        id="instrument-frets"
        type="number"
        min={MIN_FRETS}
        max={MAX_FRETS}
        step="1"
        value={instrument.frets}
        aria-invalid={fretsProblem ? 'true' : undefined}
        onchange={setFrets}
      />
    </div>
    <div class="field">
      <label for="instrument-capo">Capo fret</label>
      <input
        id="instrument-capo"
        type="number"
        min="0"
        max={instrument.frets - 1}
        step="1"
        value={instrument.capo}
        aria-invalid={capoProblem ? 'true' : undefined}
        aria-describedby="instrument-capo-hint"
        onchange={setCapo}
      />
    </div>
  </div>
  {#if fretsProblem}
    <p class="error" role="alert">{fretsProblem}</p>
  {/if}
  {#if capoProblem}
    <p class="error" role="alert">{capoProblem}</p>
  {/if}
  <p id="instrument-capo-hint" class="hint">Capo 0 is no capo.</p>

  <label class="check">
    <input
      type="checkbox"
      checked={settings.current.leftHanded}
      onchange={(event) =>
        settings.update({ leftHanded: event.currentTarget.checked }).catch(ignore)}
    />
    Left-handed (mirror the neck)
  </label>

  <fieldset>
    <legend>Theme</legend>
    <div class="themes">
      {#each themes as theme (theme.value)}
        <label>
          <input
            type="radio"
            name="instrument-theme"
            value={theme.value}
            checked={settings.current.theme === theme.value}
            onchange={() => settings.update({ theme: theme.value }).catch(ignore)}
          />
          {theme.text}
        </label>
      {/each}
    </div>
  </fieldset>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .field > label,
  legend {
    font-weight: 600;
    font-size: 0.875rem;
  }

  input[type='number'],
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
    min-width: 0;
  }

  [aria-invalid='true'] {
    border-color: var(--text-danger);
  }

  input:focus-visible,
  select:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  optgroup {
    color: var(--text-muted);
    font-style: normal;
  }

  option {
    color: var(--text);
  }

  .hint,
  .error,
  .confirm p {
    margin: 0;
    font-size: 0.8125rem;
  }

  .hint {
    color: var(--text-muted);
  }

  .kind {
    font-weight: 600;
  }

  .error {
    color: var(--text-danger);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--text-danger);
    border-radius: 0.375rem;
  }

  button {
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.625rem;
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
  }

  button.danger {
    border-color: var(--text-danger);
    color: var(--text-danger);
  }

  .check,
  .themes label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
  }

  .themes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }
</style>
