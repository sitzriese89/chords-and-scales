/**
 * Document names (ADR-17). A document `settings` is the file `settings.toml` in the app-data
 * folder, or one localStorage entry in the browser. The rule matches `validate_name` in
 * `app/src-tauri/src/storage.rs`; both test against `names.fixture.json`.
 */

/** Longest accepted document name, in characters. */
export const MAX_DOCUMENT_NAME_LENGTH = 64;

const NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** Names Windows reserves for devices; `con.toml` can't be created there. */
const RESERVED_ON_WINDOWS = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`]),
]);

/** Thrown when a document name breaks the naming rule; nothing is read or written. */
export class InvalidDocumentNameError extends Error {
  constructor(readonly documentName: string) {
    super(
      `invalid document name ${JSON.stringify(documentName)}: use 1-${MAX_DOCUMENT_NAME_LENGTH} ` +
        `lowercase letters, digits, '-' or '_', starting with a letter or digit`,
    );
    this.name = 'InvalidDocumentNameError';
  }
}

/**
 * 1–64 characters from `a-z`, `0-9`, `-`, `_`, starting with a letter or digit, and not a
 * Windows device name. Lowercase only, so names can't collide on case-insensitive filesystems.
 */
export function isDocumentName(name: string): boolean {
  return (
    name.length <= MAX_DOCUMENT_NAME_LENGTH && NAME.test(name) && !RESERVED_ON_WINDOWS.has(name)
  );
}

export function assertDocumentName(name: string): void {
  if (!isDocumentName(name)) throw new InvalidDocumentNameError(name);
}
