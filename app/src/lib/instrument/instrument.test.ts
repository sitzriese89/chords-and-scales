// The instrument panel in the real app, with the real WASM core (loaded in test-setup.ts).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import { getTuning, setUserTunings } from '../theory';
import { USER_TUNINGS_BACKUP_DOCUMENT, USER_TUNINGS_DOCUMENT } from '../user-catalogs.svelte';

interface Dot {
  string: number;
  fret: number;
  label: string;
  x: number;
}

function dots(): Dot[] {
  return [...document.querySelectorAll<SVGGElement>('svg.fretboard g.dot')].map((g) => {
    const shape = g.querySelector('.shape')!;
    const x =
      shape.tagName === 'circle'
        ? Number(shape.getAttribute('cx'))
        : Number(shape.getAttribute('x')) + Number(shape.getAttribute('width')) / 2;
    return {
      string: Number(g.dataset.string),
      fret: Number(g.dataset.fret),
      label: g.querySelector('text')?.textContent ?? '',
      x,
    };
  });
}

const stringsOnNeck = () => new Set(dots().map((d) => d.string)).size;
const dotAt = (string: number, fret: number) =>
  dots().find((d) => d.string === string && d.fret === fret);

function settingsWith(change: (s: Settings) => void): string {
  const settings = defaultSettings();
  change(settings);
  return serializeSettings(settings);
}

