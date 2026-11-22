// The scale editor in the real app, with the real WASM core (loaded in test-setup.ts): made,
// edited and deleted from the scale picker, saved through Storage (ADR-26).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { scalePicker } from '../../test-shell';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { setUserScales, setUserTunings } from '../theory';
import { USER_SCALES_DOCUMENT } from '../user-catalogs.svelte';

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
  const result = render(App, { storage });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

const picker = scalePicker;
/** The scale editor's dialog, over the picker's drawer. */
const EDITOR = { name: /^(New|Edit) scale$/ };
const scaleList = () => picker().getByRole('listbox', { name: 'Scale' });
const dialog = () => within(screen.getByRole('dialog', EDITOR));
const neckCell = (name: string) => dialog().getByRole('gridcell', { name });
const typeName = (name: string) =>
  fireEvent.input(dialog().getByRole('textbox', { name: 'Name' }), { target: { value: name } });
const save = () => fireEvent.click(dialog().getByRole('button', { name: 'Save' }));
/** Saving writes to storage first: wait until the dialog has closed. */
const closed = () => waitFor(() => expect(screen.queryByRole('dialog', EDITOR)).toBeNull());

/** The names in the picker's group `family`. */
function listed(family: string): string[] {
  const group = scaleList().querySelector(`optgroup[label="${family}"]`);
  return [...(group?.querySelectorAll('option') ?? [])].map((o) => o.dataset.name ?? '');
}

/** Opens the editor and clicks F and G on the low E string: with the root C, a 4 and a 5. */
async function makeSus(name: string) {
  await fireEvent.click(picker().getByRole('button', { name: 'New scale' }));
  await fireEvent.click(neckCell('String 6, fret 1'));
  await fireEvent.click(neckCell('String 6, fret 3'));
  await typeName(name);
  await save();
}

afterEach(() => {
  cleanup();
  setUserScales('');
  setUserTunings('');
});

describe.each(implementations)('The scale editor (%s storage)', (_label, fixture) => {
  let open: () => Storage;

  beforeEach(() => {
    open = fixture();
  });

  it('saves a scale made on the neck; it is in the picker and still there after a restart', async () => {
    await startApp(open());
    await makeSus('Sus');

    await closed();
    expect(listed('Custom')).toEqual(['Sus']);
    expect(scaleList()).toHaveValue('sus');
    expect(screen.getByRole('heading', { name: 'C Sus' })).toBeInTheDocument();
    const text = await open().read(USER_SCALES_DOCUMENT);
    expect(text).toContain('id = "sus"');
    expect(text).toContain('intervals = ["1", "4", "5"]');

    // A restart: a new app over the same stored files, with a fresh core catalog.
    cleanup();
    setUserScales('');
    await startApp(open());
    expect(listed('Custom')).toEqual(['Sus']);
    expect(scaleList()).toHaveValue('sus');
    expect(screen.getByRole('heading', { name: 'C Sus' })).toBeInTheDocument();
  });
});

describe('The scale editor', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
    await startApp(storage);
  });

  it('refuses a scale without notes, inline, and keeps the form open', async () => {
    await fireEvent.click(picker().getByRole('button', { name: 'New scale' }));
    await typeName('Empty');
    await save();
    expect(await dialog().findByRole('alert')).toHaveTextContent(
      '“Empty”: a scale needs at least one note besides the root',
    );
    expect(await storage.read(USER_SCALES_DOCUMENT)).toBeNull();

    // Fixed, it saves.
    await fireEvent.click(dialog().getByRole('button', { name: '♭3' }));
    await save();
    await closed();
    expect(listed('Custom')).toEqual(['Empty']);
  });

  it('refuses a duplicate name, inline: a built-in one or one of the user’s', async () => {
    await fireEvent.click(picker().getByRole('button', { name: 'New scale' }));
    await fireEvent.click(neckCell('String 6, fret 3'));
    await typeName('dorian');
    await save();
    expect(await dialog().findByRole('alert')).toHaveTextContent(
      'there is already a scale called "dorian"',
    );
    await fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));

    await makeSus('Sus');
    await closed();
    await makeSus(' SUS ');
    expect(await dialog().findByRole('alert')).toHaveTextContent('there is already a scale called');
    expect(listed('Custom')).toEqual(['Sus']);
  });

  it('closes on Escape without saving', async () => {
    await fireEvent.click(picker().getByRole('button', { name: 'New scale' }));
    await typeName('Gone');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await closed();
    expect(await storage.read(USER_SCALES_DOCUMENT)).toBeNull();
  });

  it('edits and deletes only the user’s scales', async () => {
    expect(picker().queryByRole('button', { name: 'Edit scale' })).toBeNull();
    await makeSus('Sus');
    await closed();

    await fireEvent.click(picker().getByRole('button', { name: 'Edit scale' }));
    expect(dialog().getByRole('textbox', { name: 'Name' })).toHaveValue('Sus');
    // The 4 (F) comes out, a 2 goes in.
    await fireEvent.click(neckCell('String 6, fret 1, 4'));
    await fireEvent.click(dialog().getByRole('button', { name: '2' }));
    await typeName('Sus 2');
    await save();
    await closed();
    expect(listed('Custom')).toEqual(['Sus 2']);
    // The id stays, so the view keeps showing it.
    expect(scaleList()).toHaveValue('sus');
    expect(await storage.read(USER_SCALES_DOCUMENT)).toContain('intervals = ["1", "2", "5"]');

    await fireEvent.click(picker().getByRole('button', { name: 'Delete scale' }));
    await fireEvent.click(picker().getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(scaleList()).toHaveValue('major'));
    expect(listed('Custom')).toEqual([]);
    expect(picker().queryByRole('button', { name: 'Edit scale' })).toBeNull();
    expect(await storage.read(USER_SCALES_DOCUMENT)).not.toContain('[[scale]]');
  });
});
