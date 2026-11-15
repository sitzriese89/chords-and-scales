import { isDocumentName } from './names';
import type { Invoke } from './tauri';

/**
 * For tests: an in-memory stand-in for the Rust commands in `app/src-tauri/src/storage.rs`,
 * with the same arguments, results and string errors, so `new TauriStorage(fakeCommands())`
 * runs the Tauri implementation without Tauri. Pass the same `folder` to simulate a restart.
 * The Rust tests cover the real file handling.
 */
export function fakeCommands(folder = new Map<string, string>()): Invoke {
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