async function startApp(storage = new BrowserStorage(window.localStorage)) {
  const result = render(App, { storage });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

const panel = () => within(screen.getByRole('complementary', { name: 'Instrument settings' }));
const tuningSelect = () => panel().getByRole('combobox', { name: 'Tuning' });
const stringsSelect = () => panel().getByRole('combobox', { name: 'Strings' });
const offered = () =>
  [...tuningSelect().querySelectorAll('option')].map((o) => o.textContent?.trim());

async function saved(): Promise<Settings['instrument']> {
  const text = await new BrowserStorage(window.localStorage).read(SETTINGS_DOCUMENT);
  const match = /\[instrument\]\n([\s\S]*?)\n\n/.exec(text ?? '');
  return Object.fromEntries(
    (match?.[1] ?? '').split('\n').map((line) => {
      const [key, value] = line.split(' = ');
      return [key, JSON.parse(value)];
    }),
  ) as Settings['instrument'];
}

describe('instrument panel', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.lastView = { root: 'E', scale: 'minor-pentatonic' };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    setUserTunings('');
    delete document.documentElement.dataset.theme;
  });

  it('switches to a 5-string bass preset and updates the neck at once', async () => {
    await startApp(storage);
    expect(stringsOnNeck()).toBe(6);
    // Six strings offer the guitar presets and the six-string bass.
    expect(offered()).toContain('Drop D');
    expect(within(tuningSelect()).getByRole('group', { name: 'Bass' })).toBeInTheDocument();

    await fireEvent.change(stringsSelect(), { target: { value: '5' } });
    // Five strings start on the five-string bass standard.
    expect(tuningSelect()).toHaveValue('bass-5-standard');
    expect(offered()).toEqual(['Standard', 'High C']);
    expect(stringsOnNeck()).toBe(5);
    // The low B string is string 5: B0 open, E on fret 5, nothing on fret 1 (C).
    expect(dotAt(5, 0)?.label).toBe('B');
    expect(dotAt(5, 5)?.label).toBe('E');
    expect(dotAt(5, 1)).toBeUndefined();
    expect(panel().getByText(/low to high/)).toHaveTextContent('Bass, low to high: B0 E1 A1 D2 G2');

    await fireEvent.change(tuningSelect(), { target: { value: 'bass-5-high-c' } });
    // High C: E A D G C, so string 1 is C3 and has G on fret 7.
    expect(dotAt(1, 7)?.label).toBe('G');
    expect(dotAt(5, 0)?.label).toBe('E');
    await expect.poll(saved).toMatchObject({ kind: 'bass', strings: 5, tuning: 'bass-5-high-c' });
  });

  it('picks the standard preset of the kind in use when the string count changes', async () => {
    await startApp(storage);
    await fireEvent.change(stringsSelect(), { target: { value: '7' } });
    expect(tuningSelect()).toHaveValue('guitar-7-standard');
    await fireEvent.change(stringsSelect(), { target: { value: '4' } });
    // There is no four-string guitar preset, so the bass one.
    expect(tuningSelect()).toHaveValue('bass-4-standard');
    await fireEvent.change(stringsSelect(), { target: { value: '6' } });
    // Now a bass: six strings give the six-string bass.
    expect(tuningSelect()).toHaveValue('bass-6-standard');
    expect(stringsOnNeck()).toBe(6);
    await expect.poll(saved).toMatchObject({ kind: 'bass', strings: 6, tuning: 'bass-6-standard' });
  });

  it('saves a custom tuning, keeps it after a restart and deletes it', async () => {
    const first = await startApp(storage);
    await fireEvent.change(stringsSelect(), { target: { value: '5' } });
    await fireEvent.click(panel().getByRole('button', { name: 'New tuning' }));

    const editor = within(panel().getByRole('form', { name: 'New tuning' }));
    // It starts from the selected tuning.
    expect(editor.getByRole('combobox', { name: 'String 5 note' })).toHaveDisplayValue('B');
    expect(editor.getByRole('spinbutton', { name: 'String 5 octave' })).toHaveValue(0);
    await fireEvent.input(editor.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Low A' },
    });
    // Low string down to A0.
    await fireEvent.change(editor.getByRole('combobox', { name: 'String 5 note' }), {
      target: { value: '9' },
    });
    await fireEvent.click(editor.getByRole('button', { name: 'Save' }));

    await expect.poll(() => tuningSelect()).toHaveValue('bass-5-low-a');
    expect(screen.queryByRole('form', { name: 'New tuning' })).toBeNull();
    const own = within(tuningSelect()).getByRole('group', { name: 'Your tunings' });
    expect(within(own).getByRole('option', { name: 'Low A (bass)' })).toBeInTheDocument();
    // The neck shows it: A0 open on string 5, so E on fret 7.
    expect(dotAt(5, 7)?.label).toBe('E');
    expect(await storage.read(USER_TUNINGS_DOCUMENT)).toMatch(
      /id = "bass-5-low-a"\nname = "Low A"\nkind = "bass"\nnotes = \["A0", "E1", "A1", "D2", "G2"\]/,
    );
    first.unmount();

    // A restart: the core forgets the user tunings and a fresh app reads them back.
    setUserTunings('');
    expect(getTuning('bass-5-low-a')).toBeUndefined();
    await startApp(new BrowserStorage(window.localStorage));
    expect(tuningSelect()).toHaveValue('bass-5-low-a');
    expect(offered()).toContain('Low A (bass)');
    expect(dotAt(5, 7)?.label).toBe('E');

    await fireEvent.click(panel().getByRole('button', { name: 'Delete' }));
    await fireEvent.click(panel().getByRole('button', { name: 'Delete tuning' }));
    // Deleting the selected tuning falls back to the string count's standard.
    await expect.poll(() => tuningSelect()).toHaveValue('bass-5-standard');
    expect(offered()).not.toContain('Low A (bass)');
    expect(getTuning('bass-5-low-a')).toBeUndefined();
    expect(await storage.read(USER_TUNINGS_DOCUMENT)).not.toMatch(/\[\[tuning\]\]/);
    expect(dotAt(5, 5)?.label).toBe('E');
    await expect.poll(saved).toMatchObject({ tuning: 'bass-5-standard' });
  });

  it('renames a custom tuning in place, keeping its id and the selection', async () => {
    await storage.write(
      USER_TUNINGS_DOCUMENT,
      '[[tuning]]\nid = "guitar-6-mine"\nname = "Mine"\nkind = "guitar"\nnotes = ["D2", "A2", "D3", "G3", "B3", "E4"]\n',
    );
    await storage.write(
      SETTINGS_DOCUMENT,
      settingsWith((s) => {
        s.instrument.tuning = 'guitar-6-mine';
      }),
    );
    await startApp(storage);
    await fireEvent.click(panel().getByRole('button', { name: 'Edit' }));
    const editor = within(panel().getByRole('form', { name: 'Edit tuning' }));
    await fireEvent.input(editor.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Still mine' },
    });
    await fireEvent.click(editor.getByRole('button', { name: 'Save' }));

    await expect.poll(offered).toContain('Still mine (guitar)');
    expect(offered()).not.toContain('Mine (guitar)');
    expect(tuningSelect()).toHaveValue('guitar-6-mine');
    expect(getTuning('guitar-6-mine')?.name).toBe('Still mine');
  });

  it('shows the core’s message for a tuning it refuses, and saves nothing', async () => {
    await startApp(storage);
    await fireEvent.click(panel().getByRole('button', { name: 'New tuning' }));
    const editor = within(panel().getByRole('form', { name: 'New tuning' }));
    await fireEvent.input(editor.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Too high' },
    });
    await fireEvent.input(editor.getByRole('spinbutton', { name: 'String 1 octave' }), {
      target: { value: '6' },
    });
    await fireEvent.click(editor.getByRole('button', { name: 'Save' }));
    expect(await editor.findByRole('alert')).toHaveTextContent(
      '“Too high”: open string E6 is outside the range C0 to C6',
    );
    expect(await storage.read(USER_TUNINGS_DOCUMENT)).toBeNull();
    expect(tuningSelect()).toHaveValue('guitar-6-standard');
  });

  it('keeps a tunings file with broken items as a backup before rewriting it', async () => {
    const broken =
      '[[tuning]]\nid = "bass-3"\nname = "Three"\nkind = "bass"\nnotes = ["E1", "A1", "D2"]\n';
    await storage.write(USER_TUNINGS_DOCUMENT, broken);
    await startApp(storage);
    await fireEvent.click(panel().getByRole('button', { name: 'New tuning' }));
    const editor = within(panel().getByRole('form', { name: 'New tuning' }));
    await fireEvent.input(editor.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Fine' },
    });
    await fireEvent.click(editor.getByRole('button', { name: 'Save' }));
    await expect.poll(() => tuningSelect()).toHaveValue('guitar-6-fine');
    expect(await storage.read(USER_TUNINGS_BACKUP_DOCUMENT)).toBe(broken);
    expect(screen.getByText(/old file was kept as tunings-backup\.toml/)).toBeInTheDocument();
  });

  it('clamps the capo when the neck gets shorter, and refuses fret counts out of range', async () => {
    await startApp(storage);
    const frets = panel().getByRole('spinbutton', { name: 'Frets' });
    const capo = panel().getByRole('spinbutton', { name: 'Capo fret' });

    await fireEvent.change(capo, { target: { value: '15' } });
    expect(Math.min(...dots().map((d) => d.fret))).toBe(15);
    await fireEvent.change(frets, { target: { value: '12' } });
    expect(capo).toHaveValue(11);
    expect(capo).toHaveAttribute('max', '11');
    expect(Math.max(...dots().map((d) => d.fret))).toBe(12);
    await expect.poll(saved).toMatchObject({ frets: 12, capo: 11 });

    await fireEvent.change(frets, { target: { value: '30' } });
    expect(panel().getByRole('alert')).toHaveTextContent('from 12 to 27');
    expect(frets).toHaveValue(12);
    await fireEvent.change(capo, { target: { value: '12' } });
    expect(panel().getByText('The capo goes on fret 0 (none) to 11.')).toBeInTheDocument();
    expect(capo).toHaveValue(11);

    await fireEvent.change(frets, { target: { value: '27' } });
    expect(Math.max(...dots().map((d) => d.fret))).toBe(27);
    expect(panel().queryByText(/from 12 to 27/)).toBeNull();
  });

  it('mirrors the neck for left-handed players and saves it', async () => {
    await startApp(storage);
    const before = dotAt(6, 0)!.x;
    expect(before).toBeLessThan(dotAt(6, 12)!.x);
    await fireEvent.click(panel().getByRole('checkbox', { name: /Left-handed/ }));
    expect(dotAt(6, 0)!.x).toBeGreaterThan(dotAt(6, 12)!.x);
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/left_handed = true/);
  });

  it('applies and saves the theme', async () => {
    await startApp(storage);
    expect(panel().getByRole('radio', { name: 'System' })).toBeChecked();
    await fireEvent.click(panel().getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/theme = "dark"/);
    await fireEvent.click(panel().getByRole('radio', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('lists the user tunings under their own group with their kind', async () => {
    await storage.write(
      USER_TUNINGS_DOCUMENT,
      '[[tuning]]\nid = "guitar-6-x"\nname = "X"\nkind = "guitar"\nnotes = ["E2", "A2", "D3", "G3", "B3", "E4"]\n',
    );
    await startApp(storage);
    const own = within(tuningSelect()).getByRole('group', { name: 'Your tunings' });
    expect(
      within(own)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['X (guitar)']);
    // Other string counts don't offer it.
    await fireEvent.change(stringsSelect(), { target: { value: '7' } });
    expect(within(tuningSelect()).queryByRole('group', { name: 'Your tunings' })).toBeNull();
  });
});
