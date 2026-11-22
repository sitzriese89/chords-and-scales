/**
 * Light dismiss for the non-modal overlays, the drawer and the popover (ADR-53): while one is
 * open, Escape and a click outside it close it.
 *
 * Two kinds of event are left alone:
 * - a click on the button that opened it, which toggles it itself;
 * - clicks and keys inside a modal dialog shown above the page (the scale or chord editor, the
 *   Settings dialog): the modal owns them, and its Escape closes only the modal.
 * An Escape another handler already took (`preventDefault`, as the root combobox does to close
 * its list) is not a second close either.
 */

/** Why an overlay closes. */
export type CloseReason = 'button' | 'escape' | 'outside';

const MODAL = '[aria-modal="true"], dialog';

function inModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(MODAL) !== null;
}

/**
 * Listens for Escape and outside clicks until the returned function is called. `panel` is the
 * overlay, `opener` the button that opened it.
 */
export function lightDismiss(
  panel: HTMLElement,
  opener: HTMLElement | null | undefined,
  close: (reason: Exclude<CloseReason, 'button'>) => void,
): () => void {
  // Captured, so a handler inside the page that stops the click doesn't keep the overlay open,
  // and the target is still where it was clicked.
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || !target.isConnected) return;
    if (panel.contains(target) || opener?.contains(target) || inModal(target)) return;
    close('outside');
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || inModal(event.target)) return;
    event.preventDefault();
    close('escape');
  };
  document.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey);
  };
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The first element in `root` that Tab would reach, outside anything hidden. */
export function firstFocusable(root: HTMLElement): HTMLElement | undefined {
  for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (!element.closest('[hidden], [inert]')) return element;
  }
  return undefined;
}

/**
 * Where focus goes when an overlay closes: back to `opener` after ✕ or Escape, and after a
 * click outside only when focus would otherwise be lost (on the page's body, or still inside
 * the overlay that is going away). A click on something that takes focus keeps it there.
 */
export function restoreFocus(
  reason: CloseReason,
  panel: HTMLElement,
  opener: HTMLElement | null | undefined,
): void {
  if (!opener) return;
  const active = document.activeElement;
  const lost = active === null || active === document.body || panel.contains(active);
  if (reason !== 'outside' || lost) opener.focus();
}
