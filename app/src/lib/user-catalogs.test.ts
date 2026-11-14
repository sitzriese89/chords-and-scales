import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserStorage, StorageError, type Storage } from './storage';
import { getTuning, setUserScales, setUserTunings, type Tuning } from './theory';
import { USER_SCALES_DOCUMENT, USER_TUNINGS_DOCUMENT, UserCatalogs } from './user-catalogs.svelte';

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
