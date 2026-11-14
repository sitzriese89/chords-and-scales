import { assertDocumentName } from './names';
import { StorageError, type Storage } from './storage';

/** The shape of `invoke` from `@tauri-apps/api/core`; injectable so tests can fake it. */
export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * `Storage` on the Rust commands in `app/src-tauri/src/storage.rs`, which write TOML files
 * atomically into the OS app-data folder (ADR-4). Names are checked here too, so both
 * implementations fail the same way before anything crosses the IPC boundary.
 */
export class TauriStorage implements Storage {
  constructor(private readonly invoke: Invoke) {}

  async read(name: string): Promise<string | null> {
    assertDocumentName(name);
    const content = await this.call('read_document', { name });
    return typeof content === 'string' ? content : null;
  }

  async write(name: string, content: string): Promise<void> {
    assertDocumentName(name);
    await this.call('write_document', { name, content });
  }

  async list(): Promise<string[]> {
    const names = await this.call('list_documents');
    return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
  }

  async delete(name: string): Promise<void> {
    assertDocumentName(name);
    await this.call('delete_document', { name });
  }

  private async call(command: string, args?: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.invoke(command, args);
    } catch (cause) {
      // Rust commands reject with their error message as a string.
      throw new StorageError(String(cause), { cause });
    }
  }
}
