import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserStorage, StorageError, TauriStorage, type Storage } from './storage';
import { fakeCommands } from './storage/fake-commands';
import {
  getScale,
  getTuning,
  listScales,
  setUserScales,
  setUserTunings,
  type ScaleInput,
  type Tuning,
} from './theory';
import {
  USER_SCALES_BACKUP_DOCUMENT,
  USER_SCALES_DOCUMENT,
  USER_TUNINGS_DOCUMENT,
  UserCatalogs,
} from './user-catalogs.svelte';

const blues: ScaleInput = { id: 'my-blues', name: 'My blues', intervals: ['1', '♭3', '4', '5'] };

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

describe.each(implementations)('UserCatalogs scales (%s storage)', (_label, fixture) => {
  let open: () => Storage;

  beforeEach(() => {
    open = fixture();
  });

  afterEach(() => {
    setUserScales('');
  });

  it('saves the user scales, loads them into the core and keeps them over a restart', async () => {
    const catalogs = new UserCatalogs(open());
    await catalogs.load();
    await catalogs.saveUserScales([blues]);
    expect(catalogs.revision).toBe(2);
    expect(catalogs.userScales).toEqual([expect.objectContaining({ id: 'my-blues' })]);
    expect(getScale('my-blues')).toMatchObject({ family: 'Custom', builtIn: false });
    expect(
      listScales()
        .at(-1)
        ?.scales.map((s) => s.name),
    ).toEqual(['My blues']);
    expect(await open().read(USER_SCALES_DOCUMENT)).toContain('id = "my-blues"');

    setUserScales('');
    const again = new UserCatalogs(open());
    await again.load();
    expect(again.userScales.map((s) => s.intervals)).toEqual([['1', '♭3', '4', '5']]);
    expect(getScale('my-blues')?.name).toBe('My blues');
  });

  it('changes nothing when the core refuses a scale', async () => {
    const catalogs = new UserCatalogs(open());
    await catalogs.load();
    await expect(catalogs.saveUserScales([{ ...blues, intervals: ['1'] }])).rejects.toThrow(
      /at least one note besides the root/,
    );
    await expect(catalogs.saveUserScales([{ ...blues, name: 'Blues' }])).rejects.toThrow(
      'there is already a scale called "Blues"',
    );
    expect(catalogs.revision).toBe(1);
    expect(catalogs.userScales).toEqual([]);
    expect(await open().read(USER_SCALES_DOCUMENT)).toBeNull();
  });

  it('keeps a file with broken items as scales-backup.toml before the first save', async () => {
    const broken = '[[scale]]\nid = "bad"\nname = "Bad"\nintervals = ["1", "5", "3"]\n';
    await open().write(USER_SCALES_DOCUMENT, broken);
    const catalogs = new UserCatalogs(open());
    await catalogs.load();
    expect(catalogs.problems).toEqual([expect.stringMatching(/^scales\.toml: scale 1/)]);

    await catalogs.saveUserScales([blues]);
    expect(await open().read(USER_SCALES_BACKUP_DOCUMENT)).toBe(broken);
    expect(catalogs.problems).toEqual([
      'scales.toml had scales that could not be loaded; the old file was kept as scales-backup.toml.',
    ]);
    // Only once: a later save leaves the backup alone.
    await catalogs.saveUserScales([]);
    expect(await open().read(USER_SCALES_BACKUP_DOCUMENT)).toBe(broken);
  });
});

const mine: Tuning = { id: 'bass-4-mine', name: 'Mine', kind: 'bass', notes: [26, 33, 38, 43] };

describe('UserCatalogs', () => {
  let storage: BrowserStorage;

  beforeEach(() => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
  });

  afterEach(() => {
    setUserScales('');
    setUserTunings('');
  });

  it('loads both documents, lists the problems and bumps the revision', async () => {
    await storage.write(USER_SCALES_DOCUMENT, '[[scale]]\nid = "x"\n');
    await storage.write(
      USER_TUNINGS_DOCUMENT,
      '[[tuning]]\nid = "bass-4-mine"\nname = "Mine"\nkind = "bass"\nnotes = ["D1", "A1", "D2", "G2"]\n',
    );
    const catalogs = new UserCatalogs(storage);
    expect(catalogs.revision).toBe(0);
    await catalogs.load();
    expect(catalogs.revision).toBe(1);
    expect(catalogs.userTunings).toEqual([mine]);
    expect(catalogs.problems).toEqual([expect.stringMatching(/^scales\.toml: scale 1/)]);
  });

  it('saves the user tunings, loads them into the core and bumps the revision', async () => {
    const catalogs = new UserCatalogs(storage);
    await catalogs.load();
    await catalogs.saveUserTunings([mine]);
    expect(catalogs.revision).toBe(2);
    expect(catalogs.userTunings).toEqual([mine]);
    expect(getTuning('bass-4-mine')).toEqual(mine);

    // A fresh start over the same storage reads them back.
    setUserTunings('');
    const again = new UserCatalogs(new BrowserStorage(window.localStorage));
    await again.load();
    expect(again.userTunings).toEqual([mine]);
  });

  it('changes nothing when the core refuses a tuning or the storage fails', async () => {
    const catalogs = new UserCatalogs(storage);
    await catalogs.load();
    await expect(catalogs.saveUserTunings([{ ...mine, notes: [26] }])).rejects.toThrow(/1 strings/);

    const failing: Storage = {
      read: async () => null,
      write: async () => {
        throw new StorageError('disk full');
      },
      list: async () => [],
      delete: async () => {},
    };
    const broken = new UserCatalogs(failing);
    await broken.load();
    await expect(broken.saveUserTunings([mine])).rejects.toThrow('disk full');
    expect(broken.userTunings).toEqual([]);
    expect(broken.revision).toBe(1);
    expect(getTuning('bass-4-mine')).toBeUndefined();
  });
});
