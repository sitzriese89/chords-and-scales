<!--
  @component
  The form for a user item made of intervals above a root: a custom scale (ADR-26) or a custom
  chord (ADR-36). The intervals are picked on a picker of one or two octaves (`labels`) or by
  clicking notes on its own neck (the current instrument, on the current root); a click
  toggles the note's interval, as the core reports it. The root is always in, and each note is
  in at most once (`2` or `9`). Plus a name, a family and whatever the item needs besides
  (`extra`, e.g. a chord's symbols).

  The form checks nothing itself: `onsave` gets what was entered, and a rejection's message
  (the core's: no notes, a duplicate name, …) is shown in the form.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Fretboard, type FretPosition } from '../fretboard';
  import { pitchClassOf } from '../theory';
  import {
    chosenDots,
    chosenFrom,
    columnOf,
    defaultLabels,
    degreeAt,
    intervalsOf,
    neckNotes,
    rowsOf,
    toggle,
    toggleColumn,
    type IntervalSetDraft,
    type Neck,
    type Offered,
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
    /**
     * The picker's cells: per semitone from the root, the label a chosen cell gets, `null` for
     * no cell. One octave by the core's default labels unless given; a chord passes two
     * (`chordIntervalLabels`).
     */
    labels?: Offered;
    /** More fields after the family, for what the item needs besides (a chord's symbols). */
    extra?: Snippet;
    /** Saves the item; a rejection's message is shown in the form. */
    onsave: (draft: IntervalSetDraft) => Promise<void>;
    oncancel: () => void;
  }

  const {
    title,
    noun,
    initial,
    families,
    defaultFamily,
    root,
    neck,
    labels = defaultLabels(),
    extra,
    onsave,
    oncancel,
  }: Props = $props();

  // The form edits its own copy; `initial` only seeds it.
  // svelte-ignore state_referenced_locally
  let name = $state(initial.name);
  // svelte-ignore state_referenced_locally
  let family = $state(initial.family);
  // svelte-ignore state_referenced_locally
  let chosen = $state(chosenFrom(initial.intervals, labels.length));
  let error = $state<string | null>(null);
  let saving = $state(false);

  const id = $props.id();
  const rows = $derived(rowsOf(labels.length));
  const notes = $derived(neckNotes(neck, pitchClassOf(root)));
  const dots = $derived(chosenDots(notes, chosen));
  const count = $derived(intervalsOf(chosen).length);

  /** What a picker row is called: the only one is "Intervals". */
  function rowName(row: number): string {
    if (rows.length === 1) return 'Intervals';
    return row === 0 ? 'Intervals up to the octave' : 'Intervals above the octave';
  }

  function pick(semitones: number) {
    chosen = toggle(chosen, semitones, labels);
  }

  function activate(position: FretPosition) {
    const degree = degreeAt(notes, position);
    if (degree !== undefined) chosen = toggleColumn(chosen, columnOf(degree), labels);
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
    {@render extra?.()}
  </div>

  <fieldset>
    <legend>Intervals from the root ({count} {count === 1 ? 'note' : 'notes'})</legend>
    {#each rows as row, index (index)}
      <div class="semitones" role="group" aria-label={rowName(index)}>
        {#each row as n (n)}
          {#if chosen[n] !== null || labels[n] !== null}
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
          {:else}
            <span class="gap" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
    {/each}
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
    min-width: 0;
  }

  .semitones {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr));
    gap: 0.375rem;
  }

  .semitones + .semitones {
    margin-top: 0.375rem;
  }

  /* Grid cells: as wide as their column, the number centred. */
  .semitone {
    padding: 0;
    font-variant-numeric: tabular-nums;
  }

  .semitone[aria-pressed='true'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }

  /* The root is always in the set: its cell can't be turned off, but stays solid. */
  .semitone:disabled {
    opacity: 1;
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
