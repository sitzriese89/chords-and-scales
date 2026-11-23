<script lang="ts">
  // PROTOTYPE (branch prototype/style-pass): floating variant switcher, dev builds only.
  // ← / → cycle the variants; the choice is in the URL, so a reload keeps it.
  import { currentVariant, VARIANTS } from './variant';

  const index = VARIANTS.findIndex((v) => v.key === currentVariant());
  const current = VARIANTS[index];

  function go(step: number) {
    const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
    const url = new URL(location.href);
    url.searchParams.set('variant', next.key);
    // The variant changes geometry constants read at module load, so reload.
    location.replace(url);
  }

  function onkeydown(event: KeyboardEvent) {
    const t = event.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'ArrowLeft') go(-1);
    if (event.key === 'ArrowRight') go(1);
  }
</script>

<svelte:window {onkeydown} />

{#if import.meta.env.DEV}
  <div class="proto-switcher" role="group" aria-label="Prototype variant">
    <button type="button" aria-label="Previous variant" onclick={() => go(-1)}>←</button>
    <span>{current.key} ({current.name})</span>
    <button type="button" aria-label="Next variant" onclick={() => go(1)}>→</button>
  </div>
{/if}

<style>
  .proto-switcher {
    position: fixed;
    z-index: 100;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.5rem;
    border-radius: 999px;
    background: #ff00aa;
    color: #fff;
    font: 600 0.875rem/1 system-ui, sans-serif;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
  }

  button {
    all: unset;
    cursor: pointer;
    width: 1.75rem;
    height: 1.75rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.2);
  }

  button:hover {
    background: rgb(255 255 255 / 0.35);
  }
</style>
