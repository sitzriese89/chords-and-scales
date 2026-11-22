<!--
  PROTOTYPE — throwaway, lives only on the `prototype/redesign` branch.
  Question: what should the Scales / Chords / Sheet layout look like?
  Three layout variants of the whole app shell, switchable with `?variant=A|B|C` (dev only),
  built from the real components and settings. Decided already: Chords has no fretboard; the
  Scales neck shows the scale only; harmonize stays on Scales and picking a degree chord opens
  Chords; instrument is shared; Sound + Appearance move to a ⚙ Settings dialog.
-->
<script lang="ts">
  import { AudioControls } from '../lib/audio';
  import { ChordPanel, getChordState } from '../lib/chords';
  import { ScaleExplorer, ScalePicker, ViewControls } from '../lib/explorer';
  import type { Printer, Rasterize } from '../lib/export';
  import { InstrumentPanel, instrumentTuning } from '../lib/instrument';
  import { CollapsiblePanel } from '../lib/panels';
  import type { Random } from '../lib/random';
  import { getSettings } from '../lib/settings';
  import { getSheet, SheetView } from '../lib/sheet';
  import type { UserFiles } from '../lib/storage';
  import { ThemePicker } from '../lib/themes';
  import { VoicingBrowser } from '../lib/voicings';

  const {
    random,
    files,
    rasterize,
    printer,
  }: { random: Random; files: UserFiles; rasterize: Rasterize; printer: Printer } = $props();

  const settings = getSettings();
  const sheet = getSheet();
  const chordState = getChordState();

  const VARIANTS = [
    { key: 'A', name: 'Top tabs, instrument bar per page' },
    { key: 'B', name: 'Side rail, instrument in the rail' },
    { key: 'C', name: 'One toolbar, pickers as drawers' },
  ] as const;
  type Key = (typeof VARIANTS)[number]['key'];

  const initial = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  let variant = $state<Key>(VARIANTS.some((v) => v.key === initial) ? (initial as Key) : 'A');
  const current = $derived(VARIANTS.find((v) => v.key === variant)!);

  function cycle(step: number) {
    const i = VARIANTS.findIndex((v) => v.key === variant);
    variant = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length].key;
    const url = new URL(location.href);
    url.searchParams.set('variant', variant);
    history.replaceState(null, '', url);
  }

  function onkeydown(event: KeyboardEvent) {
    const t = event.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'ArrowLeft' && event.altKey) cycle(-1);
    if (event.key === 'ArrowRight' && event.altKey) cycle(1);
  }

  const startPage = new URLSearchParams(location.search).get('page');
  let page = $state<'scales' | 'chords' | 'sheet'>(
    startPage === 'chords' || startPage === 'sheet' ? startPage : 'scales',
  );
  let settingsOpen = $state(false);
  let dialog = $state<HTMLDialogElement>();
  $effect(() => {
    if (!dialog) return;
    if (settingsOpen && !dialog.open) dialog.showModal();
    if (!settingsOpen && dialog.open) dialog.close();
  });

  // Picking a degree chord in harmonize (on Scales) opens the Chords page.
  let lastDegree: number | null = chordState.mode === 'degree' ? chordState.degree : null;
  $effect(() => {
    const d = chordState.mode === 'degree' ? chordState.degree : null;
    if (d !== null && d !== lastDegree && page === 'scales') page = 'chords';
    lastDegree = d;
  });

  let pickerCollapsed = $state(false);
  let chordPickerCollapsed = $state(false);
  let instrumentOpen = $state(false);
  let drawer = $state(false);

  const inst = $derived(settings.current.instrument);
  const instSummary = $derived(
    `${inst.strings}-string ${inst.kind} · ${instrumentTuning(inst).name} · ${inst.frets} frets${inst.capo ? ` · capo ${inst.capo}` : ''}`,
  );
  const PAGES = [
    { id: 'scales', label: 'Scales', icon: '♪' },
    { id: 'chords', label: 'Chords', icon: '▦' },
    { id: 'sheet', label: 'Sheet', icon: '▤' },
  ] as const;
</script>

<svelte:window {onkeydown} />

