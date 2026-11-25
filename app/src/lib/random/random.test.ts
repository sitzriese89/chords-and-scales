// The random pick (SPEC §5.8, ADR-42): the pure pick with a seeded source, then Random scale and
// Random chord in the real app with the real WASM core (loaded in test-setup.ts).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { chordPicker, chordsPage, scalePicker, shownChordTags } from '../../test-shell';
import { chordSymbol } from '../chords/display';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage, type Storage } from '../storage';
import {
  chordTags,
  getChord,
  getScale,
  listChords,
  listScales,
  scaleTags,
  setUserTagRules,
  spellPitchClass,
  type Accidentals,
} from '../theory';
import { USER_TAG_RULES_DOCUMENT } from '../user-catalogs.svelte';
import { randomPick, seededRandom } from './pick';
import { rootPitchClass } from './root';

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe('randomPick', () => {
  it('always picks an item of the set and a pitch class 0–11', () => {
    const set = items('a', 'b', 'c');
    const random = seededRandom(1);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const pick = randomPick(set, null, random)!;
      expect(set).toContain(pick.item);
      expect(Number.isInteger(pick.pitchClass)).toBe(true);
      expect(pick.pitchClass).toBeGreaterThanOrEqual(0);
      expect(pick.pitchClass).toBeLessThan(12);
      seen.add(`${pick.item.id}:${pick.pitchClass}`);
    }
    // Every pair comes up.
    expect(seen.size).toBe(36);
  });

  it('never repeats the current pair while there is another', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const pick = randomPick(items('a', 'b'), { id: 'b', pitchClass: 4 }, random)!;
      expect(`${pick.item.id}:${pick.pitchClass}`).not.toBe('b:4');
    }
    // With one item, only the root changes.
    const roots = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const pick = randomPick(items('a'), { id: 'a', pitchClass: 0 }, random)!;
      expect(pick.item.id).toBe('a');
      expect(pick.pitchClass).not.toBe(0);
      roots.add(pick.pitchClass);
    }
    expect([...roots].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('ignores a current pair outside the set and works with the edges of [0, 1)', () => {
    expect(randomPick(items('a'), { id: 'z', pitchClass: 0 }, () => 0)).toEqual({
      item: { id: 'a' },
      pitchClass: 0,
    });
    expect(randomPick(items('a', 'b'), null, () => 0.9999999999)).toEqual({
      item: { id: 'b' },
      pitchClass: 11,
    });
    expect(randomPick(items('a', 'b'), { id: 'b', pitchClass: 11 }, () => 0.9999999999)).toEqual({
      item: { id: 'b' },
      pitchClass: 10,
    });
    expect(randomPick(items('a'), { id: 'a', pitchClass: -1 }, () => 0)?.pitchClass).toBe(0);
  });

  it('picks nothing from an empty set', () => {
    expect(randomPick([], null, seededRandom(1))).toBeUndefined();
  });

  it('is the same sequence for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

const NEVER = `[tag.never]
scale-threshold = 1000
chord-threshold = 1000
weights = { b2 = 1 }
`;

async function startApp(
  storage: Storage,
  seed: number,
  change: (settings: Settings) => void = () => {},
) {
  const settings = defaultSettings();
  settings.lastView = { root: 'C', scale: 'major' };
  settings.tab.highlight = false;
  change(settings);
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  const result = render(App, { storage, random: seededRandom(seed) });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

const picker = scalePicker;
const scaleList = () => picker().getByRole('listbox', { name: 'Scale' });
const rootInput = () => picker().getByRole('combobox', { name: 'Root' });
const scaleChips = () => within(picker().getByRole('group', { name: 'Filter scales by tag' }));
const randomScale = () => picker().getByRole('button', { name: 'Random scale' });
const panel = chordPicker;
const chordRoot = () => panel().getByRole('combobox', { name: 'Chord root' });
const quality = () => panel().getByRole('combobox', { name: 'Chord quality' });
const chordChips = () => within(panel().getByRole('group', { name: 'Filter chords by tag' }));
const randomChord = () => panel().getByRole('button', { name: 'Random chord' });

const scalesWith = (tag: string) =>
  listScales()
    .flatMap((f) => f.scales)
    .filter((s) => scaleTags(s.id).includes(tag))
    .map((s) => s.id);
const chordsWith = (tag: string) =>
  listChords()
    .flatMap((f) => f.chords)
    .filter((c) => chordTags(c.id).includes(tag))
    .map((c) => c.id);
/** The 12 roots as the core spells them in a preference. */
const spelled = (accidentals: Accidentals) =>
  Array.from({ length: 12 }, (_, pc) => spellPitchClass(pc, accidentals));

// Each pick re-renders the whole app in jsdom; the pure pick above runs thousands.
const PICKS = 15;

afterEach(() => {
  cleanup();
  setUserTagRules('');
});

describe('Random scale and Random chord', { timeout: 30_000 }, () => {
  let storage: Storage;

  beforeEach(() => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
  });

  it('picks a root and a scale with the chips’ tags, shows them and saves them', async () => {
    await startApp(storage, 3);
    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    const dark = scalesWith('dark');
    expect(dark.length).toBeGreaterThan(1);
    const roots = spelled('sharps');
    const seen = new Set<string>();
    let previous = 'C major';
    for (let i = 0; i < PICKS; i++) {
      await fireEvent.click(randomScale());
      const scale = (scaleList() as HTMLSelectElement).value;
      const root = (rootInput() as HTMLInputElement).value;
      expect(dark).toContain(scale);
      expect(roots).toContain(root);
      expect(`${root} ${scale}`).not.toBe(previous);
      previous = `${root} ${scale}`;
      seen.add(scale);
      // Applied as if picked: the neck's title, and the settings file.
      expect(
        screen.getByRole('heading', { name: `${root} ${getScale(scale)!.name}` }),
      ).toBeInTheDocument();
    }
    expect(seen.size).toBeGreaterThan(1);
    const saved = (await storage.read(SETTINGS_DOCUMENT))!;
    expect(saved).toContain(`scale = "${(scaleList() as HTMLSelectElement).value}"`);
    expect(saved).toContain(`root = "${(rootInput() as HTMLInputElement).value}"`);
  });

  it('spells the root by the flat preference and draws only from what the search shows', async () => {
    await startApp(storage, 11, (s) => {
      s.accidentals = 'flats';
    });
    await fireEvent.input(picker().getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'phrygian' },
    });
    const shown = [...scaleList().querySelectorAll('option')].map((o) => o.value);
    expect(shown).toContain('phrygian');
    expect(shown.length).toBeLessThan(listScales().flatMap((f) => f.scales).length);
    const flats = spelled('flats');
    const pitchClasses = new Set<number>();
    for (let i = 0; i < PICKS; i++) {
      await fireEvent.click(randomScale());
      expect(shown).toContain((scaleList() as HTMLSelectElement).value);
      const root = (rootInput() as HTMLInputElement).value;
      expect(flats).toContain(root);
      pitchClasses.add(rootPitchClass(root));
    }
    expect(pitchClasses.size).toBeGreaterThan(6);
    expect([...pitchClasses].every((pc) => pc >= 0 && pc < 12)).toBe(true);
  });

  it('never picks a current scale that the chips hide', async () => {
    await startApp(storage, 5);
    expect(scaleTags('major')).not.toContain('dark');
    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    // Major is kept in the list, but is not in the random set.
    expect(scaleList().querySelector('option[value="major"][data-hidden]')).not.toBeNull();
    for (let i = 0; i < PICKS; i++) {
      await fireEvent.click(randomScale());
      expect((scaleList() as HTMLSelectElement).value).not.toBe('major');
    }
  });

  it('picks a root and a quality with the chips’ tags and chooses them', async () => {
    await startApp(storage, 9);
    await fireEvent.click(chordChips().getByRole('button', { name: 'jazzy' }));
    const jazzy = chordsWith('jazzy');
    expect(jazzy.length).toBeGreaterThan(1);
    const roots = spelled('sharps');
    const seen = new Set<string>();
    let previous = '';
    for (let i = 0; i < PICKS; i++) {
      await fireEvent.click(randomChord());
      const chord = (quality() as HTMLSelectElement).value;
      const root = (chordRoot() as HTMLSelectElement).value;
      expect(jazzy).toContain(chord);
      expect(roots).toContain(root);
      expect(`${root} ${chord}`).not.toBe(previous);
      previous = `${root} ${chord}`;
      seen.add(chord);
      // The panel shows the chord: its symbol, its notes and its tags.
      const symbol = chordSymbol(root, getChord(chord)!, 'standard');
      expect(chordsPage().getByRole('heading', { level: 2, name: symbol })).toBeInTheDocument();
      expect(chordsPage().getByLabelText(`Notes of ${symbol}`)).toBeInTheDocument();
      expect(shownChordTags(symbol)).toEqual(chordTags(chord));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('offers Random chord with root and quality, where the chips are', async () => {
    await startApp(storage, 2);
    await fireEvent.click(panel().getByRole('radio', { name: 'Typed symbol' }));
    expect(panel().queryByRole('button', { name: 'Random chord' })).toBeNull();
    await fireEvent.click(panel().getByRole('radio', { name: 'Root and quality' }));
    await fireEvent.click(randomChord());
    expect((quality() as HTMLSelectElement).value).not.toBe('');
    expect(chordsPage().getByLabelText(/^Notes of /)).toBeInTheDocument();
  });

  it('is disabled, and says why, when nothing has the tags', async () => {
    await storage.write(USER_TAG_RULES_DOCUMENT, NEVER);
    await startApp(storage, 1);
    expect(randomScale()).toBeEnabled();
    expect(randomChord()).toBeEnabled();

    await fireEvent.click(scaleChips().getByRole('button', { name: 'never' }));
    expect(randomScale()).toBeDisabled();
    expect(randomScale()).toHaveAccessibleDescription('No scale has the tag never.');
    expect(picker().getByText('No scale has the tag never.')).toBeVisible();
    // The view is left alone.
    expect(screen.getByRole('heading', { name: 'C Major' })).toBeInTheDocument();

    await fireEvent.click(chordChips().getByRole('button', { name: 'never' }));
    expect(randomChord()).toBeDisabled();
    expect(randomChord()).toHaveAccessibleDescription('No chord has the tag never.');
    expect(panel().getByText('No chord has the tag never.')).toBeVisible();

    await fireEvent.click(scaleChips().getByRole('button', { name: 'Clear tags' }));
    expect(randomScale()).toBeEnabled();
    expect(randomScale()).not.toHaveAccessibleDescription();
  });
});
