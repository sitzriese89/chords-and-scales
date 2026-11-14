<!--
  @component
  Root and scale picker of the scale explorer. Writes the choice to the settings' last view,
  which saves it (ADR-17). The root can be picked from the list or typed (`Db`, `f#`, `E♭`);
  it is checked by the core and keeps its spelling (ADR-6). Scales are grouped by family and
  can be searched by name, alias or id.
-->
<script lang="ts">
  import { getSettings } from '../settings';
  import { listScales } from '../theory';
  import { getUserCatalogs } from '../user-catalogs.svelte';
  import { displayRoot, rootChoices } from './view';

  const settings = getSettings();
  const catalogs = getUserCatalogs();
  const roots = rootChoices();
  const families = $derived.by(() => {
    // Re-read the catalog when a user scale was saved or deleted (ADR-24).
    void catalogs.revision;
    return listScales();
  });

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
</style>
