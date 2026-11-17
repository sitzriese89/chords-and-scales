<!--
  @component
  Root and scale picker of the scale explorer. Writes the choice to the settings' last view,
  which saves it (ADR-17). The root can be picked from the list or typed (`Db`, `f#`, `E♭`);
  it is checked by the core and keeps its spelling (ADR-6). Scales are grouped by family and
  can be searched by name, alias or id.

  The user's own scales are made, edited and deleted here (ADR-26): the editor opens in a
  dialog with its own neck, and saves to `scales.toml` through `UserCatalogs`. The dialog is
  open while `ScaleEditorState.editing` says so, so reverse lookup can open it too, with the
  selected notes (ADR-38).
-->
<script lang="ts">
  import { IntervalSetEditor, editorNeck, type IntervalSetDraft, type Neck } from '../editor';
  import { DEFAULT_SETTINGS, getSettings } from '../settings';
  import { getScale, listScales, newScaleId, type ScaleInput } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { getScaleEditor } from './scale-editor.svelte';
  import { displayRoot, rootChoices } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const scaleEditor = getScaleEditor();
  const roots = rootChoices();
  const families = $derived.by(() => {
    // Re-read the catalog when a user scale was saved or deleted (ADR-24).
    void catalogs.revision;
    return listScales();
  });
  const current = $derived.by(() => {
    void catalogs.revision;
    return getScale(settings.current.lastView.scale);
  });
  const isMine = $derived(current !== undefined && !current.builtIn);

  const editing = $derived(scaleEditor.editing);
  let confirmingDelete = $state(false);
  let editProblem = $state<string | null>(null);

  /** The neck the editor shows: the current instrument, on the current root. */
  const neck = $derived.by((): Neck => {
    void catalogs.revision;
    return editorNeck(settings.current);
  });
  /** The root the editor is shown on: the one it was opened with, else the explorer's. */
  const editorRoot = $derived(
    (editing?.mode === 'new' && editing.root ? displayRoot(editing.root) : undefined) ??
      displayRoot(settings.current.lastView.root) ??
      displayRoot(DEFAULT_SETTINGS.lastView.root)!,
  );
  const initial = $derived.by((): IntervalSetDraft => {
    if (editing?.mode !== 'edit') {
      return { name: '', family: '', intervals: editing?.intervals ?? ['1'] };
    }
    const { name, family, intervals } = editing.scale;
    return { name, family, intervals };
  });

  function startNew() {
    scaleEditor.newScale();
    confirmingDelete = false;
    editProblem = null;
  }

  function startEdit() {
    if (current && isMine) scaleEditor.editScale(current);
    confirmingDelete = false;
    editProblem = null;
  }

  function input(id: string, draft: IntervalSetDraft, aliases: string[] = []): ScaleInput {
    return {
      id,
      name: draft.name,
      aliases,
      family: draft.family === '' ? undefined : draft.family,
      intervals: draft.intervals,
    };
  }

  /**
   * Saves the editor's scale (checked by the core) and shows it: a new one opened on a root of
   * its own (reverse lookup's bass) on that root.
   */
  async function save(draft: IntervalSetDraft) {
    const now = editing;
    if (now?.mode === 'edit') {
      const old = now.scale;
      const scale = input(old.id, draft, old.aliases);
      await catalogs.saveUserScales(catalogs.userScales.map((s) => (s.id === old.id ? scale : s)));
    } else {
      const root = now?.root ? editorRoot : undefined;
      const scale = input(newScaleId(draft.name), draft);
      await catalogs.saveUserScales([...catalogs.userScales, scale]);
      const lastView = root ? { scale: scale.id, root } : { scale: scale.id };
      await settings.update({ lastView }).catch(reportEdit);
    }
    scaleEditor.close();
  }

  /** Deletes the current user scale; the view falls back to the built-in it replaced or the default. */
  async function deleteCurrent() {
    const gone = current;
    if (!gone || !isMine) return;
    try {
      await catalogs.saveUserScales(catalogs.userScales.filter((s) => s.id !== gone.id));
    } catch (error) {
      reportEdit(error);
      return;
    }
    confirmingDelete = false;
    editProblem = null;
    const next = getScale(gone.id)?.id ?? DEFAULT_SETTINGS.lastView.scale;
    if (next !== gone.id) await settings.update({ lastView: { scale: next } }).catch(reportEdit);
  }

  function reportEdit(error: unknown) {
    editProblem = error instanceof Error ? error.message : String(error);
  }

  /** Escape closes the editor without saving. */
  function onWindowKey(event: KeyboardEvent) {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      scaleEditor.close();
    }
  }

  let rootError = $state<string | null>(null);
  let query = $state('');

  const currentRoot = $derived(displayRoot(settings.current.lastView.root) ?? '');
  const currentScale = $derived(settings.current.lastView.scale);

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return families;
    const matches = (text: string) => text.toLowerCase().includes(q);
    return families
      .map((family) => ({
        ...family,
        scales: family.scales.filter(
          (s) => matches(s.name) || matches(s.id) || s.aliases.some(matches),
        ),
      }))
      .filter((family) => family.scales.length > 0);
  });
  const shownCount = $derived(shown.reduce((n, family) => n + family.scales.length, 0));

  function report(error: unknown) {
    rootError = error instanceof Error ? error.message : String(error);
  }

  function setRoot(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const root = displayRoot(input.value);
    if (root === undefined) {
      rootError = `“${input.value}” is not a note name. Try C, F♯, Bb or Db.`;
      return;
    }
    rootError = null;
    input.value = root;
    settings.update({ lastView: { root } }).catch(report);
  }

  function setScale(event: Event & { currentTarget: HTMLSelectElement }) {
    const scale = event.currentTarget.value;
    if (scale) settings.update({ lastView: { scale } }).catch(report);
  }
