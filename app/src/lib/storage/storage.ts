/**
 * Everything the app stores goes through this interface (ADR-4): named TOML documents, kept
 * as text so files stay hand-editable. `createStorage()` in `./index.ts` picks the Tauri
 * implementation (files in the app-data folder) or the browser one (localStorage).
 *
 * Both implementations pass the same contract suite (`./contract.ts`). Every method rejects
 * with `InvalidDocumentNameError` for a name that breaks the rule in `./names.ts`, and with
 * `StorageError` when the backing store fails.
 */
export interface Storage {
  /** The document's text, or `null` if there is no such document. */
  read(name: string): Promise<string | null>;
  /** Creates or replaces the document. */
  write(name: string, content: string): Promise<void>;
  /** Names of all stored documents, sorted. */
  list(): Promise<string[]>;
  /** Removes the document; removing one that doesn't exist is not an error. */
  delete(name: string): Promise<void>;
}

/** The backing store failed (disk error, quota, missing permission, …). */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}
