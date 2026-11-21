import { describe, expect, it, vi } from 'vitest';
import { BrowserPrinter, createPrinter, TauriPrinter } from './print';

describe('printing', () => {
  it('asks the Rust command to print inside Tauri', async () => {
    const calls: [string, unknown][] = [];
    const printer = new TauriPrinter(async (command, args) => {
      calls.push([command, args]);
      return null;
    });
    await printer.print();
    expect(calls).toEqual([['print_sheet', undefined]]);
  });

  it('reports a failed print in Tauri', async () => {
    const printer = new TauriPrinter(async () => {
      throw 'could not open the print dialog: unsupported';
    });
    await expect(printer.print()).rejects.toThrow(/unsupported/);
  });

  it('opens the browser print dialog in a plain browser', async () => {
    const target = { print: vi.fn() };
    await new BrowserPrinter(target).print();
    expect(target.print).toHaveBeenCalledOnce();
  });

  it('uses the browser print outside Tauri', () => {
    expect(createPrinter()).toBeInstanceOf(BrowserPrinter);
  });
});
