<!--
  @component
  A drawer that slides in from the left over the page (ADR-51, ADR-53): the scale picker on
  the Scales page, the chord picker on the Chords page. It holds no state: the parent passes
  `open` and sets it to false in `onclose`, and owns the button that opens it (`opener`), which
  should have `aria-expanded` and `aria-controls={id}`.

  It closes with its ✕ button, Escape, or a click outside it (not on `opener`, which toggles
  it). Opening moves focus to the first control in it; closing moves focus back to `opener`
  (after a click outside, only if focus would otherwise be lost). It is a non-modal dialog
  named by its title.

  Closed, it is `hidden` but stays mounted, so a typed search or a scrolled list is still there
  the next time it opens. Where it sits is the parent's: it is positioned against the nearest
  positioned ancestor, at its left edge and `--drawer-top` (0) from its top. It is at most as
  tall as the window below its top edge, and scrolls inside. On a window narrower than 40rem
  it is as wide as that ancestor.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { firstFocusable, lightDismiss, restoreFocus, type CloseReason } from './dismiss';

  const {
    id,
    title,
    open,
    onclose,
    opener,
    children,
  }: {
    /** Unique in the page; the title's id is `<id>-title`. */
    id: string;
    /** Shown at the top, and the drawer's accessible name. */
    title: string;
    open: boolean;
    onclose: () => void;
    /** The button that opens the drawer; focus returns to it. */
    opener?: HTMLElement;
    children: Snippet;
  } = $props();

  let panel = $state<HTMLElement>();
  let body = $state<HTMLElement>();
  let closeButton = $state<HTMLButtonElement>();

  function close(reason: CloseReason) {
    onclose();
    if (panel) restoreFocus(reason, panel, opener);
  }

  /** Space left under the drawer, in pixels. */
  const MARGIN = 8;
  /** How tall it may be: down to the window's bottom edge, measured while it is open. */
  let maxHeight = $state<number>();
  function fit() {
    if (!panel) return;
    const top = panel.getBoundingClientRect().top;
    maxHeight = window.innerHeight > top ? window.innerHeight - top - MARGIN : undefined;
  }

  $effect(() => {
    if (!open || !panel || !body) return;
    fit();
    (firstFocusable(body) ?? closeButton)?.focus();
    const stop = lightDismiss(panel, opener, close);
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, { passive: true });
    return () => {
      stop();
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit);
    };
  });
</script>

<div
  bind:this={panel}
  {id}
  class="drawer"
  role="dialog"
  aria-labelledby="{id}-title"
  hidden={!open}
  style:max-height={maxHeight === undefined ? undefined : `${maxHeight}px`}
>
  <div class="head">
    <h2 id="{id}-title">{title}</h2>
    <button
      bind:this={closeButton}
      type="button"
      class="close"
      aria-label="Close {title}"
      onclick={() => close('button')}><span aria-hidden="true">✕</span></button
    >
  </div>
  <div bind:this={body} class="body">
    {@render children()}
  </div>
</div>

<style>
  .drawer {
    position: absolute;
    z-index: 5;
    top: var(--drawer-top, 0);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-sizing: border-box;
    width: min(22rem, 100%);
    max-height: 100dvh;
    overflow: auto;
    padding: 0.75rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0 var(--radius) var(--radius) 0;
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
    translate: 0 0;
    transition:
      translate 0.15s ease-out,
      display 0.15s allow-discrete;
  }

  .drawer[hidden] {
    display: none;
    translate: -100% 0;
  }

  /* Slides in from the left edge as it is shown. */
  @starting-style {
    .drawer {
      translate: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drawer {
      transition: none;
    }
  }

  @media (max-width: 40rem) {
    .drawer {
      width: 100%;
      border-radius: 0 0 var(--radius) var(--radius);
    }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  /* An icon button: square, the shared style otherwise. */
  .close {
    min-width: var(--control-h);
    padding: 0 0.5rem;
  }
</style>
