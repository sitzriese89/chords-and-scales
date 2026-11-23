<!--
  @component
  Picks the position the tab shows (ADR-7, ADR-25): a 3-notes-per-string pattern of those that
  fit the neck, or a fret window (start fret and number of frets); the direction it is played
  in; and whether the fretboard dims the notes outside it. All of it is stored in the settings'
  `tab` table and saved on change (ADR-17).
-->
<script lang="ts">
  import {
    getSettings,
    MAX_FRETS,
    MAX_WINDOW_SPAN,
    type Direction,
    type PositionSystem,
  } from '../settings';
  import type { TabPosition } from './position';

  interface Props {
    /** The position shown, from `tabPosition`. */
    position: TabPosition;
  }

  let { position }: Props = $props();

  const settings = getSettings();
  const tab = $derived(settings.current.tab);

  const systems: { value: PositionSystem; text: string }[] = [
    { value: '3nps', text: '3 notes per string' },
    { value: 'window', text: 'Fret window' },
  ];
  const directions: { value: Direction; text: string }[] = [
    { value: 'ascending', text: 'Up' },
    { value: 'descending', text: 'Down' },
    { value: 'both', text: 'Up and down' },
  ];

  let problem = $state<string | null>(null);

  function ignore() {
    // Always a valid setting; a failed save is shown by the store's warning.
  }

  function setPattern(event: Event & { currentTarget: HTMLSelectElement }) {
    settings.update({ tab: { pattern: Number(event.currentTarget.value) } }).catch(ignore);
  }

  function setWindow(
    key: 'windowStart' | 'windowSpan',
    event: Event & { currentTarget: HTMLInputElement },
  ) {
    const input = event.currentTarget;
    const value = input.valueAsNumber;
    const change = key === 'windowStart' ? { windowStart: value } : { windowSpan: value };
    settings.update({ tab: change }).then(
      () => (problem = null),
      () => {
        problem =
          key === 'windowStart'
            ? `The window starts on a fret from 0 to ${MAX_FRETS}.`
            : `The window is 1 to ${MAX_WINDOW_SPAN} frets wide.`;
        input.value = String(tab[key]);
      },
    );
  }
</script>

<div class="controls">
  <fieldset class="segmented">
    <legend>Position</legend>
    {#each systems as system (system.value)}
      <label>
        <input
          type="radio"
          name="tab-system"
          value={system.value}
          checked={tab.system === system.value}
          onchange={() => settings.update({ tab: { system: system.value } }).catch(ignore)}
        />
        <span>{system.text}</span>
      </label>
    {/each}
  </fieldset>

  {#if tab.system === '3nps'}
    <div class="field">
      <label for="tab-pattern">Pattern</label>
      <select
        id="tab-pattern"
        value={position.pattern ?? ''}
        disabled={position.patterns.length === 0}
        onchange={setPattern}
      >
        {#each position.patterns as pattern (pattern.degree)}
          <option value={pattern.degree}>{pattern.label}</option>
        {/each}
      </select>
    </div>
  {:else}
    <div class="field">
      <label for="tab-window-start">Start fret</label>
      <input
        id="tab-window-start"
        type="number"
        min="0"
        max={MAX_FRETS}
        step="1"
        value={tab.windowStart}
        onchange={(event) => setWindow('windowStart', event)}
      />
    </div>
    <div class="field">
      <label for="tab-window-span">Frets</label>
      <input
        id="tab-window-span"
        type="number"
        min="1"
        max={MAX_WINDOW_SPAN}
        step="1"
        value={tab.windowSpan}
        onchange={(event) => setWindow('windowSpan', event)}
      />
    </div>
  {/if}

  <fieldset class="segmented">
    <legend>Direction</legend>
    {#each directions as direction (direction.value)}
      <label>
        <input
          type="radio"
          name="tab-direction"
          value={direction.value}
          checked={tab.direction === direction.value}
          onchange={() => settings.update({ tab: { direction: direction.value } }).catch(ignore)}
        />
        <span>{direction.text}</span>
      </label>
    {/each}
  </fieldset>

  <label class="check">
    <input
      type="checkbox"
      checked={tab.highlight}
      onchange={(event) =>
        settings.update({ tab: { highlight: event.currentTarget.checked } }).catch(ignore)}
    />
    Highlight on the neck
  </label>
</div>

{#if problem}
  <p class="problem" role="alert">{problem}</p>
{/if}
{#each position.notes as note (note)}
  <p class="note">{note}</p>
{/each}

<style>
  /* Position and Direction are segmented controls, styled in base.css (ADR-56). */
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1.5rem;
  }

  .field {
    display: flex;
    align-items: center;
  }

  .field > label {
    margin-right: 0.625rem;
  }

  input[type='number'] {
    width: 4.5rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  .problem {
    margin: 0;
    color: var(--text-danger);
    font-size: 0.875rem;
  }

  .note {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
