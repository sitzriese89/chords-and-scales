<!--
  @component
  The form for a custom tuning: a name, guitar or bass, and a note and octave for every open
  string, listed as on the neck (string 1, the highest, first). It checks only what a form
  can: a name and a note and octave on every string. Everything else (the range C0 to C6, the
  id) is checked by the core when `onsave` saves, and its message is shown here.
-->
<script lang="ts">
  import type { Accidentals, InstrumentKind } from '../settings';
  import { noteFromParts, noteParts, spellPitchClass } from '../theory';
  import type { TuningDraft } from './presets';

  interface Props {
    /** The form's heading: "New tuning", "Edit tuning". */
    title: string;
    /** What the form starts with; its string count is fixed. */
    initial: TuningDraft;
    /** How the note choices are spelled. */
    accidentals: Accidentals;
    /** Saves the tuning; a rejection's message is shown in the form. */
    onsave: (draft: TuningDraft) => Promise<void>;
    oncancel: () => void;
  }

  const { title, initial, accidentals, onsave, oncancel }: Props = $props();

  interface Row {
    pitchClass: number | null;
    octave: number | null;
  }

  // The form edits its own copy; `initial` only seeds it.
  // svelte-ignore state_referenced_locally
  let name = $state(initial.name);
  // svelte-ignore state_referenced_locally
  let kind = $state<InstrumentKind>(initial.kind);
  /** Lowest string first, like `notes`. */
  // svelte-ignore state_referenced_locally
  const rows = $state<Row[]>(initial.notes.map((midi) => ({ ...noteParts(midi) })));
  let errors = $state<string[]>([]);
  let saving = $state(false);

  const id = $props.id();
  const count = $derived(rows.length);
  /** Rows as on the neck: string 1 (the highest) first. */
  const shown = $derived(rows.map((row, i) => ({ row, string: count - i })).reverse());
  const noteChoices = $derived(
    Array.from({ length: 12 }, (_, pc) => ({ pc, name: spellPitchClass(pc, accidentals) })),
  );
  const kinds: { value: InstrumentKind; text: string }[] = [
    { value: 'guitar', text: 'Guitar' },
    { value: 'bass', text: 'Bass' },
  ];

  const incomplete = (row: Row) =>
    row.pitchClass === null || row.octave === null || !Number.isInteger(row.octave);

  /** The form's own checks, string 1 first; `[]` when the core can have it. */
  function formProblems(): string[] {
    const problems: string[] = [];
    if (name.trim() === '') problems.push('Give the tuning a name.');
    for (const { row, string } of shown) {
      if (incomplete(row)) problems.push(`String ${string} needs a note and an octave.`);
    }
    return problems;
  }

  let tried = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    tried = true;
    errors = formProblems();
    if (errors.length > 0) return;
    saving = true;
    try {
      const notes = rows.map((row) => noteFromParts(row.pitchClass!, row.octave!));
      await onsave({ name: name.trim(), kind, notes });
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
    } finally {
      saving = false;
    }
  }
</script>

<form class="editor" aria-labelledby="{id}-title" novalidate onsubmit={submit}>
  <h3 id="{id}-title">{title}</h3>

  <div class="field">
    <label for="{id}-name">Name</label>
    <input
      id="{id}-name"
      type="text"
      autocomplete="off"
      maxlength="64"
      bind:value={name}
      aria-invalid={tried && name.trim() === '' ? 'true' : undefined}
    />
  </div>

  <fieldset class="kinds">
    <legend>Instrument</legend>
    {#each kinds as choice (choice.value)}
      <label>
        <input type="radio" name="{id}-kind" value={choice.value} bind:group={kind} />
        {choice.text}
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Open strings ({count})</legend>
    <div class="strings">
      {#each shown as { row, string } (string)}
        <span class="string" id="{id}-string-{string}">String {string}</span>
        <select
          aria-label="String {string} note"
          bind:value={row.pitchClass}
          aria-invalid={tried && row.pitchClass === null ? 'true' : undefined}
        >
          <option value={null}>–</option>
          {#each noteChoices as choice (choice.pc)}
            <option value={choice.pc}>{choice.name}</option>
          {/each}
        </select>
        <input
          type="number"
          aria-label="String {string} octave"
          min="0"
          max="6"
          step="1"
          bind:value={row.octave}
          aria-invalid={tried && (row.octave === null || !Number.isInteger(row.octave))
            ? 'true'
            : undefined}
        />
      {/each}
    </div>
    <p class="hint">Octaves as in C4 = middle C; strings go from C0 to C6.</p>
  </fieldset>

  {#if errors.length > 0}
    <div class="errors" role="alert">
      <ul>
        {#each errors as error (error)}
          <li>{error}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="actions">
    <button type="submit" class="primary" disabled={saving}>Save</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.625rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    background: var(--surface);
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label,
  legend,
  .string {
    font-size: 0.875rem;
  }

  .field > label,
  legend {
    font-weight: 600;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.25rem;
    padding: 0;
  }

  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }

  .kinds legend {
    width: 100%;
  }

  .strings {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 4rem;
    gap: 0.25rem 0.375rem;
    align-items: center;
  }

  input[type='text'],
  input[type='number'],
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.375rem;
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

  .hint {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .errors {
    color: var(--text-danger);
    font-size: 0.8125rem;
  }

  .errors ul {
    margin: 0;
    padding-left: 1.125rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
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

  button.primary {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  button.primary:hover {
    background: var(--accent-hover);
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>
