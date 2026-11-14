<!--
  @component
  The neck for the current last view: the scale's notes on the root across the whole neck of
  the current instrument (tuning, fret count, capo, left-handed from the settings), with a
  summary of the scale above it. Everything shown comes from the core (`explorerView`).
-->
<script lang="ts">
  import { Fretboard } from '../fretboard';
  import { getSettings } from '../settings';
  import { explorerView } from './view';

  const settings = getSettings();
  const view = $derived(explorerView(settings.current));
  const title = $derived(`${view.root} ${view.scale.name}`);
</script>

<section class="explorer" aria-labelledby="explorer-title">
  <div class="summary">
    <h2 id="explorer-title">{title}</h2>
    <dl class="notes" aria-label="Notes of {title}">
      {#each view.notes as note (note.semitones)}
        <div class="note" class:root={note.semitones === 0}>
          <dt>{note.interval}</dt>
          <dd>{note.name}</dd>
        </div>
      {/each}
    </dl>
  </div>

  {#each view.fallbacks as fallback (fallback)}
    <p class="fallback">{fallback}</p>
  {/each}

  <div class="neck">
    <Fretboard
      strings={view.tuning.notes.length}
      frets={view.frets}
      capo={view.capo}
      dots={view.dots}
      leftHanded={settings.current.leftHanded}
      ariaLabel="Fretboard: {title}, {view.tuning.name} tuning"
    />
  </div>
</section>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1.25rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
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

  .fallback {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .neck {
    overflow-x: auto;
  }
</style>
