import { describe, expect, it } from 'vitest';
import fixture from './names.fixture.json';
import {
  assertDocumentName,
  InvalidDocumentNameError,
  isDocumentName,
  MAX_DOCUMENT_NAME_LENGTH,
} from './names';

describe('document names', () => {
  it.each(fixture.valid)('accepts %j', (name) => {
    expect(isDocumentName(name)).toBe(true);
  });

  it.each(fixture.invalid)('rejects %j', (name) => {
    expect(isDocumentName(name)).toBe(false);
    expect(() => assertDocumentName(name)).toThrow(InvalidDocumentNameError);
  });

  it(`allows at most ${MAX_DOCUMENT_NAME_LENGTH} characters`, () => {
    expect(isDocumentName('a'.repeat(MAX_DOCUMENT_NAME_LENGTH))).toBe(true);
    expect(isDocumentName('a'.repeat(MAX_DOCUMENT_NAME_LENGTH + 1))).toBe(false);
  });
});
