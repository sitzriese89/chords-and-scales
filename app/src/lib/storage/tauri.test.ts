import { describe, expect, it } from 'vitest';
import { storageContract } from './contract';
import { isDocumentName } from './names';
import { StorageError } from './storage';
import { TauriStorage, type Invoke } from './tauri';

/**
 * An in-memory stand-in for the Rust commands in `app/src-tauri/src/storage.rs`, with the same
 * arguments, results and string errors. The Rust tests cover the real file handling.
 */
function fakeCommands(folder = new Map<string, string>()): Invoke {
  return async (command, args = {}) => {
    const name = args.name as string;
    if (command !== 'list_documents' && !isDocumentName(name)) {
      throw `invalid document name ${JSON.stringify(name)}`;
    }
    switch (command) {
      case 'read_document':
        return folder.get(name) ?? null;
      case 'write_document':
        folder.set(name, args.content as string);
        return null;
      case 'list_documents':
        return [...folder.keys()].sort();
      case 'delete_document':
        folder.delete(name);
        return null;
      default:
        throw `command ${command} not found`;
    }
  };
}

storageContract('Tauri (fake commands)', () => {
  const folder = new Map<string, string>();
  return { open: () => new TauriStorage(fakeCommands(folder)) };
});

describe('TauriStorage', () => {
  it('sends the documented command names and arguments', async () => {
    const calls: [string, unknown][] = [];
    const invoke: Invoke = async (command, args) => {
      calls.push([command, args]);
      return command === 'list_documents' ? [] : null;
    };
    const storage = new TauriStorage(invoke);
    await storage.write('settings', 'x = 1');
    await storage.read('settings');
    await storage.list();
    await storage.delete('settings');
    expect(calls).toEqual([
      ['write_document', { name: 'settings', content: 'x = 1' }],
      ['read_document', { name: 'settings' }],
      ['list_documents', undefined],
      ['delete_document', { name: 'settings' }],
    ]);
  });

  it('turns a rejected command into a StorageError with the Rust message', async () => {
    const storage = new TauriStorage(async () => {
      throw 'could not write document "settings": access denied';
    });
    const error = await storage.write('settings', 'x').catch((e) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toBe('could not write document "settings": access denied');
  });
});
