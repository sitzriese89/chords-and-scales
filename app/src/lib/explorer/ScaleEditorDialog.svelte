<!--
  @component
  The scale editor in a modal dialog (ADR-26), open while `ScaleEditorState.editing` says so:
  from the picker's **New scale** / **Edit scale**, or from reverse lookup's **Save as scale**
  with the selected notes (ADR-38). It has its own neck and saves to `scales.toml` through
  `UserCatalogs`; a new scale is then shown in the explorer. Escape or Cancel closes it.

  The app mounts it once, outside the pages and the picker drawer, so it opens wherever it is
  asked for, also while the drawer is closed (ADR-53).
-->
<script lang="ts">
  import { IntervalSetEditor, editorNeck, type IntervalSetDraft, type Neck } from '../editor';
  import { DEFAULT_SETTINGS, getSettings } from '../settings';
  import { listScales, newScaleId, type ScaleInput } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { getScaleEditor } from './scale-editor.svelte';
  import { displayRoot } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const scaleEditor = getScaleEditor();

  const editing = $derived(scaleEditor.editing);
  const families = $derived.by(() => {
    // Re-read the catalog when a user scale was saved or deleted (ADR-24).
    void catalogs.revision;
    return listScales().map((family) => family.name);
  });
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
      // The scale is saved either way; a failed settings save is shown by the store's warning.
      await settings.update({ lastView }).catch(() => {});
    }
    scaleEditor.close();
  }

  /** Escape closes the editor without saving. */
  function onWindowKey(event: KeyboardEvent) {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      scaleEditor.close();
    }
  }
</script>

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
        {families}
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
