<!--
  @component
  Volume and mute (SPEC §5.9, ADR-28). Both are settings, saved on change and kept across
  restarts. Dragging the slider changes the volume at once; the setting is saved when the
  drag ends. Muting keeps the volume.
-->
<script lang="ts">
  import { getSettings, MAX_VOLUME } from '../settings';
  import { getAudio } from './context';

  const settings = getSettings();
  const audio = getAudio();

  const volume = $derived(settings.current.audio.volume);
  const muted = $derived(settings.current.audio.muted);

  function ignore() {
    // Always a valid setting; a failed save is shown by the store's warning.
  }
</script>

<div class="panel">
  <label class="check">
    <input
      type="checkbox"
      checked={muted}
      onchange={(event) =>
        settings.update({ audio: { muted: event.currentTarget.checked } }).catch(ignore)}
    />
    Mute
  </label>
  <div class="field">
    <label for="audio-volume">Volume</label>
    <input
      id="audio-volume"
      type="range"
      min="0"
      max={MAX_VOLUME}
      step="1"
      value={volume}
      aria-valuetext="{volume} percent"
      oninput={(event) => audio.configure({ volume: event.currentTarget.valueAsNumber })}
      onchange={(event) =>
        settings.update({ audio: { volume: event.currentTarget.valueAsNumber } }).catch(ignore)}
    />
  </div>
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

  .check {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  input[type='range'] {
    accent-color: var(--accent);
    width: 100%;
  }
</style>
