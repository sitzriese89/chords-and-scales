import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidDocumentNameError } from './names';
import type { Storage } from './storage';

/**
 * One backing store (a localStorage, a fake app-data folder) and a way to open a new
 * `Storage` on it, as the app does on every start.
 */
export interface StorageFixture {
  open(): Storage;
}

/**
 * The behaviour every `Storage` implementation must have (ADR-4). Each implementation's test
 * file calls this with a fresh fixture per test; the Rust side of the Tauri implementation is
 * tested by the Rust tests in `app/src-tauri/src/storage.rs`.
 */
export function storageContract(label: string, makeFixture: () => StorageFixture): void {
  describe(`Storage contract: ${label}`, () => {
    let fixture: StorageFixture;
    let storage: Storage;

    beforeEach(() => {
      fixture = makeFixture();
      storage = fixture.open();
    });

    it('reads null for a document that was never written', async () => {
      expect(await storage.read('settings')).toBeNull();
    });

    it('reads back exactly what was written', async () => {
      const content = 'version = 1\n# D♭ and F♯ ünïcode\r\n[view]\nroot = "Db"\n';
      await storage.write('settings', content);
      expect(await storage.read('settings')).toBe(content);
    });

    it('stores an empty document as an empty string, not as missing', async () => {
      await storage.write('scales', '');
      expect(await storage.read('scales')).toBe('');
      expect(await storage.list()).toEqual(['scales']);
    });

    it('replaces a document on write', async () => {
      await storage.write('scales', 'a = 1\n');
      await storage.write('scales', 'b = 2\n');
      expect(await storage.read('scales')).toBe('b = 2\n');
    });

    it('keeps documents apart', async () => {
      await storage.write('scales', 'scales');
      await storage.write('chords', 'chords');
      expect(await storage.read('scales')).toBe('scales');
      expect(await storage.read('chords')).toBe('chords');
    });

    it('lists stored documents sorted by name', async () => {
      expect(await storage.list()).toEqual([]);
      await storage.write('tunings', '');
      await storage.write('custom-scales', '');
      await storage.write('settings', '');
      expect(await storage.list()).toEqual(['custom-scales', 'settings', 'tunings']);
    });

    it('deletes documents, and deleting a missing one is fine', async () => {
      await storage.write('presets', 'x = 1\n');
      await storage.delete('presets');
      expect(await storage.read('presets')).toBeNull();
      expect(await storage.list()).toEqual([]);
      await expect(storage.delete('presets')).resolves.toBeUndefined();
    });

    it('keeps documents for a new Storage on the same backing store (app restart)', async () => {
      await storage.write('settings', 'version = 1\n');
      await storage.write('scales', '[[scale]]\n');
      const reopened = fixture.open();
      expect(await reopened.read('settings')).toBe('version = 1\n');
      expect(await reopened.list()).toEqual(['scales', 'settings']);
    });

    it.each(['', 'Settings', 'settings.toml', '../settings', 'a/b', 'a\\b', 'con'])(
      'rejects the invalid name %j everywhere and stores nothing',
      async (name) => {
        await expect(storage.read(name)).rejects.toBeInstanceOf(InvalidDocumentNameError);
        await expect(storage.write(name, 'x')).rejects.toBeInstanceOf(InvalidDocumentNameError);
        await expect(storage.delete(name)).rejects.toBeInstanceOf(InvalidDocumentNameError);
        expect(await storage.list()).toEqual([]);
      },
    );
  });
}
