<script lang="ts">
  import { SettingsStore, setSettings } from './lib/settings';
  import { createStorage, type Storage } from './lib/storage';
  import { version } from './lib/theory';

  // Tests pass their own storage; the app picks Tauri files or localStorage (ADR-4).
  const { storage = createStorage() }: { storage?: Storage } = $props();

  const coreVersion = version();

  // Settings load once at start and save on every change (ADR-15). The storage is fixed for
  // the app's lifetime, so taking the prop's initial value is intended.
  // svelte-ignore state_referenced_locally
  const settings = new SettingsStore(storage);
  setSettings(settings);
  settings.load();
</script>

{#if settings.warning}
  <div class="settings-warning" role="status">
    <p>{settings.warning}</p>
    <button type="button" onclick={() => settings.dismissWarning()}>Dismiss</button>
  </div>
{/if}

<main>
  <h1>Chords &amp; Scales</h1>
  <p>Theory core v{coreVersion}</p>
</main>

<style>
  .settings-warning {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    margin: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgb(200 140 0 / 60%);
    border-radius: 0.375rem;
    background: rgb(255 190 0 / 12%);
    font-size: 0.875rem;
  }

  .settings-warning p {
    margin: 0;
  }
</style>
