import { describe, expect, it } from 'vitest';
import { BrowserStorage, KEY_PREFIX, type KeyValueStore } from './browser';
import { storageContract } from './contract';
import { StorageError } from './storage';

/** A Web Storage stand-in, so every test gets its own empty store. */
class MemoryKeyValueStore implements KeyValueStore {
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

storageContract('browser (in-memory Web Storage)', () => {
  const store = new MemoryKeyValueStore();
  return { open: () => new BrowserStorage(store) };
});

storageContract('browser (jsdom localStorage)', () => {
  window.localStorage.clear();
  return { open: () => new BrowserStorage(window.localStorage) };
});

describe('BrowserStorage', () => {
  it('keeps documents under its own key prefix and ignores other entries', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem('unrelated', 'x');
    store.setItem(`${KEY_PREFIX}Not A Name`, 'x');
    const storage = new BrowserStorage(store);
    await storage.write('settings', 'version = 1\n');
    expect(store.getItem(`${KEY_PREFIX}settings`)).toBe('version = 1\n');
    expect(await storage.list()).toEqual(['settings']);
  });

  it('reports a full localStorage as a StorageError', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };
    const error = await new BrowserStorage(store).write('settings', 'x').catch((e) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toContain('settings');
  });
});
