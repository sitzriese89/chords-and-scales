// The scale explorer in the real app, with the real WASM core (loaded in test-setup.ts).
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
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

function settingsWith(change: (s: Settings) => void): string {
  const settings = defaultSettings();
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
    const root = screen.getByRole('combobox', { name: 'Root' });

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
    await fireEvent.change(screen.getByRole('listbox', { name: 'Scale' }), {
      target: { value: 'minor-pentatonic' },
    });
    expect(screen.getByRole('heading', { name: 'E Minor pentatonic' })).toBeInTheDocument();
    expect(sorted(dots()).filter((d) => d.string === 1)).toEqual(
      expected({ 1: '0:E 3:G 5:A 7:B 10:D 12:E 15:G 17:A 19:B 22:D 24:E' }, 'E'),
    );
  });

  it('searches the scales by name and alias, grouped by family', async () => {
    await startApp(storage);
    const list = screen.getByRole('listbox', { name: 'Scale' });
    expect(list.querySelectorAll('optgroup')[0]).toHaveAttribute('label', 'Diatonic modes');

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'FREYGISH' },
    });
    expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['phrygian-dominant']);
    expect(list.querySelector('optgroup')).toHaveAttribute('label', 'Harmonic minor modes');

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'zzz' },
    });
    expect(list.querySelectorAll('option')).toHaveLength(0);
    expect(screen.getByText('No scale matches “zzz”.')).toBeInTheDocument();
  });

  it('restores the view after a restart', async () => {
    const first = await startApp(storage);
    await fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), {
      target: { value: 'F#' },
    });
    await fireEvent.change(screen.getByRole('listbox', { name: 'Scale' }), {
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
    expect(screen.getByRole('combobox', { name: 'Root' })).toHaveValue('F♯');
    expect(screen.getByRole('listbox', { name: 'Scale' })).toHaveValue('phrygian-dominant');
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
    expect(screen.getByRole('combobox', { name: 'Tuning' })).toHaveValue('guitar-4-high');
    expect(screen.getByText('One item in your files could not be loaded')).toBeInTheDocument();
    expect(screen.getByText(/^tunings\.toml: tuning 2 \("bass-3"\)/)).toBeInTheDocument();
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
