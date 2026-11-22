// The chord editor in the real app, with the real WASM core: made, edited and deleted from the
// chord panel's root-and-quality picker, saved through Storage (ADR-36).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, chordsPage } from '../../test-shell';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { lookupChords, setUserChords, setUserScales, setUserTunings } from '../theory';
import { USER_CHORDS_DOCUMENT } from '../user-catalogs.svelte';

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
  render(App, { storage });
  await appReady();
}

const panel = chordPicker;
const quality = () => panel().getByRole('combobox', { name: 'Chord quality' });
const dialog = () => within(screen.getByRole('dialog', { name: /^(New|Edit) chord$/ }));
const lower = () => within(dialog().getByRole('group', { name: 'Intervals up to the octave' }));
const upper = () => within(dialog().getByRole('group', { name: 'Intervals above the octave' }));
const type = (name: string, value: string) =>
  fireEvent.input(dialog().getByRole('textbox', { name }), { target: { value } });
const save = () => fireEvent.click(dialog().getByRole('button', { name: 'Save' }));
/** Saving writes to storage first: wait until the dialog has closed. */
const closed = () =>
  waitFor(() => expect(screen.queryByRole('dialog', { name: /^(New|Edit) chord$/ })).toBeNull());

/** The chord names in the quality list's group `family`. */
function listed(family: string): string[] {
  const group = quality().querySelector(`optgroup[label="${family}"]`);
  return [...(group?.querySelectorAll('option') ?? [])].map((o) => o.dataset.name ?? '');
}

/** Opens the editor and makes 1 3 ♭7 ♯9 called `name` with the symbol `symbol`. */
async function makeHendrix(name = 'Hendrix', symbol = 'hx') {
  await fireEvent.click(panel().getByRole('button', { name: 'New chord' }));
  await type('Name', name);
  await type('Symbol', symbol);
  await fireEvent.click(lower().getByRole('button', { name: '3' }));
  await fireEvent.click(lower().getByRole('button', { name: '♭7' }));
  await fireEvent.click(upper().getByRole('button', { name: '♯9' }));
  await save();
}

afterEach(() => {
  cleanup();
  setUserChords('');
  setUserScales('');
  setUserTunings('');
});

describe.each(implementations)('The chord editor (%s storage)', (_label, fixture) => {
  let open: () => Storage;

  beforeEach(() => {
    open = fixture();
  });

  it('saves a chord that is chosen, listed, typeable and still there after a restart', async () => {
    await startApp(open());
    await makeHendrix();

    await closed();
    expect(listed('Custom')).toEqual(['Hendrix']);
    expect(quality()).toHaveValue('hendrix');
    expect(chordsPage().getByRole('heading', { name: 'Chx' })).toBeInTheDocument();
    const text = await open().read(USER_CHORDS_DOCUMENT);
    expect(text).toContain('id = "hendrix"');
    expect(text).toContain('symbol = "hx"');
    expect(text).toContain('intervals = ["1", "3", "b7", "#9"]');

    // A restart: a new app over the same stored files, with a fresh core catalog.
    cleanup();
    setUserChords('');
    await startApp(open());
    expect(listed('Custom')).toEqual(['Hendrix']);
    // Typed, and found by reverse lookup (C E B♭ D♯).
    await fireEvent.click(panel().getByRole('radio', { name: 'Typed symbol' }));
    await fireEvent.input(panel().getByRole('textbox', { name: 'Chord symbol' }), {
      target: { value: 'Chx' },
    });
    expect(chordsPage().getByRole('heading', { name: 'Chx' })).toBeInTheDocument();
    expect(lookupChords([0, 4, 10, 3], 0, 'sharps').map((m) => m.chordId)).toContain('hendrix');
  });
});

describe('The chord editor', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    await startApp(storage);
  });

  it('refuses a symbol another chord has, inline, and keeps the form open', async () => {
    await makeHendrix('Hendrix', 'm7');
    expect(await dialog().findByRole('alert')).toHaveTextContent(
      'the symbol "m7" already means the chord "Minor seventh"',
    );
    expect(await storage.read(USER_CHORDS_DOCUMENT)).toBeNull();

    // Fixed, it saves.
    await type('Symbol', 'hx');
    await save();
    await closed();
    expect(listed('Custom')).toEqual(['Hendrix']);
  });

  it('closes on Escape without saving', async () => {
    await fireEvent.click(panel().getByRole('button', { name: 'New chord' }));
    await type('Name', 'Gone');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await closed();
    expect(await storage.read(USER_CHORDS_DOCUMENT)).toBeNull();
  });

  it('edits and deletes only the user’s chords', async () => {
    await fireEvent.change(quality(), { target: { value: 'maj7' } });
    expect(panel().queryByRole('button', { name: 'Edit chord' })).toBeNull();
    await makeHendrix();
    await closed();

    await fireEvent.click(panel().getByRole('button', { name: 'Edit chord' }));
    expect(dialog().getByRole('textbox', { name: 'Name' })).toHaveValue('Hendrix');
    expect(dialog().getByRole('textbox', { name: 'Symbol' })).toHaveValue('hx');
    await type('Jazz symbol', 'HX');
    await fireEvent.input(dialog().getByRole('combobox', { name: 'Family' }), {
      target: { value: 'Rock' },
    });
    await save();
    await closed();
    expect(listed('Rock')).toEqual(['Hendrix']);
    expect(listed('Custom')).toEqual([]);
    expect(quality()).toHaveValue('hendrix');
    await fireEvent.click(panel().getByRole('radio', { name: /^Jazz/ }));
    expect(chordsPage().getByRole('heading', { name: 'CHX' })).toBeInTheDocument();

    await fireEvent.click(panel().getByRole('button', { name: 'Delete chord' }));
    await fireEvent.click(panel().getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(quality()).toHaveValue(''));
    expect(listed('Rock')).toEqual([]);
    expect(panel().queryByRole('button', { name: 'Edit chord' })).toBeNull();
    expect(await storage.read(USER_CHORDS_DOCUMENT)).not.toContain('[[chord]]');
  });
});

describe('Broken chord files', () => {
  it('are listed with the other files’ problems', async () => {
    window.localStorage.clear();
    const storage = new BrowserStorage(window.localStorage);
    await storage.write(
      USER_CHORDS_DOCUMENT,
      '[[chord]]\nid = "bad"\nname = "Bad"\nsymbol = "bad"\nintervals = ["1"]\n',
    );
    await startApp(storage);
    expect(
      screen.getByText('One problem with your files: some items or tag rules were not used'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'chords.toml: chord 1 ("bad"): a chord needs at least one note besides the root',
      ),
    ).toBeInTheDocument();
    cleanup();
  });
});
