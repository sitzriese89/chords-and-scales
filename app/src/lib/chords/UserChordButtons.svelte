<!--
  @component
  The user's own chords in the root-and-quality picker (ADR-36): **New chord** opens the chord
  editor, and when the chosen quality is a user chord, **Edit chord** and **Delete chord** (with
  a confirmation). Deleting the chosen chord chooses the built-in it replaced, or no chord.
-->
<script lang="ts">
  import { getChord } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { getChordState } from './state.svelte';

  const catalogs = getUserCatalogs();
  const chordState = getChordState();

  const current = $derived.by(() => {
    void catalogs.revision;
    return chordState.chordId ? getChord(chordState.chordId) : undefined;
  });
  const mine = $derived(current !== undefined && !current.builtIn ? current : undefined);

  let confirmingDelete = $state(false);
  let problem = $state<string | null>(null);

  function startNew() {
    confirmingDelete = false;
    problem = null;
    chordState.newChord();
  }

  function startEdit() {
    confirmingDelete = false;
    problem = null;
    if (mine) chordState.editChord(mine);
  }

  async function deleteCurrent() {
    const gone = mine;
    if (!gone) return;
    try {
      await catalogs.saveUserChords(catalogs.userChords.filter((c) => c.id !== gone.id));
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
      return;
    }
    confirmingDelete = false;
    problem = null;
    chordState.chordId = getChord(gone.id)?.id ?? '';
  }
</script>

<div class="own">
  <div class="buttons">
    <button type="button" onclick={startNew}>New chord</button>
    {#if mine}
      <button type="button" onclick={startEdit}>Edit chord</button>
      <button type="button" onclick={() => (confirmingDelete = true)}>Delete chord</button>
    {/if}
  </div>
  {#if confirmingDelete && mine}
    <div class="confirm" role="group" aria-label="Delete {mine.name}?">
      <p>Delete “{mine.name}” from your chords?</p>
      <div class="buttons">
        <button type="button" class="danger" onclick={deleteCurrent}>Delete</button>
        <button type="button" onclick={() => (confirmingDelete = false)}>Keep</button>
      </div>
    </div>
  {/if}
  {#if problem}
    <p class="error" role="alert">{problem}</p>
  {/if}
</div>

<style>
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

  .confirm p,
  .error {
    margin: 0 0 0.375rem;
    font-size: 0.875rem;
  }

  .error {
    color: var(--text-danger);
  }
</style>
