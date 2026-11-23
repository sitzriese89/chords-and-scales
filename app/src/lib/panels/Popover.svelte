<!--
  @component
  A button that opens a panel under it (ADR-53): the toolbar's instrument button. The button
  shows `button` and has `aria-expanded` and `aria-controls`; the panel is a non-modal dialog
  named `label`, right-aligned under the button and never wider than the window.

  It closes like the drawer: a second click on the button, Escape, or a click outside. Opening
  moves focus to the first control in the panel; closing moves it back to the button (after a
  click outside, only if focus would otherwise be lost). Whether it is open is its own state,
  not saved. Closed, the panel is `hidden` but stays mounted, so a half-edited form in it is
  still there when it opens again.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { firstFocusable, lightDismiss, restoreFocus, type CloseReason } from './dismiss';

  const {
    id,
    label,
    button,
    buttonLabel,
    children,
  }: {
    /** Unique in the page; the panel's id. */
    id: string;
    /** The panel's accessible name. */
    label: string;
    /** What the button shows; also its accessible name unless `buttonLabel` is given. */
    button: Snippet;
    /** The button's accessible name, when what it shows needs more words. */
    buttonLabel?: string;
    children: Snippet;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let panel = $state<HTMLElement>();

  function close(reason: CloseReason) {
    open = false;
    if (panel) restoreFocus(reason, panel, trigger);
  }

  $effect(() => {
    if (!open || !panel) return;
    (firstFocusable(panel) ?? panel).focus();
    return lightDismiss(panel, trigger, close);
  });
</script>

<div class="popover">
  <button
    bind:this={trigger}
    type="button"
    class="trigger"
    aria-expanded={open}
    aria-controls={id}
    aria-label={buttonLabel}
    onclick={() => (open ? close('button') : (open = true))}
  >
    {@render button()}
    <span class="caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
  </button>
  <div
    bind:this={panel}
    {id}
    class="panel"
    role="dialog"
    aria-label={label}
    tabindex="-1"
    hidden={!open}
  >
    {@render children()}
  </div>
</div>

<style>
  .popover {
    position: relative;
    min-width: 0;
  }

  /* The shared button style; the summary may wrap on a narrow window. */
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    padding-block: 0.25rem;
    text-align: start;
  }

  .trigger[aria-expanded='true'] {
    border-color: var(--accent);
  }

  .panel {
    position: absolute;
    z-index: 6;
    top: calc(100% + 0.25rem);
    right: 0;
    box-sizing: border-box;
    width: min(22rem, calc(100vw - 2rem));
    max-height: 75dvh;
    overflow: auto;
    padding: 0.75rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
  }

  .panel[hidden] {
    display: none;
  }

  .panel:focus {
    outline: none;
  }
</style>
