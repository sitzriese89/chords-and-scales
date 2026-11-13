import { describe, expect, it } from 'vitest';
import wasmPackage from './wasm/package.json';
import { version } from './theory';

describe('theory core (WASM)', () => {
  it('reports the version of the Rust crate it was built from', () => {
    expect(version()).toBe(wasmPackage.version);
    expect(version()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
