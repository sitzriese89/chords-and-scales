<!--
  @component
  The form for a user item made of intervals above a root: a custom scale now, a custom chord
  later (M2.9). The intervals are picked on a 12-semitone picker or by clicking notes on its own
  neck (the current instrument, on the current root); a click toggles the note's interval, as
  the core reports it. The root is always in. Plus a name and a family.

  The form checks nothing itself: `onsave` gets what was entered, and a rejection's message
  (the core's: no notes, a duplicate name, …) is shown in the form (ADR-26).
-->
<script lang="ts">
  import { Fretboard, type FretPosition } from '../fretboard';
  import { pitchClassOf } from '../theory';
  import {
    SEMITONES,
    chosenDots,
    chosenFrom,
    defaultLabels,
    degreeAt,
    intervalsOf,
    neckNotes,
    toggle,
    type IntervalSetDraft,
    type Neck,
  } from './intervals';

  interface Props {
    /** The form's heading: "New scale", "Edit scale". */
    title: string;
    /** What is edited, for labels and hints: "scale", "chord". */
    noun: string;
    /** What the form starts with. */
    initial: IntervalSetDraft;
    /** Families to suggest; the field takes any name. */
    families: readonly string[];
    /** What a blank family means, shown as the field's placeholder: "Custom". */
    defaultFamily: string;
    /** The root the neck is shown on, as displayed: `D♭`. */
    root: string;
    /** The neck to click notes on. */
    neck: Neck;
    /** Saves the item; a rejection's message is shown in the form. */
    onsave: (draft: IntervalSetDraft) => Promise<void>;
    oncancel: () => void;
  }

  const { title, noun, initial, families, defaultFamily, root, neck, onsave, oncancel }: Props =
    $props();

  // The form edits its own copy; `initial` only seeds it.
  // svelte-ignore state_referenced_locally
  let name = $state(initial.name);
  // svelte-ignore state_referenced_locally
  let family = $state(initial.family);
  // svelte-ignore state_referenced_locally
  let chosen = $state(chosenFrom(initial.intervals));
  let error = $state<string | null>(null);
  let saving = $state(false);

  const id = $props.id();
  const labels = defaultLabels();
  const notes = $derived(neckNotes(neck, pitchClassOf(root)));
  const dots = $derived(chosenDots(notes, chosen));
  const count = $derived(intervalsOf(chosen).length);

  function pick(semitones: number) {
    chosen = toggle(chosen, semitones, labels);
  }

  function activate(position: FretPosition) {
    const degree = degreeAt(notes, position);
    if (degree !== undefined) pick(degree);
  }

  let nameInput: HTMLInputElement | undefined = $state();
  $effect(() => nameInput?.focus());

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    saving = true;
    try {
      await onsave({ name: name.trim(), family: family.trim(), intervals: intervalsOf(chosen) });
    } catch (rejection) {
      error = rejection instanceof Error ? rejection.message : String(rejection);
    } finally {
      saving = false;
    }
  }
</script>

<form class="editor" aria-labelledby="{id}-title" novalidate onsubmit={submit}>
  <h2 id="{id}-title">{title}</h2>

  <div class="fields">
    <div class="field">
      <label for="{id}-name">Name</label>
      <input
        id="{id}-name"
        type="text"
        autocomplete="off"
        maxlength="64"
        bind:this={nameInput}
        bind:value={name}
      />
    </div>
    <div class="field">
      <label for="{id}-family">Family</label>
      <input
        id="{id}-family"
        type="text"
        autocomplete="off"
        maxlength="64"
        list="{id}-families"
        placeholder={defaultFamily}
        bind:value={family}
      />
      <datalist id="{id}-families">
        {#each families as choice (choice)}
          <option value={choice}></option>
        {/each}
      </datalist>
    </div>
  </div>

  <fieldset>
    <legend>Intervals from the root ({count} {count === 1 ? 'note' : 'notes'})</legend>
    <div class="semitones" role="group" aria-label="Intervals">
      {#each SEMITONES as n (n)}
        <button
          type="button"
          class="semitone"
          aria-pressed={chosen[n] !== null}
          disabled={n === 0}
          title={n === 0 ? 'The root is always in' : undefined}
          onclick={() => pick(n)}
        >
          {chosen[n] ?? labels[n]}
        </button>
      {/each}
    </div>
  </fieldset>

  <div class="neck">
    <p class="hint">
      Or click notes on the neck to add or remove them; {root} is the root here.
    </p>
    <Fretboard
      strings={neck.tuning.notes.length}
      frets={neck.frets}
      capo={neck.capo}
      leftHanded={neck.leftHanded}
      {dots}
      ariaLabel="Neck for the {noun}: click a note to add or remove it"
      onactivate={activate}
    />
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
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
    gap: 0.75rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex: 1 1 12rem;
    flex-direction: column;
    gap: 0.25rem;
  }

  label,
  legend {
    font-weight: 600;
    font-size: 0.875rem;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 0.375rem;
    padding: 0;
  }

  input {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
    min-width: 0;
  }

  .semitones {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    gap: 0.375rem;
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

  .semitone {
    padding: 0.375rem 0;
    font-variant-numeric: tabular-nums;
  }

  .semitone[aria-pressed='true'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
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
  }

  button.primary:disabled {
    opacity: 0.6;
  }

  input:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .neck {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .hint,
  .error {
    margin: 0;
    font-size: 0.8125rem;
  }

  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--text-danger);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
