/**
 * Printing the sheet, which is also how it becomes a PDF (SPEC §5.10, ADR-45). The sheet page's
 * print stylesheet (`SheetView.svelte`) leaves only the sheet on the page; this opens the
 * print dialog.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Invoke } from '../storage/tauri';

/** Opens the print dialog; `createPrinter()` picks the implementation. */
export interface Printer {
  print(): Promise<void>;
}

/**
 * Through the Rust command `print_sheet` (`user_files.rs`): `window.print()` does nothing in
 * the macOS webview, while the webview's own print works on every platform.
 */
export class TauriPrinter implements Printer {
  constructor(private readonly invoke: Invoke) {}

  async print(): Promise<void> {
    try {
      await this.invoke('print_sheet');
    } catch (cause) {
      throw new Error(String(cause), { cause });
    }
  }
}

/** A plain browser's print dialog. */
export class BrowserPrinter implements Printer {
  constructor(private readonly target: Pick<Window, 'print'> = window) {}

  async print(): Promise<void> {
    this.target.print();
  }
}

/** The webview's print through Rust inside Tauri, `window.print()` in a plain browser. */
export function createPrinter(): Printer {
  return isTauri() ? new TauriPrinter(invoke) : new BrowserPrinter(window);
}
