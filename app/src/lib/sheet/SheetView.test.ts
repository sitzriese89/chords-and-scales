// The export sheet in the real app (SPEC §5.10, ADR-43): the "Add … to sheet" buttons, the
// sheet page, its own theme, and what survives a restart. Real WASM core and storage.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, goTo, scalePicker } from '../../test-shell';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings } from '../settings';
import { BrowserStorage, type Storage } from '../storage';
import { BUILT_IN_THEMES, schemesOf, THEME_STYLE_ID } from '../themes';
import { SHEET_DOCUMENT } from './store.svelte';

async function startApp(storage: Storage) {
  render(App, { storage, harmonizer: cMajorHarmonizer });
  await appReady();
}

/** Closes the app and starts it again on the same storage. */
async function restart(storage: Storage) {
  cleanup();
  await startApp(storage);
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
/** Picks in the chord picker, opening its drawer. */
const pickChord = (name: string, value: string) =>
  fireEvent.change(chordPicker().getByRole('combobox', { name }), { target: { value } });
const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

const openSheet = () => click(/^Sheet \(\d+\)$/);
const sheetRoot = () => document.querySelector<HTMLElement>('article[data-sheet]')!;
const sheetItems = () => [...sheetRoot().querySelectorAll<HTMLElement>('figure[data-sheet-item]')];
const itemTitles = () => sheetItems().map((f) => f.querySelector('figcaption .title')!.textContent);
const surfaceOf = (element: HTMLElement) =>
  getComputedStyle(element).getPropertyValue('--surface').trim();

/** Adds the scale, its tab and a chord, as a user would. */
async function addScaleTabAndChord() {
  goTo('Scales');
  await click('Add scale to sheet');
  expect(screen.getByRole('status')).toHaveTextContent('Added to the sheet (1 item).');
  await click('Add tab to sheet');
  goTo('Chords');
  await pickChord('Chord root', 'G');
  await pickChord('Chord quality', 'dom7');
  await click('Add chord to sheet');
}

describe('export sheet', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    const settings = defaultSettings();
    settings.lastView = { root: 'A', scale: 'dorian' };
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  });

  afterEach(() => {
    cleanup();
    document.getElementById(THEME_STYLE_ID)?.remove();
    delete document.documentElement.dataset.scheme;
  });

  it('collects a scale, a tab and a chord and keeps them across a restart', async () => {
    await startApp(storage);
    await addScaleTabAndChord();
    expect(screen.getByRole('button', { name: 'Sheet (3)' })).toBeInTheDocument();

    await restart(storage);
    await openSheet();
    expect(screen.getByRole('heading', { name: 'Export sheet' })).toBeInTheDocument();
    expect(itemTitles()).toEqual(['A Dorian', 'A Dorian, Pattern 1 (from A)', 'G7']);
    const [scale, tab, chord] = sheetItems();
    expect(scale.dataset.kind).toBe('fretboard');
    expect(within(scale).getByRole('grid', { name: 'Sheet fretboard: A Dorian' })).toBeVisible();
    expect(tab.querySelector('svg.tab, svg')).not.toBeNull();
    expect(within(tab).getByRole('img', { name: /^Sheet tab:/ })).toBeInTheDocument();
    expect(chord.querySelectorAll('g.dot').length).toBeGreaterThan(0);
    expect(await storage.read(SHEET_DOCUMENT)).toMatch(/kind = "chord"/);
  });

  it('draws an item as it was added, not as the app is now', async () => {
    await startApp(storage);
    await click('Add scale to sheet');
    // Change the scale and the labels afterwards.
    await fireEvent.change(scalePicker().getByRole('listbox', { name: 'Scale' }), {
      target: { value: 'major' },
    });
    await fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    await openSheet();
    expect(itemTitles()).toEqual(['A Dorian']);
    const labels = [...sheetItems()[0].querySelectorAll('g.dot text')].map((t) => t.textContent);
    expect(labels).toContain('A');
    expect(labels).not.toContain('1');
  });

  it('adds a chosen voicing as a chord diagram', async () => {
    await startApp(storage);
    goTo('Chords');
    await pickChord('Chord quality', 'major');
    expect(screen.getByRole('button', { name: 'Add shape to sheet' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: /^\d+\. x32010(,|$)/ }));
    await click('Add shape to sheet');
    await openSheet();
    expect(itemTitles()).toEqual(['C: x32010']);
    expect(
      within(sheetItems()[0]).getByRole('img', { name: 'Sheet chord diagram: C: x32010' }),
    ).toBeInTheDocument();
  });

  it('moves, removes and titles, and saves each change', async () => {
    await startApp(storage);
    await addScaleTabAndChord();
    await openSheet();
    await click('Move G7 up');
    expect(itemTitles()).toEqual(['A Dorian', 'G7', 'A Dorian, Pattern 1 (from A)']);
    expect(screen.getByRole('button', { name: 'Move A Dorian up' })).toBeDisabled();
    await click('Remove A Dorian');
    expect(itemTitles()).toEqual(['G7', 'A Dorian, Pattern 1 (from A)']);
    await fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Dorian practice' },
    });
    expect(within(sheetRoot()).getByRole('heading', { name: 'Dorian practice' })).toBeVisible();

    await restart(storage);
    await openSheet();
    expect(itemTitles()).toEqual(['G7', 'A Dorian, Pattern 1 (from A)']);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Dorian practice');
  });

  it('shows the Print theme by default, inside the app theme, without changing it', async () => {
    await startApp(storage);
    await click('Add scale to sheet');
    await openSheet();
    expect(screen.getByRole('combobox', { name: 'Sheet theme' })).toHaveValue('print');
    expect(sheetRoot().dataset.scheme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeDisabled();
    expect(surfaceOf(sheetRoot())).toBe('#ffffff');
    // The app around it keeps the Default theme.
    expect(surfaceOf(document.documentElement)).toBe('#f7f6f3');
  });

  it.each(
    BUILT_IN_THEMES.flatMap((theme) => schemesOf(theme).map((scheme) => [theme, scheme] as const)),
  )('renders every item in the $0.name theme, $1', async (theme, scheme) => {
    await startApp(storage);
    await addScaleTabAndChord();
    await openSheet();
    await pick('Sheet theme', theme.id);
    if (schemesOf(theme).length > 1) {
      await fireEvent.click(
        screen.getByRole('radio', { name: scheme === 'dark' ? 'Dark' : 'Light' }),
      );
    }
    const root = sheetRoot();
    expect(root.dataset.themeId).toBe(theme.id);
    expect(root.dataset.scheme).toBe(scheme);
    expect(root.querySelector('style')?.textContent).toContain(
      `[data-sheet][data-scheme='${scheme}']`,
    );
    expect(surfaceOf(root)).toBe(theme.schemes[scheme]!['--surface']);
    expect(sheetItems()).toHaveLength(3);
    for (const item of sheetItems()) expect(item.querySelector('svg')).not.toBeNull();

    await restart(storage);
    await openSheet();
    expect(sheetRoot().dataset.themeId).toBe(theme.id);
    expect(sheetRoot().dataset.scheme).toBe(scheme);
  });

  it('offers and shows the user themes too', async () => {
    await storage.write(
      'theme-solar.css',
      `:root { --theme-name: 'Solar'; }\n[data-scheme='dark'] { --surface: #002b36; }\n`,
    );
    await startApp(storage);
    await click('Add scale to sheet');
    await openSheet();
    await pick('Sheet theme', 'solar');
    expect(sheetRoot().dataset.scheme).toBe('dark');
    expect(surfaceOf(sheetRoot())).toBe('#002b36');
    expect(sheetItems()[0].querySelector('svg')).not.toBeNull();
  });

  it('shows Print for a sheet theme that is gone, and says so', async () => {
    await storage.write(SHEET_DOCUMENT, 'version = 1\ntheme_id = "gone"\n');
    await startApp(storage);
    await openSheet();
    expect(sheetRoot().dataset.themeId).toBe('print');
    expect(screen.getByText(/The theme “gone” was not found, so Print is shown/)).toBeVisible();
    expect(screen.getByText(/The sheet is empty/)).toBeVisible();
  });

  it('shows an item whose scale is gone as missing and draws the rest', async () => {
    await storage.write(
      SHEET_DOCUMENT,
      `version = 1
[[item]]
kind = "scale"
scale = { root = "C", scale = "my-deleted-scale" }

[[item]]
kind = "chord"
chord = { root = "D", id = "minor" }

[[item]]
kind = "tab"
`,
    );
    await startApp(storage);
    await openSheet();
    expect(screen.getByRole('status')).toHaveTextContent(
      /item 3 is dropped because it has no scale root/,
    );
    const [missing, chord] = sheetItems();
    expect(sheetItems()).toHaveLength(2);
    expect(missing.dataset.kind).toBe('missing');
    expect(within(missing).getByRole('note')).toHaveTextContent(
      'Missing: The scale “my-deleted-scale” no longer exists.',
    );
    expect(chord.dataset.kind).toBe('fretboard');
    expect(itemTitles()[1]).toBe('Dm');
    await click('Dismiss');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
