// The theory core, compiled to WASM from crates/theory-wasm by `pnpm wasm` (ADR-2, ADR-14).
// Components import theory functions from here, never from ./wasm directly.
import init from './wasm/theory_wasm.js';

export { version } from './wasm/theory_wasm.js';

let ready: Promise<void> | undefined;

/**
 * Loads the WASM module. Call once before using any theory function; later calls return the
 * same promise. In the browser and in Tauri the module is fetched next to the bundle; tests
 * pass the module bytes instead.
 */
export function initTheory(wasm?: BufferSource): Promise<void> {
  ready ??= init(wasm ? { module_or_path: wasm } : undefined).then(() => undefined);
  return ready;
}
