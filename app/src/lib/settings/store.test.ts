import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserStorage, StorageError, type Storage } from '../storage';
import { defaultSettings, parseSettings, serializeSettings } from './schema';
import { SETTINGS_BACKUP_DOCUMENT, SETTINGS_DOCUMENT, SettingsStore } from './store.svelte';

/** A store as the app creates it on start: a new Storage on the same localStorage. */
async function startApp(): Promise<SettingsStore> {
  const store = new SettingsStore(new BrowserStorage(window.localStorage));
  await store.load();
  return store;
}

const storage = () => new BrowserStorage(window.localStorage);

describe('SettingsStore', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts with the defaults and writes them as a hand-editable file', async () => {
    const store = await startApp();
    expect(store.current).toEqual(defaultSettings());
    expect(store.warning).toBeNull();
    expect(store.loaded).toBe(true);
    expect(await storage().read(SETTINGS_DOCUMENT)).toBe(serializeSettings(defaultSettings()));
  });

  it('keeps changed settings across an app restart', async () => {
    const first = await startApp();
    await first.update({ theme: 'dark', instrument: { frets: 22, capo: 2 } });
    await first.update({ lastView: { root: 'Db', scale: 'dorian' }, leftHanded: true });

    const second = await startApp();
    expect(second.warning).toBeNull();
    expect(second.current).toEqual({
      ...defaultSettings(),
      theme: 'dark',
      leftHanded: true,
      instrument: { ...defaultSettings().instrument, frets: 22, capo: 2 },
      lastView: { root: 'Db', scale: 'dorian' },
    });
  });

  it('refuses a change the file could not hold, leaving settings as they were', async () => {
    const store = await startApp();
    await expect(store.update({ instrument: { frets: 99 } })).rejects.toThrow(/frets/);
    expect(store.current.instrument.frets).toBe(24);
    expect(parseSettings((await storage().read(SETTINGS_DOCUMENT))!)).toMatchObject({
      ok: true,
      settings: defaultSettings(),
    });
  });

  it.each([
    ['a corrupt file', 'this is [not toml'],
    ['an old-version file', 'version = 0\n[display]\ntheme = "dark"\n'],
    ['a file from a newer app', 'version = 7\n'],
  ])('loads defaults with a warning for %s and keeps the file as a backup', async (_, text) => {
    await storage().write(SETTINGS_DOCUMENT, text);
    const store = await startApp();
    expect(store.current).toEqual(defaultSettings());
    expect(store.warning).toMatch(/default settings are in use.*settings-backup\.toml/);
    expect(await storage().read(SETTINGS_BACKUP_DOCUMENT)).toBe(text);
    // The next start is clean again.
    expect((await startApp()).warning).toBeNull();
  });

  it('keeps the valid values of a partly broken file and names the broken ones', async () => {
    await storage().write(
      SETTINGS_DOCUMENT,
      'version = 1\n[display]\ntheme = "dark"\nlabels = 3\n',
    );
    const store = await startApp();
    expect(store.current.theme).toBe('dark');
    expect(store.current.labels).toBe('notes');
    expect(store.warning).toMatch(/display\.labels/);
    store.dismissWarning();
    expect(store.warning).toBeNull();
  });

  it('warns instead of failing when the storage itself fails', async () => {
    const failing: Storage = {
      read: async () => {
        throw new StorageError('disk on fire');
      },
      write: async () => {
        throw new StorageError('disk on fire');
      },
      list: async () => [],
      delete: async () => {},
    };
    const store = new SettingsStore(failing);
    await store.load();
    expect(store.current).toEqual(defaultSettings());
    expect(store.warning).toMatch(/could not be loaded.*disk on fire/);

    await store.update({ theme: 'light' });
    expect(store.current.theme).toBe('light');
    expect(store.warning).toMatch(/could not be saved.*disk on fire/);
  });
});