</script>

<div class="picker">
  <div class="field">
    <label for="root-input">Root</label>
    <input
      id="root-input"
      type="text"
      list="root-choices"
      autocomplete="off"
      spellcheck="false"
      value={currentRoot}
      aria-invalid={rootError ? 'true' : undefined}
      aria-describedby="root-help"
      onchange={setRoot}
    />
    <datalist id="root-choices">
      {#each roots as root (root)}
        <option value={root}></option>
      {/each}
    </datalist>
    {#if rootError}
      <p id="root-help" class="error" role="alert">{rootError}</p>
    {:else}
      <p id="root-help" class="hint">Pick or type a note; its spelling is kept.</p>
    {/if}
  </div>

  <div class="field">
    <label for="scale-search">Search scales</label>
    <input
      id="scale-search"
      type="search"
      autocomplete="off"
      placeholder="Name or alias"
      bind:value={query}
    />
  </div>

  <div class="field grow">
    <label for="scale-list">Scale</label>
    <select id="scale-list" size="14" value={currentScale} onchange={setScale}>
      {#each shown as family (family.name)}
        <optgroup label={family.name}>
          {#each family.scales as scale (scale.id)}
            <option value={scale.id}>{scale.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    {#if shownCount === 0}
      <p class="hint" role="status">No scale matches “{query}”.</p>
    {/if}
  </div>

  <div class="own">
    <div class="buttons">
      <button type="button" onclick={startNew}>New scale</button>
      {#if isMine}
        <button type="button" onclick={startEdit}>Edit scale</button>
        <button type="button" onclick={() => (confirmingDelete = true)}>Delete scale</button>
      {/if}
    </div>
    {#if confirmingDelete && isMine && current}
      <div class="confirm" role="group" aria-label="Delete {current.name}?">
        <p>Delete “{current.name}” from your scales?</p>
        <div class="buttons">
          <button type="button" class="danger" onclick={deleteCurrent}>Delete</button>
          <button type="button" onclick={() => (confirmingDelete = false)}>Keep</button>
        </div>
      </div>
    {/if}
    {#if editProblem}
      <p class="error" role="alert">{editProblem}</p>
    {/if}
  </div>
</div>

<svelte:window onkeydown={onWindowKey} />

{#if editing}
  <div class="backdrop">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={editing.mode === 'new' ? 'New scale' : 'Edit scale'}
    >
      <IntervalSetEditor
        title={editing.mode === 'new' ? 'New scale' : `Edit “${editing.scale.name}”`}
        noun="scale"
        {initial}
        families={families.map((family) => family.name)}
        defaultFamily="Custom"
        root={editorRoot}
        {neck}
        onsave={save}
        oncancel={() => scaleEditor.close()}
      />
    </div>
  </div>
{/if}

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label {
    font-weight: 600;
    font-size: 0.875rem;
  }

  input,
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
  }

  input[aria-invalid='true'] {
    border-color: var(--text-danger);
  }

  select {
    min-height: 16rem;
  }

  optgroup {
    color: var(--text-muted);
    font-style: normal;
  }

  option {
    color: var(--text);
  }

  .hint,
  .error {
    margin: 0;
    font-size: 0.8125rem;
  }

  .hint {
    color: var(--text-muted);
  }

  .error {
    color: var(--text-danger);
  }

  .own {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
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
    border-color: var(--accent);
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  button.danger {
    color: var(--text-danger);
    border-color: var(--text-danger);
  }

  .confirm p {
    margin: 0 0 0.375rem;
    font-size: 0.875rem;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
    overflow-y: auto;
    background: rgb(0 0 0 / 0.45);
  }

  .dialog {
    width: min(60rem, 100%);
    padding: 1rem;
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--text);
  }
</style>
