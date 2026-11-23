/**
 * Finding things in the app shell from a test (ADR-51, ADR-53). Each helper first gets to
 * where its part lives, as a user would, and returns queries inside it: the page tab is clicked,
 * the drawer, the popover or the Settings dialog opened, unless that is so already. They are
 * synchronous (a native click, then `flushSync`), so a test can call them inline:
 * `within(...)` stays as short as it was when everything was on one page.
 *
 * Opening one overlay closes another, as a click outside it would: call the helper again
 * rather than keeping what it returned across a switch.
 */
import { screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';

type PageName = 'Scales' | 'Chords' | 'Sheet';

function click(element: HTMLElement) {
  element.click();
  flushSync();
}

/**
 * Waits until the app has loaded its files and shows its toolbar. It opens on the page that
 * was saved, which need not be Scales.
 */
export async function appReady(): Promise<void> {
  await screen.findByRole('navigation', { name: 'Pages' });
}

/** Shows `page` and returns the screen queries, for a chained call: `on('Chords').getBy…`. */
export function on(page: PageName) {
  goTo(page);
  return screen;
}

/** The page tab for `page`; the Sheet tab carries its item count. */
export function pageTab(page: PageName): HTMLElement {
  const nav = within(screen.getByRole('navigation', { name: 'Pages' }));
  return nav.getByRole('button', { name: page === 'Sheet' ? /^Sheet \(\d+\)$/ : page });
}

/** Shows `page`, clicking its tab if it isn't the current page. */
export function goTo(page: PageName): void {
  const tab = pageTab(page);
  if (tab.getAttribute('aria-current') !== 'page') click(tab);
}

/** The "Choose scale" button in the toolbar (on the Scales page). */
export function scalePickerButton(): HTMLElement {
  goTo('Scales');
  return screen.getByRole('button', { name: 'Choose scale' });
}

/** The scale picker, in its drawer on the Scales page, opened if it was closed. */
export function scalePicker() {
  const button = scalePickerButton();
  if (button.getAttribute('aria-expanded') !== 'true') click(button);
  return within(screen.getByRole('dialog', { name: 'Choose scale' }));
}

/** The toolbar, where the page tabs and the picker button are. */
export function toolbar() {
  return within(screen.getByRole('banner'));
}

/**
 * The "Choose chord" button in the toolbar (on the Chords page). With no chord chosen the
 * page's empty state has a button of the same name.
 */
export function chordPickerButton(): HTMLElement {
  goTo('Chords');
  return toolbar().getByRole('button', { name: 'Choose chord' });
}

/** The chord picker, in its drawer on the Chords page, opened if it was closed. */
export function chordPicker() {
  const button = chordPickerButton();
  if (button.getAttribute('aria-expanded') !== 'true') click(button);
  return within(screen.getByRole('dialog', { name: 'Choose chord' }));
}

/** The Chords page: the chosen chord's heading row and its shapes. */
export function chordsPage() {
  goTo('Chords');
  return within(screen.getByRole('main', { name: 'Chords' }));
}

/** The toolbar's instrument button; its name is the neck's summary. */
export function instrumentButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Instrument: / });
}

/** The instrument settings in the toolbar's popover, opened if it was closed. */
export function instrumentPanel() {
  const button = instrumentButton();
  if (button.getAttribute('aria-expanded') !== 'true') click(button);
  return within(screen.getByRole('dialog', { name: 'Instrument' }));
}

/** The Settings dialog (Sound, Appearance), opened if it was closed. */
export function settingsDialog() {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.settings-dialog');
  if (!dialog?.open) click(screen.getByRole('button', { name: 'Settings' }));
  return within(screen.getByRole('dialog', { name: 'Settings' }));
}
