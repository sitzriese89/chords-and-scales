import '@testing-library/jest-dom/vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initTheory } from './lib/theory';

// jsdom can't fetch the .wasm file, so load the module from disk.
await initTheory(await readFile(join(import.meta.dirname, 'lib/wasm/theory_wasm_bg.wasm')));
