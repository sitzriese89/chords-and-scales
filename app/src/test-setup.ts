import '@testing-library/jest-dom/vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initTheory } from './lib/theory';

// jsdom has `<dialog>` and its `open` attribute but not `showModal()` or `close()`. A stand-in
// with the parts the app relies on: the attribute, and the `close` event once it closes. Focus
// trapping and the top layer are the browser's and are not tested here.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, value?: string) {
    if (!this.open) return;
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent(new Event('close'));
  };
}

// jsdom can't fetch the .wasm file, so load the module from disk.
await initTheory(await readFile(join(import.meta.dirname, 'lib/wasm/theory_wasm_bg.wasm')));
