// The harmonize row in the real app: the real WASM core, settings and storage, and the app's
// own harmonizer (the core's harmonize) unless a test passes another.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import type { Harmonizer } from '../chords';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';

async function startApp(
  options: {
    /** Omitted: the app's default, the core's harmonize. */
    harmonizer?: Harmonizer | null;
    change?: (s: Settings) => void;
  } = {},
): Promise<BrowserStorage> {
  const storage = new BrowserStorage(window.localStorage);
  const settings = defaultSettings();
  // The tab's position highlight dims part of the scale; it has its own tests.
  settings.tab.highlight = false;
  options.change?.(settings);
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  render(App, {
    storage,
    ...(options.harmonizer === undefined ? {} : { harmonizer: options.harmonizer }),
  });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return storage;
}

/** The neck's dots by role, as the set of their labels. */
function neck(): Record<string, Set<string>> {
  const roles: Record<string, Set<string>> = { root: new Set(), tone: new Set(), dim: new Set() };
  for (const g of document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')) {
    roles[g.dataset.role ?? ''].add(g.querySelector('text')?.textContent ?? '');
  }
  return roles;
}

const harmonizeSection = () => screen.getByRole('region', { name: /^Harmonize / });
const openRow = () => fireEvent.click(screen.getByRole('button', { name: 'Harmonize' }));
const pickSize = (name: string) =>
  fireEvent.click(within(harmonizeSection()).getByRole('radio', { name }));

/** The row's cells as text: `numeral symbol` for a chord, `note no chord` for none. */
function row(title: string): string[] {
  const list = screen.getByRole('list', { name: `Chords of ${title}` });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.trim().replace(/\s+/g, ' ') ?? '');
}

describe('harmonize view', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('opens a row of the chords of D Dorian, as triads and as 7th chords', async () => {
    await startApp({ change: (s) => ((s.lastView.root = 'D'), (s.lastView.scale = 'dorian')) });
    const button = screen.getByRole('button', { name: 'Harmonize' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Chords of D Dorian' })).toBeNull();

    await openRow();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(harmonizeSection()).getByRole('radio', { name: 'Triads' })).toBeChecked();
    expect(row('D Dorian')).toEqual([
      'i Dm',
      'ii Em',
      'III F',
      'IV G',
      'v Am',
      'vi° Bdim',
      'VII C',
    ]);

    await pickSize('7th chords');
    expect(row('D Dorian')).toEqual([
      'i7 Dm7',
      'ii7 Em7',
      'IIImaj7 Fmaj7',
      'IV7 G7',
      'v7 Am7',
      'viø7 Bm7b5',
      'VIImaj7 Cmaj7',
    ]);

    await openRow();
    expect(screen.queryByRole('list', { name: 'Chords of D Dorian' })).toBeNull();
  });

  it('marks the degrees of a pentatonic scale where no chord forms', async () => {
    await startApp({
      change: (s) => ((s.lastView.scale = 'minor-pentatonic'), (s.accidentals = 'flats')),
    });
    await openRow();
    expect(row('C Minor pentatonic')).toEqual([
      'i Cm',
      '♭III E♭',
      'F no chord',
      'G no chord',
      'B♭ no chord',
    ]);
    // A degree without a chord is not a button.
    expect(within(harmonizeSection()).getAllByRole('button', { pressed: false })).toHaveLength(2);

    await pickSize('7th chords');
    expect(row('C Minor pentatonic')).toEqual([
      'i7 Cm7',
      'E♭ no chord',
      'F no chord',
      'G no chord',
      'B♭ no chord',
    ]);
  });

  it('opens a clicked chord in the chord panel, over the dimmed scale', async () => {
    await startApp({ change: (s) => ((s.lastView.root = 'D'), (s.lastView.scale = 'dorian')) });
    await openRow();
    await pickSize('7th chords');
    const g7 = screen.getByRole('button', { name: 'IV7 G7' });
    expect(g7).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(g7);
    expect(g7).toHaveAttribute('aria-pressed', 'true');
    // The chord panel shows it chosen by degree, in the same size.
    expect(screen.getByRole('radio', { name: 'Degree of the scale' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Degree of D Dorian' })).toHaveValue('3');
    expect(
      within(screen.getByRole('group', { name: 'Chord size' })).getByRole('radio', {
        name: '7th chords',
      }),
    ).toBeChecked();
    expect(screen.getByRole('heading', { name: 'G7' })).toBeInTheDocument();
    expect(
      screen.getByText(/Dominant seventh \(IV7\) on degree 4 of D Dorian/),
    ).toBeInTheDocument();
    expect(neck()).toEqual({
      root: new Set(['G']),
      tone: new Set(['B', 'D', 'F']),
      dim: new Set(['E', 'A', 'C']),
    });

    // The size toggle in the row is the panel's: switching it turns G7 into G.
    await pickSize('Triads');
    expect(screen.getByRole('heading', { name: 'G' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'IV G' })).toHaveAttribute('aria-pressed', 'true');

    // Clearing the chord leaves nothing pressed.
    await fireEvent.click(screen.getByRole('button', { name: 'Clear chord' }));
    expect(screen.getByRole('button', { name: 'IV G' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('expands the chord panel when a chord is clicked while it is collapsed', async () => {
    const storage = await startApp({ change: (s) => (s.chordPanel.collapsed = true) });
    await openRow();
    await fireEvent.click(screen.getByRole('button', { name: 'V G' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'G' })).toBeInTheDocument();
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/collapsed = false/);
  });

  it('follows the scale picked in the explorer', async () => {
    await startApp();
    await openRow();
    expect(row('C Major')[0]).toBe('I C');
    await fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), {
      target: { value: 'A' },
    });
    expect(row('A Major')[0]).toBe('I A');
  });

  it('uses the harmonizer the app is given', async () => {
    await startApp({ harmonizer: cMajorHarmonizer });
    await openRow();
    expect(row('C Major')).toEqual(['I C', 'ii Dm', 'iii Em', 'IV F', 'V G', 'vi Am', 'vii° Bdim']);
  });

  it('is not offered without a harmonizer', async () => {
    await startApp({ harmonizer: null });
    expect(screen.queryByRole('button', { name: 'Harmonize' })).toBeNull();
  });
});
