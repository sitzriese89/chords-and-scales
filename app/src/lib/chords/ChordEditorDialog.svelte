<!--
  @component
  The chord editor in a modal dialog (ADR-36), open while `ChordState.editing` says so: from
  **New chord** / **Edit chord** in the panel, or from anywhere that calls
  `chordState.newChord(intervals, root)`. Saves to `chords.toml` through `UserCatalogs`; a new
  chord is then chosen as root and quality. Escape or Cancel closes it.
-->
<script lang="ts">
  import { editorNeck, type Neck } from '../editor';
  import { displayRoot } from '../explorer/view';
  import { getSettings } from '../settings';
  import { listChords, newChordId } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import ChordEditor from './ChordEditor.svelte';
  import { getChordState } from './state.svelte';
  import { chordInput, draftOf, newDraft, type ChordDraft } from './user-chords';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const chordState = getChordState();

  const editing = $derived(chordState.editing);
  const families = $derived.by(() => {
    void catalogs.revision;
    return listChords().map((family) => family.name);
  });
  const neck = $derived.by((): Neck => {
    void catalogs.revision;
    return editorNeck(settings.current);
  });
  const root = $derived(
    displayRoot((editing?.mode === 'new' ? editing.root : undefined) ?? chordState.root) ?? 'C',
  );
  const initial = $derived(
    editing?.mode === 'edit' ? draftOf(editing.chord) : newDraft(editing?.intervals),
  );

  /** Saves the editor's chord (checked by the core); a new one becomes the chosen chord. */
  async function save(draft: ChordDraft) {
    const now = editing;
    if (now?.mode === 'edit') {
      const old = now.chord;
      const chord = chordInput(old.id, draft, old.aliases);
      await catalogs.saveUserChords(catalogs.userChords.map((c) => (c.id === old.id ? chord : c)));
    } else {
      const chord = chordInput(newChordId(draft.name), draft);
      await catalogs.saveUserChords([...catalogs.userChords, chord]);
      chordState.mode = 'root';
      chordState.root = root;
      chordState.chordId = chord.id;
    }
    chordState.closeEditor();
  }

  /** Escape closes the editor without saving. */
  function onWindowKey(event: KeyboardEvent) {
    if (chordState.editing && event.key === 'Escape') {
      event.preventDefault();
      chordState.closeEditor();
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
      aria-label={editing.mode === 'new' ? 'New chord' : 'Edit chord'}
    >
      {#key editing}
        <ChordEditor
          title={editing.mode === 'new' ? 'New chord' : `Edit “${editing.chord.name}”`}
          {initial}
          {families}
          {root}
          {neck}
          onsave={save}
          oncancel={() => chordState.closeEditor()}
        />
      {/key}
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