{#snippet tabs()}
  <nav class="tabs" aria-label="Pages">
    {#each PAGES as p (p.id)}
      <button
        type="button"
        aria-current={page === p.id ? 'page' : undefined}
        onclick={() => (page = p.id)}
        >{p.label}{p.id === 'sheet' ? ` (${sheet.items.length})` : ''}</button
      >
    {/each}
  </nav>
{/snippet}

{#snippet gear()}
  <button type="button" class="ghost" onclick={() => (settingsOpen = true)}>⚙ Settings</button>
{/snippet}

{#snippet instrumentBar()}
  <div class="instrument-bar">
    <button
      type="button"
      class="ghost"
      aria-expanded={instrumentOpen}
      onclick={() => (instrumentOpen = !instrumentOpen)}
      >🎸 {instSummary} {instrumentOpen ? '▴' : '▾'}</button
    >
    {#if instrumentOpen}
      <div class="instrument-pop"><InstrumentPanel /></div>
    {/if}
  </div>
{/snippet}

{#snippet scalesMain()}
  <div class="main">
    <ViewControls />
    <ScaleExplorer showChord={false} />
  </div>
{/snippet}

{#snippet chordShapes()}
  <div class="main shapes">
    {#if chordState.active}
      <VoicingBrowser />
    {:else}
      <p class="muted">Choose a chord on the left to see its shapes.</p>
    {/if}
  </div>
{/snippet}

{#snippet sheetPage()}
  <div class="main"><SheetView {files} {rasterize} {printer} /></div>
{/snippet}

<div class="proto variant-{variant}">
  {#if variant === 'A'}
    <!-- A: top tabs; each page has its own collapsible picker on the left and the
         instrument bar on top of its main area. -->
    <header class="top">
      <h1>Chords &amp; Scales</h1>
      {@render tabs()}
      <span class="spacer"></span>
      {@render gear()}
    </header>
    {#if page === 'scales'}
      <div class="cols" class:collapsed={pickerCollapsed}>
        <CollapsiblePanel
          id="p-scales"
          title="Scales"
          collapsed={pickerCollapsed}
          ontoggle={() => (pickerCollapsed = !pickerCollapsed)}
        >
          <ScalePicker {random} />
        </CollapsiblePanel>
        <div>
          {@render instrumentBar()}
          {@render scalesMain()}
        </div>
      </div>
    {:else if page === 'chords'}
      <div class="cols" class:collapsed={chordPickerCollapsed}>
        <CollapsiblePanel
          id="p-chords"
          title="Chord"
          collapsed={chordPickerCollapsed}
          ontoggle={() => (chordPickerCollapsed = !chordPickerCollapsed)}
        >
          <div class="chord-picker"><ChordPanel {random} /></div>
        </CollapsiblePanel>
        <div>
          {@render instrumentBar()}
          {@render chordShapes()}
        </div>
      </div>
    {:else}
      {@render sheetPage()}
    {/if}
  {:else if variant === 'B'}
    <!-- B: a vertical rail with the pages, the instrument and settings; the page's picker
         sits next to it. -->
    <div class="rail-layout">
      <nav class="rail" aria-label="Pages">
        <strong class="logo">C&amp;S</strong>
        {#each PAGES as p (p.id)}
          <button
            type="button"
            aria-current={page === p.id ? 'page' : undefined}
            onclick={() => (page = p.id)}
            ><span class="icon">{p.icon}</span>{p.label}{p.id === 'sheet'
              ? ` (${sheet.items.length})`
              : ''}</button
          >
        {/each}
        <span class="spacer"></span>
        <button
          type="button"
          aria-expanded={instrumentOpen}
          onclick={() => (instrumentOpen = !instrumentOpen)}
          title={instSummary}><span class="icon">🎸</span>{inst.strings}-str</button
        >
        <button type="button" onclick={() => (settingsOpen = true)}
          ><span class="icon">⚙</span>Settings</button
        >
      </nav>
      {#if instrumentOpen}
        <aside class="rail-flyout" aria-label="Instrument">
          <p class="muted">{instSummary}</p>
          <InstrumentPanel />
        </aside>
      {/if}
      {#if page === 'scales'}
        <div class="cols" class:collapsed={pickerCollapsed}>
          <CollapsiblePanel
            id="p-scales"
            title="Scales"
            collapsed={pickerCollapsed}
            ontoggle={() => (pickerCollapsed = !pickerCollapsed)}
          >
            <ScalePicker {random} />
          </CollapsiblePanel>
          {@render scalesMain()}
        </div>
      {:else if page === 'chords'}
        <div class="cols" class:collapsed={chordPickerCollapsed}>
          <CollapsiblePanel
            id="p-chords"
            title="Chord"
            collapsed={chordPickerCollapsed}
            ontoggle={() => (chordPickerCollapsed = !chordPickerCollapsed)}
          >
            <div class="chord-picker"><ChordPanel {random} /></div>
          </CollapsiblePanel>
          {@render chordShapes()}
        </div>
      {:else}
        {@render sheetPage()}
      {/if}
    </div>
  {:else}
    <!-- C: one global toolbar (pages, instrument, settings); the neck or the shapes get the
         full width and the picker slides in as a drawer. -->
    <header class="top toolbar">
      <h1>Chords &amp; Scales</h1>
      {@render tabs()}
      {#if page !== 'sheet'}
        <button type="button" onclick={() => (drawer = !drawer)} aria-expanded={drawer}
          >☰ {page === 'scales' ? 'Choose scale' : 'Choose chord'}</button
        >
      {/if}
      <span class="spacer"></span>
      {@render instrumentBar()}
      {@render gear()}
    </header>
    {#if page === 'sheet'}
      {@render sheetPage()}
    {:else}
      <div class="drawer-host">
        <aside class="drawer" class:open={drawer} aria-label="Picker" inert={!drawer}>
          <div class="drawer-head">
            <strong>{page === 'scales' ? 'Scale' : 'Chord'}</strong>
            <button type="button" class="ghost" onclick={() => (drawer = false)}>✕</button>
          </div>
          {#if page === 'scales'}
            <ScalePicker {random} />
          {:else}
            <div class="chord-picker"><ChordPanel {random} /></div>
          {/if}
        </aside>
        {#if page === 'scales'}{@render scalesMain()}{:else}{@render chordShapes()}{/if}
      </div>
    {/if}
  {/if}
</div>

<dialog bind:this={dialog} onclose={() => (settingsOpen = false)} class="settings-dialog">
  <div class="dialog-head">
    <h2>Settings</h2>
    <button type="button" class="ghost" onclick={() => (settingsOpen = false)}>✕</button>
  </div>
  <h3>Sound</h3>
  <AudioControls />
  <h3>Appearance</h3>
  <ThemePicker />
</dialog>

<div class="switcher" role="group" aria-label="Prototype variant">
  <button type="button" onclick={() => cycle(-1)} aria-label="Previous variant">◀</button>
  <span>{current.key} · {current.name}</span>
  <button type="button" onclick={() => cycle(1)} aria-label="Next variant">▶</button>
  <small>Alt+←/→ · page: {page}</small>
</div>

<style>
  .proto {
    min-height: 100vh;
    padding-bottom: 4rem;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
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

  button.ghost {
    color: var(--text);
    background: var(--surface-raised);
    border-color: var(--border-strong);
  }

  .spacer {
    flex: 1;
  }

  .muted {
    color: var(--text-muted);
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.25rem;
    padding: 0 0 0.75rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tabs button {
    color: var(--text);
    background: transparent;
    border-color: transparent;
    border-radius: 0.375rem 0.375rem 0 0;
  }

  .tabs button[aria-current='page'] {
    color: var(--accent-text);
    background: var(--accent);
  }

  .cols {
    display: grid;
    grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .cols.collapsed {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .main {
    min-width: 0;
  }

  .instrument-bar {
    position: relative;
    margin-bottom: 0.75rem;
  }

  .toolbar .instrument-bar {
    margin: 0;
  }

  .instrument-pop {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.25rem);
    left: 0;
    width: 20rem;
    max-height: 70vh;
    overflow: auto;
    padding: 0.75rem;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
  }

  .toolbar .instrument-pop {
    left: auto;
    right: 0;
  }

  /* The chord panel as a full-height picker: no resize edge, no own collapse. */
  .chord-picker :global(.chord-panel .edge),
  .chord-picker :global(.chord-panel > header) {
    display: none;
  }

  .chord-picker :global(.chord-panel .body) {
    height: auto !important;
    overflow: visible;
  }

  .chord-picker :global(.chord-panel .inputs) {
    display: block;
  }

  /* Larger shape diagrams. */
  .shapes :global(.voicings svg) {
    width: 11rem;
    height: auto;
  }

  .rail-layout {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .rail-layout > .cols {
    grid-column: 3;
  }

  .rail-layout > :global(.main) {
    grid-column: 2 / 4;
  }

  .rail {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-height: calc(100vh - 6rem);
    padding: 0.5rem;
    background: var(--surface-sunken, var(--surface-raised));
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .rail button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    width: 4.5rem;
    color: var(--text);
    background: transparent;
    border-color: transparent;
    font-size: 0.75rem;
  }

  .rail button[aria-current='page'] {
    color: var(--accent-text);
    background: var(--accent);
  }

  .rail .icon {
    font-size: 1.25rem;
  }

  .logo {
    text-align: center;
    padding: 0.25rem 0 0.5rem;
  }

  .rail-flyout {
    width: 18rem;
    padding: 0.75rem;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
  }

  .drawer-host {
    position: relative;
  }

  .drawer {
    position: absolute;
    z-index: 15;
    top: 0;
    left: 0;
    width: 20rem;
    max-height: calc(100vh - 8rem);
    overflow: auto;
    padding: 0.75rem;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
    transform: translateX(-110%);
    transition: transform 0.15s ease;
  }

  .drawer.open {
    transform: none;
  }

  .drawer-head,
  .dialog-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .settings-dialog {
    width: min(28rem, 90vw);
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
  }

  .settings-dialog h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  .settings-dialog h3 {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
  }

  .switcher {
    position: fixed;
    z-index: 100;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.75rem;
    color: #fff;
    background: #111;
    border: 2px solid #ff0;
    border-radius: 999px;
    box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 0.5);
    font-size: 0.875rem;
  }

  .switcher button {
    color: #111;
    background: #ff0;
    border-color: #ff0;
    padding: 0 0.5rem;
  }

  .switcher small {
    opacity: 0.7;
  }
</style>
