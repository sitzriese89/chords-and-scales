<!--
  @component
  The form for a custom chord (ADR-36): the interval-set editor (ADR-26) on two octaves, with
  the labels the core offers for chords (`♯5`, `♭9`, `♯11`, `13`), plus the chord's symbol (the
  suffix after the root) and an optional Jazz symbol. It checks nothing itself: `onsave` gets
  what was entered, trimmed, and a rejection's message (the core's) is shown in the form.
-->
<script lang="ts">
  import { IntervalSetEditor, type IntervalSetDraft, type Neck } from '../editor';
  import { chordIntervalLabels } from '../theory';
  import type { ChordDraft } from './user-chords';

  interface Props {
    /** The form's heading: "New chord", "Edit “Mine”". */
    title: string;
    initial: ChordDraft;
    /** Families to suggest; the field takes any name. */
    families: readonly string[];
    /** The root the neck is shown on, as displayed: `D♭`. */
    root: string;
    neck: Neck;
    /** Saves the chord; a rejection's message is shown in the form. */
    onsave: (draft: ChordDraft) => Promise<void>;
    oncancel: () => void;
  }

  const { title, initial, families, root, neck, onsave, oncancel }: Props = $props();

  const id = $props.id();
  const labels = chordIntervalLabels();
  // The form edits its own copy; `initial` only seeds it.
  // svelte-ignore state_referenced_locally
  let symbol = $state(initial.symbol);
  // svelte-ignore state_referenced_locally
  let jazzSymbol = $state(initial.jazzSymbol);

  function save(draft: IntervalSetDraft): Promise<void> {
    return onsave({ ...draft, symbol: symbol.trim(), jazzSymbol: jazzSymbol.trim() });
  }
</script>

<IntervalSetEditor
  {title}
  noun="chord"
  {initial}
  {families}
  defaultFamily="Custom"
  {root}
  {neck}
  {labels}
  onsave={save}
  {oncancel}
>
  {#snippet extra()}
    <div class="field">
      <label for="{id}-symbol">Symbol</label>
      <input
        id="{id}-symbol"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        maxlength="32"
        placeholder="m7b5"
        aria-describedby="{id}-symbol-help"
        bind:value={symbol}
      />
      <p id="{id}-symbol-help" class="hint">
        What follows the root, with b and # for flats and sharps: m7b5 for {root}m7♭5.
      </p>
    </div>
    <div class="field">
      <label for="{id}-jazz">Jazz symbol</label>
      <input
        id="{id}-jazz"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        maxlength="32"
        placeholder={symbol.trim() || 'ø'}
        aria-describedby="{id}-jazz-help"
        bind:value={jazzSymbol}
      />
      <p id="{id}-jazz-help" class="hint">Optional: how the Jazz style writes it, such as ø.</p>
    </div>
  {/snippet}
</IntervalSetEditor>

<style>
  .field {
    display: flex;
    flex: 1 1 12rem;
    flex-direction: column;
    gap: 0.25rem;
  }

  label {
    font-weight: 600;
    font-size: 0.875rem;
  }

  input {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.375rem 0.5rem;
    min-width: 0;
  }

  input:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
  }
</style>
