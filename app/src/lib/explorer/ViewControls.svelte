<!--
  @component
  The display toggles that belong to the view, next to the fretboard: what the dots show
  (note names, intervals, nothing) and how notes are spelled (sharps or flats; the root keeps
  its own spelling, ADR-6). Both are settings and are saved on change.
-->
<script lang="ts">
  import { getSettings, type Accidentals, type LabelMode } from '../settings';

  const settings = getSettings();

  const labelModes: { value: LabelMode; text: string }[] = [
    { value: 'notes', text: 'Notes' },
    { value: 'intervals', text: 'Intervals' },
    { value: 'none', text: 'None' },
  ];
  const accidentalChoices: { value: Accidentals; text: string; sign: string }[] = [
    { value: 'sharps', text: 'Sharps', sign: '♯' },
    { value: 'flats', text: 'Flats', sign: '♭' },
  ];

  function ignore() {
    // These values are always valid settings; a failed save is shown by the store's warning.
  }
</script>

<div class="controls">
  <fieldset>
    <legend>Labels</legend>
    {#each labelModes as mode (mode.value)}
      <label>
        <input
          type="radio"
          name="label-mode"
          value={mode.value}
          checked={settings.current.labels === mode.value}
          onchange={() => settings.update({ labels: mode.value }).catch(ignore)}
        />
        <span>{mode.text}</span>
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Accidentals</legend>
    {#each accidentalChoices as choice (choice.value)}
      <label>
        <input
          type="radio"
          name="accidentals"
          value={choice.value}
          checked={settings.current.accidentals === choice.value}
          onchange={() => settings.update({ accidentals: choice.value }).catch(ignore)}
        />
        <span><span aria-hidden="true">{choice.sign}</span> {choice.text}</span>
      </label>
    {/each}
  </fieldset>
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
  }

  fieldset {
    display: flex;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    border: 0;
    align-items: center;
  }

  legend {
    float: left;
    margin-right: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
  }

  label {
    position: relative;
  }

  /* Radios drawn as a segmented control; the native input keeps focus and keyboard use. */
  input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: pointer;
  }

  label > span {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    background: var(--surface-raised);
    color: var(--text);
    font-size: 0.875rem;
  }

  input:checked + span {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  input:hover:not(:checked) + span {
    border-color: var(--accent);
  }

  input:focus-visible + span {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
