import { afterEach, describe, expect, it } from 'vitest';
import { setUserTunings } from '../theory';
import { standardTuning, tuningsWithStrings } from './presets';

describe('instrument presets', () => {
  afterEach(() => {
    setUserTunings('');
  });

  it('offers the tunings of one string count', () => {
    expect(tuningsWithStrings(5).map((t) => t.id)).toEqual(['bass-5-standard', 'bass-5-high-c']);
    for (let strings = 4; strings <= 9; strings++) {
      expect(tuningsWithStrings(strings).every((t) => t.notes.length === strings)).toBe(true);
    }
  });

  it('starts every string count on its standard preset, keeping the kind where it can', () => {
    expect(standardTuning(6, 'guitar')?.id).toBe('guitar-6-standard');
    expect(standardTuning(6, 'bass')?.id).toBe('bass-6-standard');
    expect(standardTuning(5, 'guitar')?.id).toBe('bass-5-standard');
    expect(standardTuning(9, 'bass')?.id).toBe('guitar-9-standard');
    expect(standardTuning(3, 'guitar')).toBeUndefined();
  });

  it('uses a user tuning that replaces a standard preset as the standard', () => {
    setUserTunings(
      '[[tuning]]\nid = "guitar-6-standard"\nname = "Mine"\nkind = "guitar"\nnotes = ["E2", "A2", "D3", "G3", "B3", "E4"]\n',
    );
    expect(standardTuning(6, 'guitar')?.name).toBe('Mine');
  });
});
