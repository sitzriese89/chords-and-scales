<!--
  @component
  The export sheet (SPEC §5.10, ADR-43): its title, its own theme and light/dark choice, the
  list of its items with Move up, Move down and Remove, and the sheet itself.

  The sheet is one self-contained subtree, the `article[data-sheet]`: its theme's stylesheet
  (scoped to it, so the app's theme around it is untouched), the title, and one
  `figure[data-sheet-item]` per item holding that item's SVG, drawn by the app's own components
  (`Fretboard`, `TabView`, `ChordDiagram`) from what the item stored. The editing controls are
  outside it, so an export can take the subtree as it is (M4.3, M4.4).

  Export: the whole sheet as SVG or HTML, each item as SVG, built from that subtree (ADR-44)
  and saved through `files` (a save dialog in Tauri, a download in the browser).
-->
<script lang="ts">
  import { exportFileName, itemSvg, sheetHtml, sheetSvg } from '../export';
  import { Fretboard } from '../fretboard';
  import type { FileFormat, UserFiles } from '../storage';
  import { TabView } from '../tab';
  import { BUILT_IN_THEMES, getThemes, resolveScheme, schemesOf, themeCss } from '../themes';
  import type { Theme } from '../themes';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { ChordDiagram } from '../voicings';
  import { DEFAULT_SHEET_THEME_ID, MAX_SHEET_TITLE, SHEET_SCHEMES } from './schema';
  import type { SheetScheme } from './schema';
  import { getSheet } from './store.svelte';
  import { sheetItemView } from './view';

  const { files }: { files: UserFiles } = $props();

  const sheet = getSheet();
  const library = getThemes();
  const catalogs = getUserCatalogs();

  /** The selector the sheet's stylesheet is scoped to. */
  const SCOPE = '[data-sheet]';
  const PRINT: Theme = BUILT_IN_THEMES.find((t) => t.id === DEFAULT_SHEET_THEME_ID)!;

  const found = $derived(library.themes.find((t) => t.id === sheet.themeId));
  const theme = $derived(found ?? PRINT);
  const only = $derived.by(() => {
    const schemes = schemesOf(theme);
    return schemes.length === 1 ? schemes[0] : null;
  });
  const scheme = $derived(resolveScheme(theme, sheet.scheme, false));
  const css = $derived(themeCss(theme, SCOPE));
  const groups = $derived(
    [
      { label: 'Built-in', themes: library.builtIn },
      { label: 'Your themes', themes: library.userThemes },
    ].filter((group) => group.themes.length > 0),
  );

  const views = $derived.by(() => {
    // Draw again when a user scale, chord or tuning was saved or deleted (ADR-24).
    void catalogs.revision;
    return sheet.items.map((entry) => ({ key: entry.key, view: sheetItemView(entry.item) }));
  });

  const SCHEME_TEXT: Record<SheetScheme, string> = { light: 'Light', dark: 'Dark' };

  function ignore() {
    // A failed save is shown by the store's warning.
  }

  /** The sheet's subtree on screen: what the exports are built from. */
  let article = $state<HTMLElement>();
  /** What the last export did; shown until the next one. */
  let exported = $state<string | null>(null);

  async function save(format: FileFormat, suggestedName: string, build: () => string) {
    exported = null;
    try {
      const saved = await files.save({ suggestedName, format, content: build() });
      if (saved) exported = `Exported ${suggestedName}.`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      exported = `Could not export ${suggestedName}: ${reason}`;
    }
  }

  function exportSheet(format: 'svg' | 'html') {
    const root = article;
    if (!root) return;
    const build = format === 'svg' ? () => sheetSvg(root) : () => sheetHtml(root);
    return save(format, exportFileName(sheet.title, format), build);
  }

  function exportItem(index: number, title: string) {
    const figure = article?.querySelectorAll<HTMLElement>('figure[data-sheet-item]')[index];
    if (!figure) return;
    return save('svg', exportFileName(title, 'svg'), () => itemSvg(figure));
  }

  /** Puts the theme's stylesheet first in the sheet, kept up to date as the theme changes. */
  function themeStyle(css: string) {
    return (root: HTMLElement) => {
      const style = root.ownerDocument.createElement('style');
      style.textContent = css;
      root.prepend(style);
      return () => style.remove();
    };
  }
</script>

<section class="sheet-editor" aria-labelledby="sheet-editor-title">
  {#if sheet.warning}
    <div class="warning" role="status">
      <p>{sheet.warning}</p>
      <button type="button" onclick={() => sheet.dismissWarning()}>Dismiss</button>
    </div>
  {/if}

  <h2 id="sheet-editor-title">Export sheet</h2>

  <div class="controls">
    <div class="field">
      <label for="sheet-title">Title</label>
      <input
        id="sheet-title"
        type="text"
        maxlength={MAX_SHEET_TITLE}
        value={sheet.title}
        onchange={(e) => sheet.setTitle(e.currentTarget.value).catch(ignore)}
      />
    </div>
    <div class="field">
      <label for="sheet-theme">Sheet theme</label>
      <select
        id="sheet-theme"
        value={theme.id}
        onchange={(e) => sheet.setTheme({ themeId: e.currentTarget.value }).catch(ignore)}
      >
        {#each groups as group (group.label)}
          <optgroup label={group.label}>
            {#each group.themes as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      {#if !found}
        <p class="muted">The theme “{sheet.themeId}” was not found, so {PRINT.name} is shown.</p>
      {/if}
    </div>
    <fieldset aria-describedby={only ? 'sheet-only-scheme' : undefined}>
      <legend>Sheet light or dark</legend>
      {#each SHEET_SCHEMES as value (value)}
        <label>
          <input
            type="radio"
            name="sheet-scheme"
            {value}
            checked={sheet.scheme === value}
            disabled={only !== null}
            onchange={() => sheet.setTheme({ scheme: value }).catch(ignore)}
          />
          {SCHEME_TEXT[value]}
        </label>
      {/each}
      {#if only}
        <p id="sheet-only-scheme" class="muted">{theme.name} is {only} only.</p>
      {/if}
    </fieldset>
  </div>

  {#if views.length === 0}
    <p class="muted">
      The sheet is empty. Add a scale, its tab, a chord or a voicing with the “Add … to sheet”
      buttons next to them.
    </p>
  {:else}
    <ol class="items" aria-label="Items on the sheet">
      {#each views as { key, view }, index (key)}
        <li>
          <span class="item-title">{view.title}</span>
          <button
            type="button"
            aria-label="Move {view.title} up"
            disabled={index === 0}
            onclick={() => sheet.move(key, -1).catch(ignore)}>Move up</button
          >
          <button
            type="button"
            aria-label="Move {view.title} down"
            disabled={index === views.length - 1}
            onclick={() => sheet.move(key, 1).catch(ignore)}>Move down</button
          >
          <button
            type="button"
            aria-label="Remove {view.title}"
            onclick={() => sheet.remove(key).catch(ignore)}>Remove</button
          >
          <button
            type="button"
            aria-label="Export {view.title} as SVG"
            onclick={() => exportItem(index, view.title)}>Export SVG</button
          >
        </li>
      {/each}
    </ol>
  {/if}

  <div class="export" role="group" aria-label="Export the sheet">
    <button type="button" disabled={views.length === 0} onclick={() => exportSheet('svg')}
      >Export sheet as SVG</button
    >
    <button type="button" disabled={views.length === 0} onclick={() => exportSheet('html')}
      >Export sheet as HTML</button
    >
    {#if exported}
      <p class="muted" role="status">{exported}</p>
    {/if}
  </div>

  <div class="preview">
    <article
      bind:this={article}
      class="sheet"
      data-sheet
      data-scheme={scheme}
      data-theme-id={theme.id}
      aria-label="Sheet: {sheet.title}"
      {@attach themeStyle(css)}
    >
      <h2 class="sheet-title">{sheet.title}</h2>
      {#each views as { key, view } (key)}
        <figure class="sheet-item" data-sheet-item data-kind={view.kind}>
          <figcaption>
            <span class="title">{view.title}</span>
            {#if view.kind !== 'missing'}
              <span class="caption">{view.caption}</span>
            {/if}
          </figcaption>
          {#if view.kind === 'fretboard'}
            <Fretboard
              strings={view.strings}
              frets={view.frets}
              capo={view.capo}
              dots={view.dots}
              leftHanded={view.leftHanded}
              ariaLabel="Sheet fretboard: {view.title}"
            />
          {:else if view.kind === 'tab'}
            <TabView
              strings={view.strings}
              notes={view.notes}
              capo={view.capo}
              ariaLabel="Sheet tab: {view.title}"
            />
          {:else if view.kind === 'diagram'}
            <ChordDiagram
              voicing={view.voicing}
              capo={view.capo}
              leftHanded={view.leftHanded}
              label={view.label}
              ariaLabel="Sheet chord diagram: {view.title}"
            />
          {:else}
            <p class="missing" role="note">Missing: {view.reason}</p>
          {/if}
        </figure>
      {/each}
    </article>
  </div>
</section>

<style>
  .sheet-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .warning {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-strong);
    border-left: 4px solid var(--text-danger);
    border-radius: 0.375rem;
    background: var(--surface-raised);
    font-size: 0.875rem;
  }

  .warning p {
    margin: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem 1.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }

  input[type='text'],
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.5rem;
  }

  input[type='text'] {
    min-width: 16rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 0.875rem;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
  }

  button {
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.125rem 0.5rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding-left: 1.5rem;
  }

  .items li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
  }

  .item-title {
    margin-right: auto;
  }

  .export {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .preview {
    overflow-x: auto;
  }

  /* The sheet: everything in it takes the sheet theme's tokens. */
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }

  .sheet-title {
    font-size: 1.5rem;
  }

  .sheet-item {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    break-inside: avoid;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }

  figcaption .title {
    font-weight: 600;
  }

  figcaption .caption {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .missing {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px dashed var(--border-strong);
    border-radius: 0.375rem;
    color: var(--text-muted);
  }
</style>
