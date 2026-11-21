import { parse } from 'smol-toml';
import { assertDocumentName, isDocumentName } from './names';
import { StorageError, type Storage } from './storage';

/** A file the user picked for import. */
export interface PickedFile {
  /** File name without folder, e.g. `scales.toml`. */
  fileName: string;
  content: string;
}

/**
 * The kinds of file the app saves (ADR-44). The Tauri command maps the same keys to its save
 * dialog's filter (`ExportFormat` in `user_files.rs`); the browser download uses the MIME type.
 */
export const FILE_FORMATS = {
  toml: { name: 'TOML', extensions: ['toml'], mime: 'application/toml' },
  svg: { name: 'SVG image', extensions: ['svg'], mime: 'image/svg+xml' },
  html: { name: 'HTML page', extensions: ['html', 'htm'], mime: 'text/html' },
  png: { name: 'PNG image', extensions: ['png'], mime: 'image/png' },
} as const satisfies Record<string, { name: string; extensions: readonly string[]; mime: string }>;

export type FileFormat = keyof typeof FILE_FORMATS;

/** A file to save: what kind it is, what to call it, and what is in it. */
export interface SaveRequest {
  /** File name offered in the dialog or used for the download, e.g. `scales.toml`. */
  suggestedName: string;
  format: FileFormat;
  /** The file's text, written as UTF-8, or its bytes (a PNG), written as they are. */
  content: string | Uint8Array;
}

/**
 * Moving user files in and out of the app (SPEC §3.2): a save dialog / download for export,
 * an open dialog / upload for import. `createUserFiles()` in `./index.ts` picks the
 * implementation.
 */
export interface UserFiles {
  /** Offers the file to save; `false` if the user cancelled. */
  save(file: SaveRequest): Promise<boolean>;
  /** Lets the user pick a TOML file; `null` if they cancelled. */
  open(): Promise<PickedFile | null>;
}

/** Largest file accepted on import; matches `MAX_IMPORT_BYTES` in `user_files.rs`. */
export const MAX_IMPORT_BYTES = 1024 * 1024;

/** An import was refused: too large, not TOML, or no usable document name. */
export class ImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/**
 * `invoke` from `@tauri-apps/api/core` with what a binary export needs: bytes as the whole
 * payload (sent as the raw request body) and request headers.
 */
export type InvokeWithBody = (
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
) => Promise<unknown>;

/**
 * Headers naming a binary export (`NAME_HEADER`, `FORMAT_HEADER` in `user_files.rs`). The name
 * is percent-encoded: header values are ASCII.
 */
export function exportHeaders(suggestedName: string, format: FileFormat): Record<string, string> {
  return { 'x-export-name': encodeURIComponent(suggestedName), 'x-export-format': format };
}

/** Native dialogs through the Rust commands in `app/src-tauri/src/user_files.rs`. */
export class TauriUserFiles implements UserFiles {
  constructor(private readonly invoke: InvokeWithBody) {}

  async save({ suggestedName, format, content }: SaveRequest): Promise<boolean> {
    try {
      // Text goes as JSON arguments, bytes as the raw request body: a PNG isn't sent as a
      // JSON array of numbers (ADR-45).
      const saved =
        typeof content === 'string'
          ? await this.invoke('export_file', { suggestedName, format, content })
          : await this.invoke('export_file', content, {
              headers: exportHeaders(suggestedName, format),
            });
      return saved === true;
    } catch (cause) {
      throw new StorageError(String(cause), { cause });
    }
  }

  async open(): Promise<PickedFile | null> {
    try {
      return ((await this.invoke('import_file')) as PickedFile | null) ?? null;
    } catch (cause) {
      throw new ImportError(String(cause), { cause });
    }
  }
}

/** Download and upload in a plain browser. */
export class BrowserUserFiles implements UserFiles {
  constructor(private readonly doc: Document = document) {}

  async save({ suggestedName, format, content }: SaveRequest): Promise<boolean> {
    const { mime } = FILE_FORMATS[format];
    const blob =
      typeof content === 'string'
        ? new Blob([content], { type: `${mime};charset=utf-8` })
        : new Blob([content as Uint8Array<ArrayBuffer>], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = this.doc.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.style.display = 'none';
    this.doc.body.append(link);
    link.click();
    link.remove();
    // Revoke after the click has been handled; the download keeps its own reference.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    // The browser doesn't report whether the user kept the download.
    return true;
  }

  open(): Promise<PickedFile | null> {
    return new Promise((resolve, reject) => {
      const input = this.doc.createElement('input');
      input.type = 'file';
      input.accept = '.toml,application/toml,text/plain';
      input.addEventListener('cancel', () => resolve(null));
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        if (file.size > MAX_IMPORT_BYTES) {
          return reject(
            new ImportError(`${file.name} is ${file.size} bytes; the limit is ${MAX_IMPORT_BYTES}`),
          );
        }
        file.text().then(
          (content) => resolve({ fileName: file.name, content }),
          (cause) => reject(new ImportError(`could not read ${file.name}`, { cause })),
        );
      });
      input.click();
    });
  }
}

/** Exports stored document `name` as `<name>.toml`; `false` if cancelled. */
export async function exportDocument(
  storage: Storage,
  files: UserFiles,
  name: string,
): Promise<boolean> {
  const content = await storage.read(name);
  if (content === null) throw new StorageError(`there is no document "${name}" to export`);
  return files.save({ suggestedName: `${name}.toml`, format: 'toml', content });
}

/**
 * Lets the user pick a TOML file and stores it as document `name`, or, without a name, under
 * the file's name (`scales.toml` → `scales`). Refuses files that aren't valid TOML, so a stored
 * document always parses. Returns the document name, or `null` if the user cancelled.
 */
export async function importDocument(
  storage: Storage,
  files: UserFiles,
  name?: string,
): Promise<string | null> {
  if (name !== undefined) assertDocumentName(name);
  const picked = await files.open();
  if (!picked) return null;
  const target = name ?? picked.fileName.replace(/\.toml$/i, '');
  if (!isDocumentName(target)) {
    throw new ImportError(
      `"${picked.fileName}" can't be imported under that name: rename it to lowercase letters, ` +
        `digits, '-' or '_' (for example scales.toml)`,
    );
  }
  try {
    parse(picked.content);
  } catch (cause) {
    throw new ImportError(`${picked.fileName} is not valid TOML: ${String(cause)}`, { cause });
  }
  await storage.write(target, picked.content);
  return target;
}
