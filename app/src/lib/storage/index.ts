import { invoke, isTauri } from '@tauri-apps/api/core';
import { BrowserStorage } from './browser';
import { BrowserUserFiles, TauriUserFiles, type UserFiles } from './files';
import type { Storage } from './storage';
import { TauriStorage } from './tauri';

export { BrowserStorage } from './browser';
export {
  BrowserUserFiles,
  exportDocument,
  ImportError,
  importDocument,
  TauriUserFiles,
  type PickedFile,
  type UserFiles,
} from './files';
export { InvalidDocumentNameError, isDocumentName } from './names';
export { StorageError, type Storage } from './storage';
export { TauriStorage } from './tauri';

/** Files in the app-data folder inside Tauri, localStorage in a plain browser (ADR-4). */
export function createStorage(): Storage {
  return isTauri() ? new TauriStorage(invoke) : new BrowserStorage(window.localStorage);
}

/** Native file dialogs inside Tauri, download/upload in a plain browser. */
export function createUserFiles(): UserFiles {
  return isTauri() ? new TauriUserFiles(invoke) : new BrowserUserFiles(document);
}
