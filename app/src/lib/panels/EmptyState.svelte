<!--
  @component
  What a page shows while it has nothing to show (ADR-56): a centred dashed card with a bold
  title, one muted sentence (the children) and one primary action. The Chords page uses it with
  no chord chosen (**☰ Choose chord**), the Sheet page while the sheet is empty (**Go to
  Scales**).

  `icon` is drawn before the action's label and hidden from assistive technology, so the
  button's name is the label alone.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  const {
    title,
    action,
    icon,
    onaction,
    children,
  }: {
    title: string;
    /** The action button's label, and its accessible name. */
    action: string;
    /** A symbol before the label, not read out. */
    icon?: string;
    onaction: () => void;
    /** The sentence under the title. */
    children: Snippet;
  } = $props();
</script>

<div class="empty-state">
  <p class="title">{title}</p>
  <p class="text">{@render children()}</p>
  <button type="button" class="primary" onclick={onaction}
    >{#if icon}<span class="icon" aria-hidden="true">{icon}</span>{/if}{action}</button
  >
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    width: 100%;
    max-width: 30rem;
    margin: 3rem auto;
    padding: 2rem 2.5rem;
    text-align: center;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px dashed var(--border-strong);
    border-radius: calc(var(--radius) * 2);
  }

  .title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
  }

  .text {
    margin: 0 0 0.5rem;
    color: var(--text-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  /* The space between the icon and the label, kept out of the markup's whitespace. */
  .icon {
    margin-right: 0.375em;
  }

  @media (max-width: 40rem) {
    .empty-state {
      margin: 1.5rem auto;
      padding: 1.5rem 1rem;
    }
  }
</style>
