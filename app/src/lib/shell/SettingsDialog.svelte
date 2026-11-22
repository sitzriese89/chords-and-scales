<!--
  @component
  The toolbar's ⚙ Settings button and the modal `<dialog>` it opens (ADR-51, ADR-53), with
  **Sound** (`AudioControls`) and **Appearance** (`ThemePicker`). Every change in it is a
  setting and is saved at once, so it has no OK or Cancel: it closes with ✕, Escape, or a click
  on the backdrop, and focus goes back to the button.
-->
<script lang="ts">
  import { AudioControls } from '../audio';
  import { ThemePicker } from '../themes';

  let dialog = $state<HTMLDialogElement>();
  let opener = $state<HTMLButtonElement>();

  function show() {
    if (dialog && !dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog?.open) dialog.close();
  }

  /** Whatever closed it (✕, Escape, the backdrop, the browser), focus returns to ⚙. */
  function onclose() {
    opener?.focus();
  }

  // Handled here as well as by the browser, so Escape closes it the same way everywhere.
  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    close();
  }

  // A click on the dialog element itself, not its content, is a click on the backdrop.
  function onclick(event: MouseEvent) {
    if (event.target === dialog) close();
  }
</script>

<button bind:this={opener} type="button" class="open" aria-haspopup="dialog" onclick={show}
  ><span aria-hidden="true">⚙</span> Settings</button
>

<dialog
  bind:this={dialog}
  class="settings-dialog"
  aria-labelledby="settings-dialog-title"
  {onclose}
  {onkeydown}
  {onclick}
>
  <div class="content">
    <div class="head">
      <h2 id="settings-dialog-title">Settings</h2>
      <button type="button" class="close" aria-label="Close Settings" onclick={close}
        ><span aria-hidden="true">✕</span></button
      >
    </div>
    <section aria-labelledby="settings-sound">
      <h3 id="settings-sound">Sound</h3>
      <AudioControls />
    </section>
    <section aria-labelledby="settings-appearance">
      <h3 id="settings-appearance">Appearance</h3>
      <ThemePicker />
    </section>
  </div>
</dialog>

<style>
  button {
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.375rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }

  button:hover {
    background: var(--surface-sunken);
  }

  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .settings-dialog {
    width: min(28rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
  }

  .settings-dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .close {
    padding: 0.125rem 0.5rem;
  }
</style>
