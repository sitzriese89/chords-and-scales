import { describe, expect, it } from 'vitest';
import { storageContract } from './contract';
import { fakeCommands } from './fake-commands';
import { StorageError } from './storage';
import { TauriStorage, type Invoke } from './tauri';

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
