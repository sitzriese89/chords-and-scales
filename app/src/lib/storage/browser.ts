import { assertDocumentName, isDocumentName } from './names';
import { StorageError, type Storage } from './storage';

/** The part of the Web Storage API (`window.localStorage`) this implementation uses. */
export interface KeyValueStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Every document lives under this key prefix, so other localStorage entries are ignored. */
export const KEY_PREFIX = 'chords-and-scales:document:';

/** `Storage` on localStorage, used whenever the app runs outside Tauri (ADR-4). */
export class BrowserStorage implements Storage {
  constructor(private readonly store: KeyValueStore = window.localStorage) {}

  async read(name: string): Promise<string | null> {
    assertDocumentName(name);
    return this.attempt(`could not read document "${name}"`, () =>
      this.store.getItem(KEY_PREFIX + name),
    );
  }

  async write(name: string, content: string): Promise<void> {
    assertDocumentName(name);
    this.attempt(`could not write document "${name}"`, () =>
      this.store.setItem(KEY_PREFIX + name, content),
    );
  }

  async list(): Promise<string[]> {
    return this.attempt('could not list documents', () => {
      const names: string[] = [];
      for (let i = 0; i < this.store.length; i++) {
        const key = this.store.key(i);
        if (key?.startsWith(KEY_PREFIX)) {
          const name = key.slice(KEY_PREFIX.length);
          if (isDocumentName(name)) names.push(name);
        }
      }
      return names.sort();
    });
  }

  async delete(name: string): Promise<void> {
    assertDocumentName(name);
    this.attempt(`could not delete document "${name}"`, () =>
      this.store.removeItem(KEY_PREFIX + name),
    );
  }

  private attempt<T>(message: string, action: () => T): T {
    try {
      return action();
    } catch (cause) {
      throw new StorageError(`${message}: ${String(cause)}`, { cause });
    }
  }
}
