<!--
  @component
  The theme picker (SPEC §5.11, ADR-40): which theme, and whether it shows light, dark or
  follows the OS. Built-in themes come first, then the user's theme files. A theme with only
  one scheme (Print) shows that one, and the light/dark choice is kept but has no effect.
  Problems with the user's theme files are listed below. Both choices are settings, saved at
  once (ADR-17); `App` applies them.
-->
<script lang="ts">
  import { getSettings, type Theme as SchemeSetting } from '../settings';
  import { getThemes } from './library.svelte';
  import { schemesOf } from './theme';

  const settings = getSettings();
  const library = getThemes();

  const chosen = $derived(library.get(settings.current.themeId));
  const missing = $derived(!library.themes.some((t) => t.id === settings.current.themeId));
  const only = $derived.by(() => {
    const schemes = schemesOf(chosen);
    return schemes.length === 1 ? schemes[0] : null;
  });
  const groups = $derived(
    [
      { label: 'Built-in', themes: library.builtIn },
      { label: 'Your themes', themes: library.userThemes },
    ].filter((group) => group.themes.length > 0),
  );
  const problems = $derived(library.problems);

  const schemes: { value: SchemeSetting; text: string }[] = [
    { value: 'system', text: 'System' },
    { value: 'light', text: 'Light' },
    { value: 'dark', text: 'Dark' },
  ];

  function ignore() {
    // Always a valid setting; a failed save is shown by the store's warning.
  }
</script>

<div class="picker">
  <div class="field">
    <label for="theme-id">Theme</label>
    <select
      id="theme-id"
      value={chosen.id}
      onchange={(event) => settings.update({ themeId: event.currentTarget.value }).catch(ignore)}
    >
      {#each groups as group (group.label)}
        <optgroup label={group.label}>
          {#each group.themes as theme (theme.id)}
            <option value={theme.id}>{theme.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    {#if missing}
      <p class="hint">
        The theme “{settings.current.themeId}” was not found, so {chosen.name} is shown.
      </p>
    {/if}
  </div>

  <fieldset aria-describedby={only ? 'theme-only-scheme' : undefined}>
    <legend>Light or dark</legend>
    <div class="schemes">
      {#each schemes as scheme (scheme.value)}
        <label>
          <input
            type="radio"
            name="theme-scheme"
            value={scheme.value}
            checked={settings.current.theme === scheme.value}
            disabled={only !== null}
            onchange={() => settings.update({ theme: scheme.value }).catch(ignore)}
          />
          {scheme.text}
        </label>
      {/each}
    </div>
    {#if only}
      <p id="theme-only-scheme" class="hint">{chosen.name} is always {only}.</p>
    {/if}
  </fieldset>

  {#if problems.length > 0}
    <details class="problems">
      <summary>
        {problems.length === 1 ? 'One problem' : `${problems.length} problems`} with your theme files
      </summary>
      <ul>
        {#each problems as problem (problem)}
          <li>{problem}</li>
        {/each}
      </ul>
    </details>
  {/if}
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
    min-width: 0;
  }

  .field > label,
  legend {
    font-weight: 600;
    font-size: 0.875rem;
  }

  select {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
    min-width: 0;
  }

  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  optgroup {
    color: var(--text-muted);
    font-style: normal;
  }

  option {
    color: var(--text);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
  }

  .schemes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }

  .schemes label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
  }

  .hint {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .problems {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .problems summary {
    cursor: pointer;
  }

  .problems ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
    overflow-wrap: anywhere;
  }
</style>
