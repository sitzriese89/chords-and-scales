// The scale explorer in the real app, with the real WASM core (loaded in test-setup.ts).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { instrumentPanel, scalePicker } from '../../test-shell';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import { setUserScales, setUserTunings } from '../theory';
import { USER_SCALES_DOCUMENT, USER_TUNINGS_DOCUMENT } from '../user-catalogs.svelte';

/**
 * A Dorian on six-string standard tuning, 24 frets, per string (1 = high E): `fret:label`.
 * Written out by hand from the scale (A B C D E F♯ G) and the open strings (E B G D A E).
 */
const A_DORIAN_NOTES: Record<number, string> = {
  1: '0:E 2:F♯ 3:G 5:A 7:B 8:C 10:D 12:E 14:F♯ 15:G 17:A 19:B 20:C 22:D 24:E',
  2: '0:B 1:C 3:D 5:E 7:F♯ 8:G 10:A 12:B 13:C 15:D 17:E 19:F♯ 20:G 22:A 24:B',
  3: '0:G 2:A 4:B 5:C 7:D 9:E 11:F♯ 12:G 14:A 16:B 17:C 19:D 21:E 23:F♯ 24:G',
  4: '0:D 2:E 4:F♯ 5:G 7:A 9:B 10:C 12:D 14:E 16:F♯ 17:G 19:A 21:B 22:C 24:D',
  5: '0:A 2:B 3:C 5:D 7:E 9:F♯ 10:G 12:A 14:B 15:C 17:D 19:E 21:F♯ 22:G 24:A',
  6: '0:E 2:F♯ 3:G 5:A 7:B 8:C 10:D 12:E 14:F♯ 15:G 17:A 19:B 20:C 22:D 24:E',
};

/** The same positions labelled by interval. */
const A_DORIAN_INTERVALS: Record<number, string> = {
  1: '0:5 2:6 3:♭7 5:1 7:2 8:♭3 10:4 12:5 14:6 15:♭7 17:1 19:2 20:♭3 22:4 24:5',
  2: '0:2 1:♭3 3:4 5:5 7:6 8:♭7 10:1 12:2 13:♭3 15:4 17:5 19:6 20:♭7 22:1 24:2',
  3: '0:♭7 2:1 4:2 5:♭3 7:4 9:5 11:6 12:♭7 14:1 16:2 17:♭3 19:4 21:5 23:6 24:♭7',
  4: '0:4 2:5 4:6 5:♭7 7:1 9:2 10:♭3 12:4 14:5 16:6 17:♭7 19:1 21:2 22:♭3 24:4',
  5: '0:1 2:2 3:♭3 5:4 7:5 9:6 10:♭7 12:1 14:2 15:♭3 17:4 19:5 21:6 22:♭7 24:1',
  6: '0:5 2:6 3:♭7 5:1 7:2 8:♭3 10:4 12:5 14:6 15:♭7 17:1 19:2 20:♭3 22:4 24:5',
};

interface Dot {
  string: number;
  fret: number;
  label: string;
  role: string;
}

function dots(): Dot[] {
  return [...document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')].map((g) => ({
    string: Number(g.dataset.string),
    fret: Number(g.dataset.fret),
    label: g.querySelector('text')?.textContent ?? '',
    role: g.dataset.role ?? '',
  }));
}

/** The tab's notes, left to right: `string:fret` with the fret as drawn. */
function tabNotes(): string[] {
  return [...document.querySelectorAll<SVGGElement>('svg.tab-drawing g.note')]
    .sort((a, b) => Number(a.dataset.column) - Number(b.dataset.column))
    .map((g) => `${g.dataset.string}:${g.querySelector('text')?.textContent ?? ''}`);
}

/** G major 3NPS pattern 1 on six-string standard tuning, by hand: three notes a string. */
const G_MAJOR_PATTERN_1 =
  '6:3 6:5 6:7 5:3 5:5 5:7 4:4 4:5 4:7 3:4 3:5 3:7 2:5 2:7 2:8 1:5 1:7 1:8'.split(' ');

/** The expected dots from a per-string table; the root is the dot labelled `rootLabel`. */
function expected(table: Record<number, string>, rootLabel: string): Dot[] {
  return Object.entries(table).flatMap(([string, cells]) =>
    cells.split(' ').map((cell) => {
      const [fret, label] = cell.split(':');
      return {
        string: Number(string),
        fret: Number(fret),
        label,
        role: label === rootLabel ? 'root' : 'tone',
      };
    }),
  );
}

const sorted = (list: Dot[]) => [...list].sort((a, b) => a.string - b.string || a.fret - b.fret);

