<!--
  @component
  A panel that collapses to a bar with its title and a button (ADR-50). It knows nothing about
  where it sits or where its state is kept: the parent passes `collapsed` and flips it in
  `ontoggle`, and gives the region around it its width.

  The button is a real `<button>` with `aria-expanded` and `aria-controls` (the body); its
  name says what it does and to what ("Collapse Scale picker"). A collapsed body is `hidden`
  but stays mounted, so what was typed or scrolled in it is still there on expanding.

  Collapsed, the bar is a vertical strip by default, for a panel at the side of the window.
  A parent that stacks its panels (a narrow window) makes it a horizontal title bar by setting
  `--collapsible-panel-writing-mode: horizontal-tb`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    id,
    title,
    collapsed,
    ontoggle,
    children,
  }: {
    /** Unique in the page; the body's id is `<id>-body`. */
    id: string;
    /** Shown in the bar, and part of the button's name. */
    title: string;
    collapsed: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();

  const bodyId = $derived(`${id}-body`);
</script>

<div class="collapsible-panel" class:collapsed>
  <div class="bar">
    <span class="title">{title}</span>
    <button
      type="button"
      class="toggle"
      aria-expanded={!collapsed}
      aria-controls={bodyId}
      aria-label="{collapsed ? 'Expand' : 'Collapse'} {title}"
      onclick={ontoggle}
    >
      {collapsed ? 'Expand' : 'Collapse'}
    </button>
  </div>
  <div id={bodyId} class="body" hidden={collapsed}>
    {@render children()}
  </div>
</div>

<style>
  .collapsible-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .bar {
    display: flex;
    align-items: baseline;
    gap: 0.5rem 0.75rem;
  }

  .collapsed .bar {
    writing-mode: var(--collapsible-panel-writing-mode, vertical-rl);
    align-items: center;
  }

  .title {
    font-weight: 600;
  }

  .toggle {
    margin-inline-start: auto;
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    /* Logical, so the vertical strip's button is padded along its text too. */
    padding-block: 0.25rem;
    padding-inline: 0.75rem;
    cursor: pointer;
  }

  .toggle:hover {
    background: var(--surface-sunken);
  }

  .toggle:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .body[hidden] {
    display: none;
  }
</style>
