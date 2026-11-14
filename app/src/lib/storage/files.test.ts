import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserStorage } from './browser';
import {
  BrowserUserFiles,
  exportDocument,
  ImportError,
  importDocument,
  MAX_IMPORT_BYTES,
  TauriUserFiles,
  type PickedFile,
  type UserFiles,
} from './files';
import { InvalidDocumentNameError } from './names';
import { StorageError } from './storage';
import type { Invoke } from './tauri';

/** Records saves and hands out a prepared pick. */
class FakeUserFiles implements UserFiles {
  saved: [string, string][] = [];
  constructor(private readonly pick: PickedFile | null = null) {}
  async save(suggestedName: string, content: string) {
    this.saved.push([suggestedName, content]);
    return true;
  }
  async open() {
    return this.pick;
  }
}

function memoryStorage() {
  window.localStorage.clear();
  return new BrowserStorage(window.localStorage);
}

describe('exportDocument', () => {
  it('offers the stored document as <name>.toml', async () => {
    const storage = memoryStorage();
    await storage.write('scales', '[[scale]]\nid = "mine"\n');
    const files = new FakeUserFiles();
    expect(await exportDocument(storage, files, 'scales')).toBe(true);
    expect(files.saved).toEqual([['scales.toml', '[[scale]]\nid = "mine"\n']]);
  });

  it('refuses a document that does not exist', async () => {
    await expect(
      exportDocument(memoryStorage(), new FakeUserFiles(), 'scales'),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe('importDocument', () => {
  it('stores the picked file under its own name', async () => {
    const storage = memoryStorage();
    const files = new FakeUserFiles({ fileName: 'tunings.TOML', content: 'a = 1\n' });
    expect(await importDocument(storage, files)).toBe('tunings');
    expect(await storage.read('tunings')).toBe('a = 1\n');
  });

  it('stores the picked file under a given name', async () => {
    const storage = memoryStorage();
    const files = new FakeUserFiles({ fileName: 'From a Friend.toml', content: 'a = 1\n' });
    expect(await importDocument(storage, files, 'scales')).toBe('scales');
    expect(await storage.read('scales')).toBe('a = 1\n');
  });

  it('does nothing when the user cancels', async () => {
    const storage = memoryStorage();
    expect(await importDocument(storage, new FakeUserFiles(null))).toBeNull();
    expect(await storage.list()).toEqual([]);
  });

  it('refuses files that are not TOML', async () => {
    const storage = memoryStorage();
    const files = new FakeUserFiles({ fileName: 'scales.toml', content: 'not = [toml' });
    await expect(importDocument(storage, files)).rejects.toBeInstanceOf(ImportError);
    expect(await storage.list()).toEqual([]);
  });

  it('refuses a file name that is not a document name', async () => {
    const storage = memoryStorage();
    const files = new FakeUserFiles({ fileName: 'My Scales.toml', content: 'a = 1' });
    await expect(importDocument(storage, files)).rejects.toThrow(/rename it/);
    await expect(importDocument(storage, files, '../x')).rejects.toBeInstanceOf(
      InvalidDocumentNameError,
    );
  });
});

describe('TauriUserFiles', () => {
  it('calls the export and import commands', async () => {
    const calls: [string, unknown][] = [];
    const invoke: Invoke = async (command, args) => {
      calls.push([command, args]);
      return command === 'export_file' ? true : { fileName: 'a.toml', content: 'x = 1' };
    };
    const files = new TauriUserFiles(invoke);
    expect(await files.save('scales.toml', 'x = 1')).toBe(true);
    expect(await files.open()).toEqual({ fileName: 'a.toml', content: 'x = 1' });
    expect(calls).toEqual([
      ['export_file', { suggestedName: 'scales.toml', content: 'x = 1' }],
      ['import_file', undefined],
    ]);
  });

  it('reports cancelled dialogs', async () => {
    const files = new TauriUserFiles(async (command) => (command === 'export_file' ? false : null));
    expect(await files.save('a.toml', '')).toBe(false);
    expect(await files.open()).toBeNull();
  });
});

describe('BrowserUserFiles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads a Blob with the suggested file name', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    expect(await new BrowserUserFiles().save('scales.toml', 'a = 1\n')).toBe(true);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('scales.toml');
    expect(clicked[0].href).toBe('blob:test');
    expect(await created[0].text()).toBe('a = 1\n');
    expect(document.querySelector('a')).toBeNull();
  });

  /** Makes the next file input "pick" `files` (or cancel when `null`) as soon as it opens. */
  function pickOnClick(files: File[] | null) {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      if (files === null) {
        this.dispatchEvent(new Event('cancel'));
        return;
      }
      Object.defineProperty(this, 'files', { value: files });
      this.dispatchEvent(new Event('change'));
    });
  }

  it('uploads the picked file', async () => {
    pickOnClick([new File(['a = 1\n'], 'scales.toml')]);
    expect(await new BrowserUserFiles().open()).toEqual({
      fileName: 'scales.toml',
      content: 'a = 1\n',
    });
  });

  it('resolves null when the picker is cancelled', async () => {
    pickOnClick(null);
    expect(await new BrowserUserFiles().open()).toBeNull();
  });

  it('refuses files over the size limit', async () => {
    pickOnClick([new File(['#'.repeat(MAX_IMPORT_BYTES + 1)], 'big.toml')]);
    await expect(new BrowserUserFiles().open()).rejects.toBeInstanceOf(ImportError);
  });
});
