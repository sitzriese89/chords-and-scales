<!--
  @component
  The display toggles that belong to the view, at the end of the Scales page's summary row
  (ADR-55): what the dots show
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
  <fieldset class="segmented">
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

  <fieldset class="segmented">
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
  /* The groups are segmented controls, styled in base.css (ADR-56). */
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
  }
</style>
