import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserStorage, StorageError, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
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

describe('audio and chord panel settings in both Storage implementations (ADR-4)', () => {
  const implementations: [string, () => () => Storage][] = [
    [
      'browser',
      () => {
        window.localStorage.clear();
        return () => new BrowserStorage(window.localStorage);
      },
    ],
    [
      'Tauri (fake commands)',
      () => {
        const folder = new Map<string, string>();
        return () => new TauriStorage(fakeCommands(folder));
      },
    ],
  ];

  it.each(implementations)('keeps mute and volume across a restart: %s', async (_, make) => {
    const open = make();
    const first = new SettingsStore(open());
    await first.load();
    expect(first.current.audio).toEqual({ volume: 70, muted: false });
    await first.update({ audio: { muted: true } });
    await first.update({ audio: { volume: 35 } });

    const second = new SettingsStore(open());
    await second.load();
    expect(second.warning).toBeNull();
    expect(second.current.audio).toEqual({ volume: 35, muted: true });
    expect(await open().read(SETTINGS_DOCUMENT)).toMatch(/\[audio\]\nvolume = 35\nmuted = true/);
  });

  it.each(implementations)(
    'keeps the chord panel collapsed state and height across a restart: %s',
    async (_, make) => {
      const open = make();
      const first = new SettingsStore(open());
      await first.load();
      expect(first.current.chordPanel).toEqual({ collapsed: false, height: 220 });
      await first.update({ chordPanel: { collapsed: true } });
      await first.update({ chordPanel: { height: 340 } });

      const second = new SettingsStore(open());
      await second.load();
      expect(second.warning).toBeNull();
      expect(second.current.chordPanel).toEqual({ collapsed: true, height: 340 });
      expect(await open().read(SETTINGS_DOCUMENT)).toMatch(
        /\[chord_panel\]\ncollapsed = true\nheight = 340/,
      );
    },
  );

  it.each(implementations)(
    'keeps the side panels collapsed across a restart: %s',
    async (_, make) => {
      const open = make();
      const first = new SettingsStore(open());
      await first.load();
      expect(first.current.scalePicker).toEqual({ collapsed: false });
      expect(first.current.settingsPanel).toEqual({ collapsed: false });
      await first.update({ scalePicker: { collapsed: true } });
      await first.update({ settingsPanel: { collapsed: true } });

      const second = new SettingsStore(open());
      await second.load();
      expect(second.warning).toBeNull();
      expect(second.current.scalePicker).toEqual({ collapsed: true });
      expect(second.current.settingsPanel).toEqual({ collapsed: true });
      expect(await open().read(SETTINGS_DOCUMENT)).toMatch(
        /\[scale_picker\]\ncollapsed = true\n\n\[settings_panel\]\ncollapsed = true/,
      );
    },
  );

  it('refuses a panel height the file could not hold', async () => {
    window.localStorage.clear();
    const store = await startApp();
    await expect(store.update({ chordPanel: { height: 2000 } })).rejects.toThrow(
      /chord_panel\.height/,
    );
    expect(store.current.chordPanel.height).toBe(220);
  });

  it('refuses a volume the file could not hold', async () => {
    window.localStorage.clear();
    const store = await startApp();
    await expect(store.update({ audio: { volume: 140 } })).rejects.toThrow(/audio\.volume/);
    expect(store.current.audio.volume).toBe(70);
  });
});
