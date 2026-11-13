import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  defaultSettings,
  parseSettings,
  serializeSettings,
  SETTINGS_VERSION,
  type Settings,
} from './schema';

const custom: Settings = {
  accidentals: 'flats',
  labels: 'intervals',
  theme: 'dark',
  leftHanded: true,
  instrument: { kind: 'bass', strings: 5, tuning: 'bass-5-standard', frets: 21, capo: 3 },
  lastView: { root: 'Db', scale: 'dorian' },
};

function parsed(text: string) {
  const result = parseSettings(text);
  if (!result.ok) throw new Error(`expected a usable file, got: ${result.reason}`);
  return result;
}

describe('settings defaults', () => {
  it('match the spec defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      accidentals: 'sharps',
      labels: 'notes',
      theme: 'system',
      leftHanded: false,
      instrument: { frets: 24, capo: 0 },
    });
  });

  it('are handed out as independent copies', () => {
    const a = defaultSettings();
    a.instrument.frets = 12;
    expect(defaultSettings().instrument.frets).toBe(24);
  });
});

describe('serializeSettings', () => {
  it('writes versioned, snake_case TOML', () => {
    const doc = parse(serializeSettings(custom));
    expect(doc).toEqual({
      version: SETTINGS_VERSION,
      display: { accidentals: 'flats', labels: 'intervals', theme: 'dark', left_handed: true },
      instrument: { kind: 'bass', strings: 5, tuning: 'bass-5-standard', frets: 21, capo: 3 },
      last_view: { root: 'Db', scale: 'dorian' },
    });
  });

  it('round-trips through parseSettings without problems', () => {
    for (const settings of [defaultSettings(), custom]) {
      expect(parsed(serializeSettings(settings))).toEqual({ ok: true, settings, problems: [] });
    }
  });
});

describe('parseSettings', () => {
  it('fills missing values with defaults without complaint', () => {
    const result = parsed('version = 1\n[display]\ntheme = "dark"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual({ ...defaultSettings(), theme: 'dark' });
  });

  it('falls back per value and names each invalid one', () => {
    const result = parsed(`version = 1
[display]
accidentals = "both"
labels = "intervals"
left_handed = "yes"
[instrument]
strings = 12
frets = 22
capo = 22
tuning = ""
[last_view]
root = 5
scale = "lydian"
`);
    expect(result.settings).toEqual({
      ...defaultSettings(),
      labels: 'intervals',
      instrument: { ...DEFAULT_SETTINGS.instrument, frets: 22 },
      lastView: { root: 'C', scale: 'lydian' },
    });
    expect(result.problems).toEqual([
      'display.accidentals should be "sharps" or "flats", not "both"',
      'display.left_handed should be true or false, not "yes"',
      'instrument.strings should be a whole number from 4 to 9, not 12',
      'instrument.tuning should be a text of 1 to 64 characters, not ""',
      'instrument.capo should be a whole number from 0 to 21, not 22',
      'last_view.root should be a text of 1 to 64 characters, not 5',
    ]);
  });

  it('reports unknown keys and tables that are not tables', () => {
    const result = parsed(
      'version = 1\ncolour = "red"\ninstrument = 6\n[display]\nthme = "dark"\n',
    );
    expect(result.settings).toEqual(defaultSettings());
    expect(result.problems).toEqual([
      'display.thme is not a known setting',
      'instrument should be a table',
      'colour is not a known setting',
    ]);
  });

  it.each([
    ['not TOML', 'version = 1\n[display\n', /not valid TOML/],
    ['empty', '', /no version/],
    ['without a version', '[display]\ntheme = "dark"\n', /no version/],
    ['with a text version', 'version = "1"\n', /not a whole number/],
    ['from an older format', 'version = 0\n', /format 0 is no longer supported/],
    ['from a newer app', 'version = 2\n', /newer version of the app/],
  ])('refuses a file %s', (_, text, reason) => {
    const result = parseSettings(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(reason);
  });
});
