<script lang="ts">
  import { AudioControls, AudioEngine, setAudio } from './lib/audio';
  import {
    ChordPanel,
    ChordState,
    harmonizer as coreHarmonizer,
    setChordState,
    type Harmonizer,
  } from './lib/chords';
  import {
    ScaleEditorState,
    ScaleExplorer,
    ScalePicker,
    ViewControls,
    setScaleEditor,
  } from './lib/explorer';
  import { InstrumentPanel } from './lib/instrument';
  import { SettingsStore, setSettings } from './lib/settings';
  import type { Random } from './lib/random';
  import { setSheet, SheetStore, SheetView } from './lib/sheet';
  import { createStorage, createUserFiles, type Storage, type UserFiles } from './lib/storage';
  import { setTagFilters, TagFilters } from './lib/tags';
  import { applyTheme, setThemes, ThemeLibrary, ThemePicker } from './lib/themes';
  import { version } from './lib/theory';
  import { setUserCatalogs, UserCatalogs } from './lib/user-catalogs.svelte';
  import { VoicingBrowser } from './lib/voicings';

  // Tests pass their own storage, audio engine, harmonizer, random numbers and user files; the
  // app picks Tauri files or localStorage (ADR-4), the Web Audio engine (ADR-28), the core's
  // harmonize (ADR-32), `Math.random` for the random pick (ADR-42) and save dialogs or
  // downloads for exports (ADR-17, ADR-44).
  const {
    storage = createStorage(),
    audio: injectedAudio,
    harmonizer = coreHarmonizer,
    random = Math.random,
    files = createUserFiles(),
  }: {
    storage?: Storage;
    audio?: AudioEngine;
    harmonizer?: Harmonizer | null;
    random?: Random;
    files?: UserFiles;
  } = $props();

  const coreVersion = version();

  // Settings load once at start and save on every change (ADR-17). The storage is fixed for
  // the app's lifetime, so taking the prop's initial value is intended.
  // svelte-ignore state_referenced_locally
  const settings = new SettingsStore(storage);
  setSettings(settings);
  // The user's scales, chords and tunings; editors save through it and it tells the views
  // (ADR-24).
  // svelte-ignore state_referenced_locally
  const catalogs = new UserCatalogs(storage);
  setUserCatalogs(catalogs);
  // The tag chips of the scale and chord pickers, and what they let through (ADR-41).
  setTagFilters(new TagFilters(catalogs));
  // The built-in themes and the user's theme files (ADR-40).
  // svelte-ignore state_referenced_locally
  const themes = new ThemeLibrary(storage);
  setThemes(themes);
  // The export sheet: the items the "Add … to sheet" buttons collect, saved as `sheet.toml`
  // (ADR-43).
  // svelte-ignore state_referenced_locally
  const sheet = new SheetStore(storage);
  setSheet(sheet);
  /** Which page is shown: the explorer with its panels, or the export sheet. Not saved. */
  let page = $state<'explorer' | 'sheet'>('explorer');
  // The chord chosen in the chord panel, drawn on the explorer's neck (ADR-32).
  // svelte-ignore state_referenced_locally
  setChordState(new ChordState(settings, harmonizer, catalogs));
  // Whether the scale editor is open: the picker shows it, reverse lookup opens it too (ADR-38).
  setScaleEditor(new ScaleEditorState());

  // The sound: no AudioContext exists until the first click or key press (ADR-28). Volume and
  // mute follow the settings. The engine is closed when the app goes, unless a test owns it.
  // svelte-ignore state_referenced_locally
  const audio = injectedAudio ?? new AudioEngine();
  setAudio(audio);
  $effect(() => audio.configure(settings.current.audio));
  $effect(() => () => {
    if (!injectedAudio) audio.dispose();
  });

  // The views wait for the settings and the user's scales and tunings, so the last view
  // appears at once instead of after a flash of the defaults.
  let ready = $state(false);
  Promise.all([settings.load(), catalogs.load(), themes.load(), sheet.load()]).then(() => {
    ready = true;
  });
  const fileProblems = $derived(catalogs.problems);

  // The chosen theme in the chosen scheme; with "System" it follows the OS until either
  // changes (ADR-40).
  $effect(() => applyTheme(themes.get(settings.current.themeId), settings.current.theme));
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
              left-handed; ADR-24), the sound (volume, mute; ADR-28) and the appearance
              (theme and light/dark; ADR-40). The view toggles stay in board.
  - chords:   the docked chord panel (SPEC §5.3, ADR-10, ADR-32): collapsible and resizable.
  On narrow windows the regions stack in that order.
  The header's Explorer / Sheet buttons swap these regions for the export sheet (ADR-43).
-->
<div class="layout">
  <header class="title">
    <h1>Chords &amp; Scales</h1>
    <nav class="pages" aria-label="Pages">
      <button
        type="button"
        aria-current={page === 'explorer' ? 'page' : undefined}
        onclick={() => (page = 'explorer')}>Explorer</button
      >
      <button
        type="button"
        aria-current={page === 'sheet' ? 'page' : undefined}
        onclick={() => (page = 'sheet')}>Sheet ({sheet.items.length})</button
      >
    </nav>
    {#if fileProblems.length > 0}
      <details class="file-problems">
        <summary>
          {fileProblems.length === 1 ? 'One problem' : `${fileProblems.length} problems`} with your files:
          some items or tag rules were not used
        </summary>
        <ul>
          {#each fileProblems as problem (problem)}
            <li>{problem}</li>
          {/each}
        </ul>
      </details>
    {/if}
  </header>

  {#if ready && page === 'sheet'}
    <main class="region sheet">
      <SheetView {files} />
    </main>
  {:else if ready}
    <nav class="region picker" aria-label="Scale picker">
      <ScalePicker {random} />
    </nav>

    <main class="region board">
      <ViewControls />
      <ScaleExplorer />
    </main>

    <aside class="region settings" aria-label="Settings">
      <h2>Instrument</h2>
      <InstrumentPanel />
      <h2 class="section">Sound</h2>
      <AudioControls />
      <h2 class="section">Appearance</h2>
      <ThemePicker />
    </aside>

    <aside class="region chords" aria-label="Chords">
      <ChordPanel {random}>
        <VoicingBrowser />
      </ChordPanel>
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

  h2.section {
    margin-top: 1rem;
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

  .loading,
  .sheet {
    grid-column: 1 / -1;
  }

  .pages {
    display: flex;
    gap: 0.25rem;
  }

  .pages button {
    color: var(--text);
    background: var(--surface-raised);
    border-color: var(--border-strong);
    font-size: 0.875rem;
  }

  .pages button[aria-current='page'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
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
