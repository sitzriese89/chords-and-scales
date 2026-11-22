<!--
  @component
  Root and scale picker of the scale explorer. Writes the choice to the settings' last view,
  which saves it (ADR-17). The root can be picked from a list of all 17 names or typed (`Db`, `f#`, `E♭`, ADR-46);
  it is checked by the core and keeps its spelling (ADR-6). Scales are grouped by family and
  can be searched by name, alias or id, and filtered by mood tag with the chips (ADR-41); each
  shows its tags. A current scale the filter hides stays the current scale.

  The user's own scales are made, edited and deleted here (ADR-26): **New scale** and **Edit
  scale** open the editor through `ScaleEditorState`, and `ScaleEditorDialog` shows it. That
  dialog sits outside the picker, so reverse lookup can open it with the selected notes while
  the picker's drawer is closed (ADR-38, ADR-53).

  **Random scale** picks a root and a scale from what the list shows (the chips and the search,
  never a kept hidden scale), as if the user had picked them (SPEC §5.8, ADR-42). `random` is
  the number source; tests pass a seeded one.
-->
<script lang="ts">
  import { DEFAULT_SETTINGS, getSettings } from '../settings';
  import { getTagFilters, HIDDEN_BY_TAGS, TagChips, tagList, withTags } from '../tags';
  import { getScale, type ScaleInfo } from '../theory';
  import { randomPick, rootPitchClass, spellRoot, type Random } from '../random';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { getScaleEditor } from './scale-editor.svelte';
  import RootCombobox from './RootCombobox.svelte';
  import { displayRoot, rootChoices } from './view';

  const { random = Math.random }: { random?: Random } = $props();

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const tagFilter = getTagFilters().scales;
  const scaleEditor = getScaleEditor();
  const roots = rootChoices();
  const current = $derived.by(() => {
    void catalogs.revision;
    return getScale(settings.current.lastView.scale);
  });
  const isMine = $derived(current !== undefined && !current.builtIn);

  let confirmingDelete = $state(false);
  let editProblem = $state<string | null>(null);

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

  let rootError = $state<string | null>(null);
  let query = $state('');

  const currentRoot = $derived(displayRoot(settings.current.lastView.root) ?? '');
  const currentScale = $derived(settings.current.lastView.scale);

  /** Whether the search matches a scale by name, id or alias (everything while it is empty). */
  const searchMatches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const matches = (text: string) => text.toLowerCase().includes(q);
    return (s: ScaleInfo) => !q || matches(s.name) || matches(s.id) || s.aliases.some(matches);
  });
  /** The scales the tag chips let through, then those the search matches. */
  const shown = $derived(
    tagFilter.families
      .map((family) => ({
        ...family,
        items: family.items.filter(({ item }) => searchMatches(item)),
      }))
      .filter((family) => family.items.length > 0),
  );
  const shownCount = $derived(shown.reduce((n, family) => n + family.items.length, 0));
  const activeTags = $derived(tagFilter.active);
  const currentTags = $derived(current ? tagFilter.tagsOf(current.id) : []);
  /** The current scale stays chosen when the chips hide it; the list says so. */
  const hiddenByTags = $derived(
    current !== undefined && activeTags.length > 0 && !tagFilter.matches(current.id),
  );
  /**
   * What the list shows: `shown`, plus the current scale in its family when only the chips
   * hide it, so the list keeps it selected (ADR-41).
   */
  const listed = $derived(
    current && hiddenByTags && searchMatches(current)
      ? tagFilter.keeping(shown, current.id)
      : shown,
  );
  const emptyMessage = $derived.by(() => {
    const tags = tagList(activeTags);
    if (activeTags.length === 0) return `No scale matches “${query}”.`;
    const tagged = activeTags.length === 1 ? `the tag ${tags}` : `all of the tags ${tags}`;
    return query.trim() ? `No scale with ${tagged} matches “${query}”.` : `No scale has ${tagged}.`;
  });

  /** What Random scale draws from: the scales the list shows, without a kept hidden one. */
  const randomSet = $derived(shown.flatMap((family) => family.items.map(({ item }) => item)));

  /**
   * A random root, spelled by the sharp/flat preference, and scale from `randomSet`, saved like a
   * pick from the lists; never the root and scale shown now while there is another pair.
   */
  function pickRandom() {
    const { lastView, accidentals } = settings.current;
    const current = { id: lastView.scale, pitchClass: rootPitchClass(lastView.root) };
    const picked = randomPick(randomSet, current, random);
    if (!picked) return;
    rootError = null;
    const root = spellRoot(picked.pitchClass, accidentals);
    settings.update({ lastView: { root, scale: picked.item.id } }).catch(report);
  }

  function report(error: unknown) {
    rootError = error instanceof Error ? error.message : String(error);
  }

  /** Checks a picked or typed root through the core and saves it; returns it as shown. */
  function setRoot(text: string): string | undefined {
    const root = displayRoot(text);
    if (root === undefined) {
      rootError = `“${text}” is not a note name. Try C, F♯, Bb or Db.`;
      return undefined;
    }
    rootError = null;
    settings.update({ lastView: { root } }).catch(report);
    return root;
  }

  function setScale(event: Event & { currentTarget: HTMLSelectElement }) {
    const scale = event.currentTarget.value;
    if (scale) settings.update({ lastView: { scale } }).catch(report);
  }
</script>

<div class="picker">
  <div class="field">
    <label for="root-input">Root</label>
    <RootCombobox
      id="root-input"
      value={currentRoot}
      choices={roots}
      invalid={rootError !== null}
      describedby="root-help"
      oncommit={setRoot}
    />
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

  <div class="field">
    <span class="label">Filter by tag</span>
    <TagChips filter={tagFilter} label="Filter scales by tag" />
  </div>

  <div class="buttons">
    <button
      type="button"
      disabled={randomSet.length === 0}
      aria-describedby={randomSet.length === 0 ? 'scale-empty' : undefined}
      onclick={pickRandom}>Random scale</button
    >
  </div>

  <div class="field grow">
    <label for="scale-list">Scale</label>
    <select
      id="scale-list"
      size="14"
      value={currentScale}
      aria-describedby={hiddenByTags ? 'scale-hidden' : undefined}
      onchange={setScale}
    >
      {#each listed as family (family.name)}
        <optgroup label={family.name}>
          {#each family.items as { item: scale, tags } (scale.id)}
            {@const kept = hiddenByTags && scale.id === current?.id}
            <option value={scale.id} data-name={scale.name} data-hidden={kept ? '' : undefined}
              >{withTags(scale.name, tags)}{kept ? ` ${HIDDEN_BY_TAGS}` : ''}</option
            >
          {/each}
        </optgroup>
      {/each}
    </select>
    {#if shownCount === 0}
      <p id="scale-empty" class="hint" role="status">{emptyMessage}</p>
    {/if}
    {#if hiddenByTags && current}
      <p id="scale-hidden" class="hint">
        {current.name} stays selected, but it doesn’t have every tag you picked.
      </p>
    {:else if current}
      <p class="hint current-tags">
        Tags of {current.name}: {currentTags.length > 0 ? currentTags.join(', ') : 'none'}
      </p>
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

  label,
  .label {
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

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  button:hover:not(:disabled) {
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
</style>
