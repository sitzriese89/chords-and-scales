<script lang="ts">
  import { ScaleExplorer, ScalePicker, ViewControls } from './lib/explorer';
  import { InstrumentPanel } from './lib/instrument';
  import { SettingsStore, setSettings } from './lib/settings';
  import { createStorage, type Storage } from './lib/storage';
  import { version } from './lib/theory';
  import { setUserCatalogs, UserCatalogs } from './lib/user-catalogs.svelte';
  import { applyTheme } from './styles/theme';

  // Tests pass their own storage; the app picks Tauri files or localStorage (ADR-4).
  const { storage = createStorage() }: { storage?: Storage } = $props();

  const coreVersion = version();

  // Settings load once at start and save on every change (ADR-17). The storage is fixed for
  // the app's lifetime, so taking the prop's initial value is intended.
  // svelte-ignore state_referenced_locally
  const settings = new SettingsStore(storage);
  setSettings(settings);
  // The user's scales and tunings; editors save through it and it tells the views (ADR-24).
  // svelte-ignore state_referenced_locally
  const catalogs = new UserCatalogs(storage);
  setUserCatalogs(catalogs);

  // The views wait for the settings and the user's scales and tunings, so the last view
  // appears at once instead of after a flash of the defaults.
  let ready = $state(false);
  Promise.all([settings.load(), catalogs.load()]).then(() => {
    ready = true;
  });
  const fileProblems = $derived(catalogs.problems);

  $effect(() => applyTheme(settings.current.theme));
</script>

{#if settings.warning}
  <div class="settings-warning" role="status">
    <p>{settings.warning}</p>
    <button type="button" onclick={() => settings.dismissWarning()}>Dismiss</button>
  </div>
{/if}

<!--
  Main layout (ADR-23). Regions, by grid area:
  - picker:   root and scale picker.
  - board:    the view toggles (labels, sharps/flats) and the fretboard.
  - settings: the instrument panel (strings, tuning and custom tunings, frets, capo,
              left-handed, theme; ADR-24). The view toggles stay in board.
  - chords:   the docked chord panel (ADR-10), filled by #18.
  On narrow windows the regions stack in that order.
-->
<div class="layout">
  <header class="title">
    <h1>Chords &amp; Scales</h1>
    {#if fileProblems.length > 0}
      <details class="file-problems">
        <summary>
          {fileProblems.length === 1 ? 'One item' : `${fileProblems.length} items`} in your files could
          not be loaded
        </summary>
        <ul>
          {#each fileProblems as problem (problem)}
            <li>{problem}</li>
          {/each}
        </ul>
      </details>
    {/if}
  </header>

  {#if ready}
    <nav class="region picker" aria-label="Scale picker">
      <ScalePicker />
    </nav>

    <main class="region board">
      <ViewControls />
      <ScaleExplorer />
    </main>

    <aside class="region settings" aria-label="Instrument settings">
      <h2>Instrument</h2>
      <InstrumentPanel />
    </aside>

    <aside class="region chords" aria-label="Chords">
      <h2>Chords</h2>
      <!-- #18: the chord panel content goes here. -->
      <p class="muted">Chords on the neck come in a later version.</p>
    </aside>
  {:else}
    <p class="muted loading">Loading…</p>
  {/if}

  <footer class="footer">
    <p class="muted">Theory core v{coreVersion}</p>
  </footer>
</div>

<style>
  .settings-warning {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    margin: 0 0 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--text-danger);
    border-radius: 0.375rem;
    background: var(--surface-raised);
    color: var(--text);
    font-size: 0.875rem;
  }

  .settings-warning p {
    margin: 0;
  }

  button {
    font: inherit;
    color: var(--accent-text);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }

  button:hover {
    background: var(--accent-hover);
  }

  .layout {
    display: grid;
    gap: 1rem 1.5rem;
    grid-template-columns: minmax(13rem, 16rem) minmax(0, 1fr) minmax(12rem, 15rem);
    grid-template-areas:
      'title title title'
      'picker board settings'
      'picker chords settings'
      'footer footer footer';
    align-items: start;
  }

  .title {
    grid-area: title;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1.5rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .region {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface-raised);
    min-width: 0;
  }

  .picker {
    grid-area: picker;
  }

  .board {
    grid-area: board;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .settings {
    grid-area: settings;
  }

  .chords {
    grid-area: chords;
    background: var(--surface-sunken);
  }

  .loading {
    grid-column: 1 / -1;
  }

  .footer {
    grid-area: footer;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .file-problems {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .file-problems summary {
    cursor: pointer;
  }

  .file-problems ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
  }

  @media (max-width: 60rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'title' 'picker' 'board' 'settings' 'chords' 'footer';
    }
  }
</style>
