import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserStorage } from './browser';
import {
  BrowserUserFiles,
  exportDocument,
  FILE_FORMATS,
  ImportError,
  importDocument,
  MAX_IMPORT_BYTES,
  TauriUserFiles,
  type InvokeWithBody,
  type PickedFile,
  type SaveRequest,
  type UserFiles,
} from './files';
import { InvalidDocumentNameError } from './names';
import { StorageError } from './storage';

/** The first bytes of a PNG file and its first chunk's length. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** Records saves and hands out a prepared pick. */
class FakeUserFiles implements UserFiles {
  saved: SaveRequest[] = [];
  constructor(private readonly pick: PickedFile | null = null) {}
  async save(file: SaveRequest) {
    this.saved.push(file);
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
    expect(files.saved).toEqual([
      { suggestedName: 'scales.toml', format: 'toml', content: '[[scale]]\nid = "mine"\n' },
    ]);
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
    const invoke: InvokeWithBody = async (command, args) => {
      calls.push([command, args]);
      return command === 'export_file' ? true : { fileName: 'a.toml', content: 'x = 1' };
    };
    const files = new TauriUserFiles(invoke);
    expect(
      await files.save({ suggestedName: 'scales.toml', format: 'toml', content: 'x = 1' }),
    ).toBe(true);
    expect(await files.save({ suggestedName: 'sheet.svg', format: 'svg', content: '<svg/>' })).toBe(
      true,
    );
    expect(await files.open()).toEqual({ fileName: 'a.toml', content: 'x = 1' });
    expect(calls).toEqual([
      ['export_file', { suggestedName: 'scales.toml', format: 'toml', content: 'x = 1' }],
      ['export_file', { suggestedName: 'sheet.svg', format: 'svg', content: '<svg/>' }],
      ['import_file', undefined],
    ]);
  });

  it('sends bytes as the raw body, with the name and format in headers', async () => {
    const calls: unknown[][] = [];
    const files = new TauriUserFiles(async (...call) => {
      calls.push(call);
      return true;
    });
    expect(await files.save({ suggestedName: 'c♯ dorian.png', format: 'png', content: PNG })).toBe(
      true,
    );
    expect(calls).toEqual([
      [
        'export_file',
        PNG,
        { headers: { 'x-export-name': 'c%E2%99%AF%20dorian.png', 'x-export-format': 'png' } },
      ],
    ]);
    // The very bytes, not a copy turned into numbers.
    expect(calls[0][1]).toBe(PNG);
  });

  it('reports cancelled dialogs', async () => {
    const files = new TauriUserFiles(async (command) => (command === 'export_file' ? false : null));
    expect(await files.save({ suggestedName: 'a.html', format: 'html', content: '' })).toBe(false);
    expect(await files.open()).toBeNull();
  });

  it('reports a failed save', async () => {
    const files = new TauriUserFiles(async () => {
      throw 'could not write a.svg: access denied';
    });
    await expect(
      files.save({ suggestedName: 'a.svg', format: 'svg', content: '' }),
    ).rejects.toThrow(/access denied/);
  });
});

describe('BrowserUserFiles', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Records the Blobs offered for download and the links clicked. */
  function recordDownloads() {
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
    return { created, clicked };
  }

  it('downloads a Blob with the suggested file name', async () => {
    const { created, clicked } = recordDownloads();
    const files = new BrowserUserFiles();
    expect(
      await files.save({ suggestedName: 'scales.toml', format: 'toml', content: 'a = 1\n' }),
    ).toBe(true);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('scales.toml');
    expect(clicked[0].href).toBe('blob:test');
    expect(await created[0].text()).toBe('a = 1\n');
    expect(created[0].type).toBe('application/toml;charset=utf-8');
    expect(document.querySelector('a')).toBeNull();
  });

  it.each([
    ['svg', 'sheet.svg', 'image/svg+xml;charset=utf-8'],
    ['html', 'sheet.html', 'text/html;charset=utf-8'],
  ] as const)('downloads a %s file with its MIME type', async (format, name, type) => {
    const { created, clicked } = recordDownloads();
    const content =
      format === 'svg' ? '<svg xmlns="http://www.w3.org/2000/svg"/>' : '<!doctype html>';
    expect(await new BrowserUserFiles().save({ suggestedName: name, format, content })).toBe(true);
    expect(clicked[0].download).toBe(name);
    expect(created[0].type).toBe(type);
    expect(await created[0].text()).toBe(content);
  });

  it('downloads PNG bytes as an image/png Blob', async () => {
    const { created, clicked } = recordDownloads();
    expect(
      await new BrowserUserFiles().save({
        suggestedName: 'sheet.png',
        format: 'png',
        content: PNG,
      }),
    ).toBe(true);
    expect(clicked[0].download).toBe('sheet.png');
    expect(created[0].type).toBe('image/png');
    expect(new Uint8Array(await created[0].arrayBuffer())).toEqual(PNG);
  });

  it('knows a MIME type and an extension for every format', () => {
    for (const format of Object.values(FILE_FORMATS)) {
      expect(format.mime).toMatch(/^[a-z]+\/[a-z+.-]+$/);
      expect(format.extensions.length).toBeGreaterThan(0);
    }
    expect(Object.keys(FILE_FORMATS).sort()).toEqual(['html', 'png', 'svg', 'toml']);
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