/** Pairs `string:fret` → label, for comparing labels only. */
const labels = (list: Dot[]) => new Map(list.map((d) => [`${d.string}:${d.fret}`, d.label]));

/** Settings with `change` applied; the tab's highlight is off, so every dot keeps its role. */
function settingsWith(change: (s: Settings) => void): string {
  const settings = defaultSettings();
  settings.tab.highlight = false;
  change(settings);
  return serializeSettings(settings);
}

async function startApp(storage: BrowserStorage) {
  const result = render(App, { storage });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

describe('scale explorer', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'A', scale: 'dorian' };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    setUserScales('');
    setUserTunings('');
  });

  it('shows A Dorian on standard tuning with exactly the expected dots and note names', async () => {
    await startApp(storage);
    expect(screen.getByRole('heading', { name: 'A Dorian' })).toBeInTheDocument();
    expect(sorted(dots())).toEqual(expected(A_DORIAN_NOTES, 'A'));
    expect(dots()).toHaveLength(90);
    // The roots are squares, named as such for screen readers.
    expect(screen.getByRole('gridcell', { name: 'String 5, open, A, root' })).toBeInTheDocument();
  });

  it('labels A Dorian by interval in interval mode', async () => {
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'A', scale: 'dorian' };
        s.labels = 'intervals';
      }),
    );
    await startApp(storage);
    expect(sorted(dots())).toEqual(expected(A_DORIAN_INTERVALS, '1'));
  });

  it('updates the neck when the label mode or the accidentals change', async () => {
    await startApp(storage);

    await fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    expect(labels(dots())).toEqual(labels(expected(A_DORIAN_INTERVALS, '1')));

    await fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(dots().every((d) => d.label === '')).toBe(true);
    expect(dots()).toHaveLength(90);

    await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));
    expect(labels(dots()).get('1:2')).toBe('F♯');
    await fireEvent.click(screen.getByRole('radio', { name: /Flats/ }));
    // Sharps/flats respell everything but the root (ADR-6).
    expect(labels(dots()).get('1:2')).toBe('G♭');
    expect(labels(dots()).get('5:0')).toBe('A');
  });

  it('updates the neck when the root or the scale changes, keeping the typed spelling', async () => {
    await startApp(storage);
    const root = scalePicker().getByRole('combobox', { name: 'Root' });

    await fireEvent.change(root, { target: { value: 'db' } });
    expect(root).toHaveValue('D♭');
    expect(screen.getByRole('heading', { name: 'D♭ Dorian' })).toBeInTheDocument();
    // D♭ Dorian: D♭ D♯ E F♯ G♯ A♯ B with sharps; the root keeps its flat.
    expect(labels(dots()).get('5:4')).toBe('D♭');
    expect(dots().find((d) => d.string === 5 && d.fret === 4)?.role).toBe('root');
    expect(labels(dots()).get('5:7')).toBe('E');

    await fireEvent.change(root, { target: { value: 'H' } });
    expect(screen.getByRole('alert')).toHaveTextContent('“H” is not a note name');
    expect(screen.getByRole('heading', { name: 'D♭ Dorian' })).toBeInTheDocument();

    await fireEvent.change(root, { target: { value: 'E' } });
    await fireEvent.change(scalePicker().getByRole('listbox', { name: 'Scale' }), {
      target: { value: 'minor-pentatonic' },
    });
    expect(screen.getByRole('heading', { name: 'E Minor pentatonic' })).toBeInTheDocument();
    expect(sorted(dots()).filter((d) => d.string === 1)).toEqual(
      expected({ 1: '0:E 3:G 5:A 7:B 10:D 12:E 15:G 17:A 19:B 22:D 24:E' }, 'E'),
    );
  });

  it('lists all 17 roots whatever is typed or chosen, and keeps the chosen spelling', async () => {
    await startApp(storage);
    const root = scalePicker().getByRole('combobox', { name: 'Root' });
    const toggle = scalePicker().getByRole('button', { name: 'Show all roots' });
    const ALL = [
      'C',
      'C♯',
      'D♭',
      'D',
      'D♯',
      'E♭',
      'E',
      'F',
      'F♯',
      'G♭',
      'G',
      'G♯',
      'A♭',
      'A',
      'A♯',
      'B♭',
      'B',
    ];
    // The list is hidden while closed, so it is found with `hidden`.
    const list = () => within(screen.getByRole('listbox', { name: 'Roots', hidden: true }));
    const option = (name: string) => list().getByRole('option', { name, hidden: true });
    const listed = () =>
      list()
        .getAllByRole('option', { hidden: true })
        .map((o) => o.textContent?.trim());
    expect(root).toHaveAttribute('aria-expanded', 'false');

    // Text that would make a datalist suggest only D♭/D♯/D: the list still shows every name.
    await fireEvent.input(root, { target: { value: 'D' } });
    await fireEvent.click(toggle);
    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(listed()).toEqual(ALL);

    await fireEvent.click(option('G♭'));
    expect(root).toHaveAttribute('aria-expanded', 'false');
    expect(root).toHaveValue('G♭');
    expect(screen.getByRole('heading', { name: 'G♭ Dorian' })).toBeInTheDocument();
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/root = "G♭"/);

    // Opened again on another root, it still lists all 17, with the current one highlighted.
    await fireEvent.keyDown(root, { key: 'ArrowDown', altKey: true });
    expect(listed()).toEqual(ALL);
    expect(root).toHaveAttribute('aria-activedescendant', 'root-input-option-9');
    expect(option('G♭')).toHaveAttribute('aria-selected', 'true');

    // Keyboard: two down from G♭ is G♯, Enter chooses it; Escape closes without choosing.
    await fireEvent.keyDown(root, { key: 'ArrowDown' });
    await fireEvent.keyDown(root, { key: 'ArrowDown' });
    await fireEvent.keyDown(root, { key: 'Enter' });
    expect(root).toHaveValue('G♯');
    expect(screen.getByRole('heading', { name: 'G♯ Dorian' })).toBeInTheDocument();
    await fireEvent.keyDown(root, { key: 'ArrowDown' });
    await fireEvent.keyDown(root, { key: 'Home' });
    expect(root).toHaveAttribute('aria-activedescendant', 'root-input-option-0');
    await fireEvent.keyDown(root, { key: 'Escape' });
    expect(root).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: 'G♯ Dorian' })).toBeInTheDocument();

    // Typing and Enter still sets the root; a name that isn't a note still errors.
    await fireEvent.input(root, { target: { value: 'eb' } });
    await fireEvent.keyDown(root, { key: 'Enter' });
    expect(root).toHaveValue('E♭');
    expect(screen.getByRole('heading', { name: 'E♭ Dorian' })).toBeInTheDocument();
    await fireEvent.input(root, { target: { value: 'X#' } });
    await fireEvent.keyDown(root, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('“X#” is not a note name');
    expect(root).toHaveAttribute('aria-invalid', 'true');
    await fireEvent.click(toggle);
    await fireEvent.click(option('B'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'B Dorian' })).toBeInTheDocument();
  });

  it('searches the scales by name and alias, grouped by family', async () => {
    await startApp(storage);
    const list = scalePicker().getByRole('listbox', { name: 'Scale' });
    expect(list.querySelectorAll('optgroup')[0]).toHaveAttribute('label', 'Diatonic modes');

    await fireEvent.input(scalePicker().getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'FREYGISH' },
    });
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['phrygian-dominant']);
    expect(list.querySelector('optgroup')).toHaveAttribute('label', 'Harmonic minor modes');

    await fireEvent.input(scalePicker().getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'zzz' },
    });
    expect(list.querySelectorAll('option')).toHaveLength(0);
    expect(screen.getByText('No scale matches “zzz”.')).toBeInTheDocument();
  });

  it('restores the view after a restart', async () => {
    const first = await startApp(storage);
    await fireEvent.change(scalePicker().getByRole('combobox', { name: 'Root' }), {
      target: { value: 'F#' },
    });
    await fireEvent.change(scalePicker().getByRole('listbox', { name: 'Scale' }), {
      target: { value: 'phrygian-dominant' },
    });
    await fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    await fireEvent.click(screen.getByRole('radio', { name: /Flats/ }));
    const before = dots();
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/accidentals = "flats"/);
    first.unmount();

    // A fresh app over the same storage: a new settings store reads what was saved.
    await startApp(new BrowserStorage(window.localStorage));
    expect(screen.getByRole('heading', { name: 'F♯ Phrygian dominant' })).toBeInTheDocument();
    expect(scalePicker().getByRole('combobox', { name: 'Root' })).toHaveValue('F♯');
    expect(scalePicker().getByRole('listbox', { name: 'Scale' })).toHaveValue('phrygian-dominant');
    expect(screen.getByRole('radio', { name: 'Intervals' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Flats/ })).toBeChecked();
    expect(dots()).toEqual(before);
  });

  it('loads the user scales and tunings from storage and lists the skipped items', async () => {
    await storage.write(
      USER_SCALES_DOCUMENT,
      `[[scale]]
id = "mine"
name = "My scale"
intervals = ["1", "b2", "5"]
`,
    );
    await storage.write(
      USER_TUNINGS_DOCUMENT,
      `[[tuning]]
id = "guitar-4-high"
name = "High four"
kind = "guitar"
notes = ["D3", "G3", "B3", "E4"]

[[tuning]]
id = "bass-3"
name = "Three"
kind = "bass"
notes = ["E1", "A1", "D2"]
`,
    );
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.instrument.tuning = 'guitar-4-high';
        s.instrument.strings = 4;
        s.lastView = { root: 'C', scale: 'mine' };
      }),
    );
    await startApp(storage);

    expect(screen.getByRole('heading', { name: 'C My scale' })).toBeInTheDocument();
    expect(new Set(dots().map((d) => d.string))).toEqual(new Set([1, 2, 3, 4]));
    expect(instrumentPanel().getByRole('combobox', { name: 'Tuning' })).toHaveValue(
      'guitar-4-high',
    );
    expect(
      screen.getByText('One problem with your files: some items or tag rules were not used'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^tunings\.toml: tuning 2 \("bass-3"\)/)).toBeInTheDocument();
  });

  it('shows G major 3NPS pattern 1 as tab and highlights it on the neck', async () => {
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'G', scale: 'major' };
        s.tab.highlight = true;
      }),
    );
    await startApp(storage);
    expect(screen.getByRole('heading', { name: 'Tab: Pattern 1 (from G)' })).toBeInTheDocument();
    expect(tabNotes()).toEqual(G_MAJOR_PATTERN_1);

    // The pattern's 18 notes keep their roles on the neck; every other note is dimmed.
    const inPattern = new Set(G_MAJOR_PATTERN_1);
    for (const dot of dots()) {
      const key = `${dot.string}:${dot.fret}`;
      if (inPattern.has(key)) expect(dot.role, key).not.toBe('dim');
      else expect(dot.role, key).toBe('dim');
    }
    expect(dots().filter((d) => d.role !== 'dim')).toHaveLength(18);
    expect(dots().find((d) => d.string === 6 && d.fret === 3)?.role).toBe('root');

    // Without highlighting the whole scale is back.
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Highlight on the neck' }));
    expect(dots().some((d) => d.role === 'dim')).toBe(false);
  });

  it('switches pattern, system and direction, and keeps them after a restart', async () => {
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'G', scale: 'major' };
      }),
    );
    const first = await startApp(storage);

    await fireEvent.change(screen.getByRole('combobox', { name: 'Pattern' }), {
      target: { value: '1' },
    });
    expect(screen.getByRole('heading', { name: 'Tab: Pattern 2 (from A)' })).toBeInTheDocument();
    expect(tabNotes().slice(0, 3)).toEqual(['6:5', '6:7', '6:8']);

    await fireEvent.click(screen.getByRole('radio', { name: 'Fret window' }));
    await fireEvent.change(screen.getByRole('spinbutton', { name: 'Start fret' }), {
      target: { value: '2' },
    });
    expect(screen.getByRole('heading', { name: 'Tab: Frets 2–5' })).toBeInTheDocument();
    expect(tabNotes().slice(0, 4)).toEqual(['6:2', '6:3', '6:5', '5:2']);

    await fireEvent.click(screen.getByRole('radio', { name: 'Down' }));
    expect(tabNotes()[0]).toBe('1:5');
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/direction = "descending"/);
    first.unmount();

    await startApp(new BrowserStorage(window.localStorage));
    expect(screen.getByRole('radio', { name: 'Fret window' })).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Start fret' })).toHaveValue(2);
    expect(screen.getByRole('radio', { name: 'Down' })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Tab: Frets 2–5' })).toBeInTheDocument();
  });

  it('keeps the tab unmirrored when left-handed and absolute above a capo', async () => {
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'G', scale: 'major' };
        s.leftHanded = true;
      }),
    );
    await startApp(storage);
    expect(tabNotes()).toEqual(G_MAJOR_PATTERN_1);

    await fireEvent.change(instrumentPanel().getByRole('spinbutton', { name: 'Capo fret' }), {
      target: { value: '5' },
    });
    expect(screen.getByText('Capo 5 (fret numbers are absolute)')).toBeInTheDocument();
    // Pattern 1 moves up an octave: the capo's own frets are never renumbered.
    expect(tabNotes().slice(0, 3)).toEqual(['6:15', '6:17', '6:19']);
  });

  it('shows the defaults for a stored scale or root that is not usable', async () => {
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'H', scale: 'gone' };
      }),
    );
    await startApp(storage);
    expect(screen.getByRole('heading', { name: 'C Major' })).toBeInTheDocument();
    expect(screen.getByText('There is no scale “gone”; showing Major.')).toBeInTheDocument();
    expect(screen.getByText('“H” is not a note name; showing C.')).toBeInTheDocument();
  });
});
