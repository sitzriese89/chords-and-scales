<!--
  @component
  An editable combobox for a root (ADR-46): a text field that takes a typed name, and a
  button (or Alt+↓ / ↓ in the field) that opens a list of every name in `choices`, never
  filtered by what is typed. Choosing a name or committing typed text (Enter, leaving the
  field) calls `oncommit` with the text; it returns the name to show, or `undefined` for text
  that isn't a note, which stays in the field. The component does no note parsing.

  Keyboard (WAI-ARIA combobox pattern, list without autocomplete): ↓ / Alt+↓ open the list on
  the current name, ↑ / ↓ / Home / End move, Enter chooses, Escape closes, typing closes the
  list and edits the text.
-->
<script lang="ts">
  const {
    id,
    value,
    choices,
    invalid = false,
    describedby,
    oncommit,
  }: {
    /** The field's id, for its `<label for>`. */
    id: string;
    /** The name shown when nothing is being typed. */
    value: string;
    /** Every name the list offers, in order. */
    choices: readonly string[];
    invalid?: boolean;
    describedby?: string;
    oncommit: (text: string) => string | undefined;
  } = $props();

  const listId = $derived(`${id}-list`);
  const optionId = (index: number) => `${id}-option-${index}`;

  let field = $state<HTMLInputElement>();
  let open = $state(false);
  /** The highlighted option while the list is open, -1 for none. */
  let active = $state(-1);

  function show() {
    const at = choices.indexOf(field?.value ?? value);
    active = at >= 0 ? at : Math.max(0, choices.indexOf(value));
    open = true;
  }

  function hide() {
    open = false;
    active = -1;
  }

  function commit(text: string) {
    const shown = oncommit(text);
    if (shown !== undefined && field) field.value = shown;
  }

  function choose(index: number) {
    const name = choices[index];
    hide();
    if (name === undefined || !field) return;
    field.value = name;
    commit(name);
    field.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    const last = choices.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      if (!open) show();
      else active = Math.min(last, Math.max(0, to));
    };
    switch (event.key) {
      case 'ArrowDown':
        if (event.altKey && !open) {
          event.preventDefault();
          show();
        } else move(active + 1);
        return;
      case 'ArrowUp':
        if (event.altKey && open) {
          event.preventDefault();
          hide();
        } else move(active - 1);
        return;
      case 'Home':
      case 'End':
        if (!open) return;
        move(event.key === 'Home' ? 0 : last);
        return;
      case 'Enter':
        if (open && active >= 0) {
          event.preventDefault();
          choose(active);
        } else if (field) {
          event.preventDefault();
          commit(field.value);
        }
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          hide();
        }
        return;
    }
  }

  function onchange(event: Event & { currentTarget: HTMLInputElement }) {
    commit(event.currentTarget.value);
  }

  function toggle() {
    if (open) hide();
    else show();
    field?.focus();
  }

  /** The list stays open while focus moves between the field, the button and the list. */
  function onfocusout(event: FocusEvent & { currentTarget: HTMLElement }) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) hide();
  }

  $effect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<div class="combo" {onfocusout}>
  <div class="row">
    <input
      bind:this={field}
      {id}
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="none"
      aria-expanded={open ? 'true' : 'false'}
      aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedby}
      {value}
      {onkeydown}
      oninput={hide}
      {onchange}
    />
    <button
      type="button"
      class="toggle"
      tabindex="-1"
      aria-label="Show all roots"
      aria-controls={listId}
      aria-expanded={open ? 'true' : 'false'}
      onclick={toggle}>▾</button
    >
  </div>
  <ul id={listId} role="listbox" aria-label="Roots" hidden={!open}>
    {#each choices as name, index (name)}
      <!-- The keyboard reaches the options through the field (aria-activedescendant). -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={optionId(index)}
        role="option"
        aria-selected={index === active ? 'true' : 'false'}
        class:current={name === value}
        onmousedown={(event) => event.preventDefault()}
        onclick={() => choose(index)}
        onmousemove={() => (active = index)}
      >
        {name}
      </li>
    {/each}
  </ul>
</div>

<style>
  .combo {
    position: relative;
  }

  .row {
    display: flex;
  }

  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-right: none;
    border-radius: 0.375rem 0 0 0.375rem;
    padding: 0.375rem 0.5rem;
  }

  input[aria-invalid='true'] {
    border-color: var(--text-danger);
  }

  .toggle {
    font: inherit;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0 0.375rem 0.375rem 0;
    padding: 0 0.625rem;
    cursor: pointer;
  }

  .toggle:hover {
    border-color: var(--accent);
  }

  ul {
    position: absolute;
    z-index: 5;
    top: calc(100% + 0.125rem);
    left: 0;
    right: 0;
    max-height: 16rem;
    overflow-y: auto;
    margin: 0;
    padding: 0.25rem 0;
    list-style: none;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 0.2);
  }

  ul[hidden] {
    display: none;
  }

  li {
    padding: 0.25rem 0.625rem;
    cursor: pointer;
  }

  li.current {
    font-weight: 600;
  }

  li[aria-selected='true'] {
    background: var(--accent);
    color: var(--accent-text);
  }
</style>
