<script lang="ts">
  import { AudioEngine, setAudio } from './lib/audio';
  import {
    ChordEditorDialog,
    ChordPanel,
    ChordState,
    harmonizer as coreHarmonizer,
    setChordState,
    type Harmonizer,
  } from './lib/chords';
  import {
    ScaleEditorDialog,
    ScaleEditorState,
    ScaleExplorer,
    ScalePicker,
    ViewControls,
    setScaleEditor,
  } from './lib/explorer';
  import { createPrinter, svgToPng, type Printer, type Rasterize } from './lib/export';
  import { InstrumentButton } from './lib/instrument';
  import { Drawer } from './lib/panels';
  import { SettingsStore, setSettings, type Page } from './lib/settings';
  import type { Random } from './lib/random';
  import { setSheet, SheetStore, SheetView } from './lib/sheet';
  import { SettingsDialog } from './lib/shell';
  import { createStorage, createUserFiles, type Storage, type UserFiles } from './lib/storage';
  import { setTagFilters, TagFilters } from './lib/tags';
  import { applyTheme, setThemes, ThemeLibrary } from './lib/themes';
  import { version } from './lib/theory';
  import { setUserCatalogs, UserCatalogs } from './lib/user-catalogs.svelte';
  import { VoicingBrowser } from './lib/voicings';

  // Tests pass their own storage, audio engine, harmonizer, random numbers, user files, PNG
  // rasterizer and printer; the app picks Tauri files or localStorage (ADR-4), the Web Audio
  // engine (ADR-28), the core's harmonize (ADR-32), `Math.random` for the random pick
  // (ADR-42), save dialogs or downloads for exports (ADR-17, ADR-44), a canvas for PNGs and
  // the webview's print dialog (ADR-45).
  const {
    storage = createStorage(),
    audio: injectedAudio,
    harmonizer = coreHarmonizer,
    random = Math.random,
    files = createUserFiles(),
    rasterize = (svg: string, scale: number) => svgToPng(svg, scale),
    printer = createPrinter(),
  }: {
    storage?: Storage;
    audio?: AudioEngine;
    harmonizer?: Harmonizer | null;
    random?: Random;
    files?: UserFiles;
    rasterize?: Rasterize;
    printer?: Printer;
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
  // The chord chosen in the chord panel, drawn on the explorer's neck (ADR-32).
  // svelte-ignore state_referenced_locally
  setChordState(new ChordState(settings, harmonizer, catalogs));
  // Whether the scale editor is open: the picker opens it, reverse lookup too (ADR-38).
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

  // The page under the toolbar is a setting, so the app opens where it was left (ADR-51). A
  // failed save is shown by the store's warning.
  const page = $derived(settings.current.page);
  const pages: { id: Page; label: () => string }[] = [
    { id: 'scales', label: () => 'Scales' },
    { id: 'chords', label: () => 'Chords' },
    { id: 'sheet', label: () => `Sheet (${sheet.items.length})` },
  ];
  function show(next: Page) {
    pickerOpen = false;
    if (next !== page) settings.update({ page: next }).catch(() => {});
  }

  // The scale picker's drawer: closed at start and not saved (ADR-51).
  let pickerOpen = $state(false);
  let pickerButton = $state<HTMLButtonElement>();
</script>

<!--
  The app shell (ADR-51, ADR-53): one toolbar, sticky at the top, and the page under it at the
  full width.
  - Toolbar, left to right: the title; the page tabs (Scales, Chords, Sheet with its item
    count); "Choose scale" on Scales, which opens the scale picker in a drawer from the left;
    a gap; the instrument button, a summary of the neck that opens the instrument settings
    (ADR-24) in a popover; ⚙ Settings, a dialog with Sound (ADR-28) and Appearance (ADR-40).
    On a narrow window it wraps.
  - Scales: the view toggles and the scale explorer (ADR-23).
  - Chords: the chord panel (SPEC §5.3, ADR-32) with the voicing browser (ADR-37), as they
    were docked under the neck; M6.3 reworks this page.
  - Sheet: the export sheet (ADR-43).
  The scale and chord editors are modal and live outside the pages, so they open from
  anywhere: reverse lookup on the Scales page opens both (ADR-38).
-->
<div class="app">
  <div class="top">
    <header class="toolbar">
      <h1>Chords &amp; Scales</h1>
      {#if ready}
        <nav class="pages" aria-label="Pages">
          {#each pages as p (p.id)}
            <button
              type="button"
              aria-current={page === p.id ? 'page' : undefined}
              onclick={() => show(p.id)}>{p.label()}</button
            >
          {/each}
        </nav>
        {#if page === 'scales'}
          <button
            bind:this={pickerButton}
            type="button"
            class="picker-button"
            aria-expanded={pickerOpen}
            aria-controls="scale-drawer"
            onclick={() => (pickerOpen = !pickerOpen)}
            ><span aria-hidden="true">☰</span> Choose scale</button
          >
        {/if}
        <span class="gap"></span>
        <InstrumentButton />
        <SettingsDialog />
      {/if}
    </header>
    {#if ready}
      <Drawer
        id="scale-drawer"
        title="Choose scale"
        open={pickerOpen}
        onclose={() => (pickerOpen = false)}
        opener={pickerButton}
      >
        <ScalePicker {random} />
      </Drawer>
    {/if}
  </div>

  {#if settings.warning}
    <div class="settings-warning" role="status">
      <p>{settings.warning}</p>
      <button type="button" onclick={() => settings.dismissWarning()}>Dismiss</button>
    </div>
  {/if}

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

  {#if !ready}
    <p class="muted">Loading…</p>
  {:else}
    <!-- Scales and Chords stay mounted while hidden, so a selection, an open row or a typed
         symbol is still there on coming back (ADR-53). -->
    <main class="page scales" aria-label="Scales" hidden={page !== 'scales'}>
      <ViewControls />
      <ScaleExplorer />
    </main>
    <main class="page chords" aria-label="Chords" hidden={page !== 'chords'}>
      <ChordPanel {random}>
        <VoicingBrowser />
      </ChordPanel>
    </main>
    <!-- The sheet is mounted only while shown: its print styles print the sheet alone whenever
         it is on the page (ADR-45). -->
    {#if page === 'sheet'}
      <main class="page sheet" aria-label="Sheet">
        <SheetView {files} {rasterize} {printer} />
      </main>
    {/if}
  {/if}

  <footer class="footer">
    <p class="muted">Theory core v{coreVersion}</p>
  </footer>
</div>

{#if ready}
  <ScaleEditorDialog />
  <ChordEditorDialog />
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* The toolbar stays in view; the drawer hangs under it. */
  .top {
    position: sticky;
    z-index: 4;
    top: 0;
    padding-top: 1rem;
    background: var(--surface);
    --drawer-top: 100%;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .gap {
    flex: 1;
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
    background: var(--surface-sunken);
  }

  .pages {
    display: flex;
    gap: 0.25rem;
  }

  .pages button {
    background: transparent;
    border-color: transparent;
  }

  .pages button:hover {
    background: var(--surface-sunken);
  }

  .pages button[aria-current='page'] {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .picker-button[aria-expanded='true'] {
    border-color: var(--accent);
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .page[hidden] {
    display: none;
  }

  .settings-warning {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
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

  .settings-warning button {
    color: var(--accent-text);
    background: var(--accent);
    border-color: var(--accent);
  }

  .settings-warning button:hover {
    background: var(--accent-hover);
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
</style>
