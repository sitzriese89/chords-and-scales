// The tag filters in the real app, with the real WASM core (loaded in test-setup.ts): chips in
// the scale picker and the chord picker, tags on every item, the user rules file `tags.toml`
// loaded through Storage (ADR-41).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { chordPicker, chordsPage, scalePicker, shownChordTags } from '../../test-shell';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings } from '../settings';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { chordTags, getScale, listChords, listScales, scaleTags, setUserTagRules } from '../theory';
import { USER_TAG_RULES_DOCUMENT, UserCatalogs } from '../user-catalogs.svelte';
import { HIDDEN_BY_TAGS, TagFilters, tagList, withTags } from './filter.svelte';

/** Each Storage implementation, as a way to open it again on the same data (a restart). */
const implementations: [label: string, open: () => () => Storage][] = [
  [
    'browser',
    () => {
      window.localStorage.clear();
      return () => new BrowserStorage(window.localStorage);
    },
  ],
  [
    'Tauri',
    () => {
      const folder = new Map<string, string>();
      return () => new TauriStorage(fakeCommands(folder));
    },
  ],
];

async function startApp(storage: Storage) {
  const settings = defaultSettings();
  settings.lastView = { root: 'C', scale: 'major' };
  settings.tab.highlight = false;
  if ((await storage.read(SETTINGS_DOCUMENT)) === null) {
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  }
  const result = render(App, { storage });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

const picker = scalePicker;
const scaleList = () => picker().getByRole('listbox', { name: 'Scale' });
const scaleChips = () => within(picker().getByRole('group', { name: 'Filter scales by tag' }));
const panel = chordPicker;
const quality = () => panel().getByRole('combobox', { name: 'Chord quality' });
const chordChips = () => within(panel().getByRole('group', { name: 'Filter chords by tag' }));

/** The chip names of a chip group, without "Clear tags". */
const chipNames = (chips: ReturnType<typeof scaleChips>) =>
  chips
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-pressed'))
    .map((b) => b.textContent?.trim());

/** The ids a picker lists as passing the filter, in order: not a kept current item. */
const listedIds = (select: HTMLElement) =>
  [...select.querySelectorAll('option:not([data-hidden])')]
    .map((o) => (o as HTMLOptionElement).value)
    .filter((v) => v !== '');

/** The options kept in a picker although the chips hide them. */
const keptOptions = (select: HTMLElement) => [
  ...select.querySelectorAll<HTMLOptionElement>('option[data-hidden]'),
];

/** Every scale (or chord) id of the catalog with all of `tags`, from the core, in catalog order. */
const scalesWith = (...tags: string[]) =>
  listScales()
    .flatMap((f) => f.scales)
    .filter((s) => tags.every((t) => scaleTags(s.id).includes(t)))
    .map((s) => s.id);
const chordsWith = (...tags: string[]) =>
  listChords()
    .flatMap((f) => f.chords)
    .filter((c) => tags.every((t) => chordTags(c.id).includes(t)))
    .map((c) => c.id);

/** A second tag that narrows `first` without emptying it: [tag, items with both]. */
function narrowing(first: string, candidates: string[], having: (...t: string[]) => string[]) {
  const all = having(first);
  for (const tag of candidates) {
    if (tag === first) continue;
    const both = having(first, tag);
    if (both.length > 0 && both.length < all.length && both.length < having(tag).length) {
      return [tag, both] as const;
    }
  }
  throw new Error(`no tag narrows ${first}`);
}

const SPANISH = `[tag.spanish]
scale-threshold = 4
[tag.spanish.weights]
b2 = 2
3 = 2
`;

afterEach(() => {
  cleanup();
  setUserTagRules('');
});

describe('tag filters', () => {
  let storage: Storage;

  beforeEach(() => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
  });

  it('offers only scale tags in the scale picker and chord tags in the chord picker', async () => {
    await startApp(storage);
    const scaleTagNames = chipNames(scaleChips());
    expect(scaleTagNames).toContain('dark');
    expect(scaleTagNames).toContain('exotic');
    expect(scaleTagNames).not.toContain('jazzy');
    const chordTagNames = chipNames(chordChips());
    expect(chordTagNames).toContain('dark');
    expect(chordTagNames).toContain('jazzy');
    expect(chordTagNames).not.toContain('exotic');
  });

  it('shows every scale and chord with its tags', async () => {
    await startApp(storage);
    const phrygian = scaleList().querySelector<HTMLOptionElement>('option[value="phrygian"]')!;
    expect(scaleTags('phrygian')).toContain('dark');
    expect(phrygian.textContent).toBe(withTags('Phrygian', scaleTags('phrygian')));
    expect(phrygian.textContent).toMatch(/^Phrygian — .*dark/);
    const maj9 = quality().querySelector<HTMLOptionElement>('option[value="maj9"]')!;
    expect(maj9.textContent).toBe(withTags(maj9.dataset.name!, chordTags('maj9')));
    expect(maj9.textContent).toContain('jazzy');
    // The current scale's tags are under the list.
    expect(picker().getByText(/^Tags of Major: /)).toHaveTextContent(
      `Tags of Major: ${scaleTags('major').join(', ') || 'none'}`,
    );
  });

  it('filters the scales by one tag, then by two (AND), and clears', async () => {
    await startApp(storage);
    const everything = listedIds(scaleList());

    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    expect(scaleChips().getByRole('button', { name: 'dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const dark = scalesWith('dark');
    expect(listedIds(scaleList())).toEqual(dark);
    expect(dark).toContain('phrygian');
    expect(dark).toContain('locrian');
    expect(dark).not.toContain('major');

    const [second, both] = narrowing('dark', chipNames(scaleChips()) as string[], scalesWith);
    await fireEvent.click(scaleChips().getByRole('button', { name: second }));
    expect(listedIds(scaleList())).toEqual(both);

    await fireEvent.click(scaleChips().getByRole('button', { name: 'Clear tags' }));
    expect(listedIds(scaleList())).toEqual(everything);
    expect(scaleChips().queryByRole('button', { name: 'Clear tags' })).toBeNull();
  });

  it('combines the tags with the search', async () => {
    await startApp(storage);
    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    await fireEvent.input(picker().getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'phryg' },
    });
    const ids = listedIds(scaleList());
    expect(ids).toContain('phrygian');
    expect(ids.every((id) => scaleTags(id).includes('dark'))).toBe(true);

    await fireEvent.input(picker().getByRole('searchbox', { name: 'Search scales' }), {
      target: { value: 'zzz' },
    });
    expect(listedIds(scaleList())).toEqual([]);
    expect(picker().getByText('No scale with the tag dark matches “zzz”.')).toBeInTheDocument();
  });

  it('filters the chords by one tag, then by two (AND)', async () => {
    await startApp(storage);
    await fireEvent.click(chordChips().getByRole('button', { name: 'jazzy' }));
    const jazzy = chordsWith('jazzy');
    expect(listedIds(quality())).toEqual(jazzy);
    expect(jazzy).toContain('maj9');
    expect(jazzy).not.toContain('major');

    const [second, both] = narrowing('jazzy', chipNames(chordChips()) as string[], chordsWith);
    await fireEvent.click(chordChips().getByRole('button', { name: second }));
    expect(listedIds(quality())).toEqual(both);
    // The scale picker's chips are separate.
    expect(scaleChips().getByRole('button', { name: 'dark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps the current scale and chord when the chips hide them', async () => {
    await startApp(storage);
    await fireEvent.change(quality(), { target: { value: 'major' } });
    expect(chordsPage().getByRole('heading', { level: 2, name: 'C' })).toBeInTheDocument();
    expect(shownChordTags('C')).toEqual(chordTags('major'));

    expect(scaleTags('major')).not.toContain('dark');
    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    expect(listedIds(scaleList())).toEqual(scalesWith('dark'));
    // Major is still in its family, marked, and still the list's value.
    expect(keptOptions(scaleList()).map((o) => o.value)).toEqual(['major']);
    const major = keptOptions(scaleList())[0];
    expect(major.closest('optgroup')).toHaveAttribute('label', getScale('major')!.family);
    expect(major.textContent).toBe(`${withTags('Major', scaleTags('major'))} ${HIDDEN_BY_TAGS}`);
    expect(scaleList()).toHaveValue('major');
    expect(major.selected).toBe(true);
    expect(screen.getByRole('heading', { name: 'C Major' })).toBeInTheDocument();
    expect(
      picker().getByText('Major stays selected, but it doesn’t have every tag you picked.'),
    ).toBeInTheDocument();
    expect(await storage.read(SETTINGS_DOCUMENT)).toMatch(/scale = "major"/);

    expect(chordTags('major')).not.toContain('jazzy');
    await fireEvent.click(chordChips().getByRole('button', { name: 'jazzy' }));
    expect(listedIds(quality())).toEqual(chordsWith('jazzy'));
    expect(keptOptions(quality()).map((o) => o.value)).toEqual(['major']);
    expect(keptOptions(quality())[0].textContent).toMatch(/ \(hidden by tags\)$/);
    expect(quality()).toHaveValue('major');
    expect(chordsPage().getByRole('heading', { level: 2, name: 'C' })).toBeInTheDocument();
    expect(
      panel().getByText(/stays chosen, but it doesn’t have every tag you picked\.$/),
    ).toBeInTheDocument();

    // Picking a listed scale drops the kept one; clearing the chips unmarks it.
    await fireEvent.change(scaleList(), { target: { value: 'phrygian' } });
    expect(keptOptions(scaleList())).toEqual([]);
    expect(listedIds(scaleList())).not.toContain('major');
    await fireEvent.click(chordChips().getByRole('button', { name: 'Clear tags' }));
    expect(keptOptions(quality())).toEqual([]);
    expect(quality()).toHaveValue('major');
  });

  it('keeps a hidden current scale out of the filtered set the random pick uses', async () => {
    const filters = new TagFilters(new UserCatalogs(storage));
    filters.scales.toggle('dark');
    expect(filters.scales.items.map((s) => s.id)).toEqual(scalesWith('dark'));
    const kept = filters.scales.keeping(filters.scales.families, 'major');
    expect(kept.flatMap((f) => f.items.map((t) => t.item.id))).toEqual(
      listScales()
        .flatMap((f) => f.scales)
        .map((s) => s.id)
        .filter((id) => id === 'major' || scaleTags(id).includes('dark')),
    );
    expect(filters.scales.items.map((s) => s.id)).not.toContain('major');
    filters.chords.toggle('jazzy');
    expect(filters.chords.items.map((c) => c.id)).toEqual(chordsWith('jazzy'));
  });

  it('says so when no item has every tag picked', async () => {
    await storage.write(
      USER_TAG_RULES_DOCUMENT,
      `[tag.never]
scale-threshold = 1000
chord-threshold = 1000
weights = { b2 = 1 }
`,
    );
    await startApp(storage);
    await fireEvent.click(scaleChips().getByRole('button', { name: 'never' }));
    expect(listedIds(scaleList())).toEqual([]);
    expect(picker().getByText('No scale has the tag never.')).toBeInTheDocument();

    await fireEvent.click(chordChips().getByRole('button', { name: 'dark' }));
    await fireEvent.click(chordChips().getByRole('button', { name: 'never' }));
    expect(listedIds(quality())).toEqual([]);
    expect(panel().getByText('No chord has all of the tags dark and never.')).toBeInTheDocument();
  });

  it('lists the problems of the user rules file with the other file problems', async () => {
    await storage.write(
      USER_TAG_RULES_DOCUMENT,
      `${SPANISH}
[tag.dark.weights]
b9 = 1
`,
    );
    await startApp(storage);
    expect(
      screen.getByText('One problem with your files: some items or tag rules were not used'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^tags\.toml: tag "dark": unknown feature "b9"/)).toBeInTheDocument();
    // The rest of the file still applies.
    expect(chipNames(scaleChips())).toContain('spanish');
  });

  it('says a rules file that is not TOML could not be used', async () => {
    await storage.write(USER_TAG_RULES_DOCUMENT, '[tag.mine\n');
    await startApp(storage);
    expect(screen.getByText(/^tags\.toml: not valid TOML/)).toBeInTheDocument();
    expect(chipNames(scaleChips())).toContain('bright');
  });
});

describe.each(implementations)('the user rules file (%s storage)', (_label, fixture) => {
  let open: () => Storage;

  beforeEach(() => {
    open = fixture();
  });

  it('changes the tags after a reload when it is edited', async () => {
    const first = await startApp(open());
    expect(chipNames(scaleChips())).not.toContain('spanish');
    first.unmount();

    // The user adds a tag in tags.toml and restarts.
    await open().write(USER_TAG_RULES_DOCUMENT, SPANISH);
    const second = await startApp(open());
    expect(chipNames(scaleChips())).toContain('spanish');
    expect(chipNames(chordChips())).not.toContain('spanish');
    await fireEvent.click(scaleChips().getByRole('button', { name: 'spanish' }));
    const spanish = listedIds(scaleList());
    expect(spanish).toContain('phrygian-dominant');
    expect(spanish).not.toContain('phrygian');
    expect(scaleList().querySelector('option[value="phrygian-dominant"]')?.textContent).toContain(
      'spanish',
    );
    second.unmount();

    // Then makes Phrygian dark only at a threshold it can't reach, and restarts again.
    await open().write(
      USER_TAG_RULES_DOCUMENT,
      `${SPANISH}
[tag.dark]
scale-threshold = 1000
`,
    );
    await startApp(open());
    const phrygian = scaleList().querySelector('option[value="phrygian"]');
    expect(phrygian).not.toHaveTextContent('dark');
    await fireEvent.click(scaleChips().getByRole('button', { name: 'dark' }));
    expect(listedIds(scaleList())).toEqual([]);
  });
});

describe('tag text', () => {
  it('writes tags after a name and lists them', () => {
    expect(withTags('Phrygian', ['dark', 'sad'])).toBe('Phrygian — dark, sad');
    expect(withTags('Major', [])).toBe('Major');
    expect(tagList(['dark'])).toBe('dark');
    expect(tagList(['dark', 'sad', 'evil'])).toBe('dark, sad and evil');
  });
});
