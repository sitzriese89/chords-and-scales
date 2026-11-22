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
  themeId: 'solar',
  leftHanded: true,
  chordSymbols: 'jazz',
  instrument: { kind: 'bass', strings: 5, tuning: 'bass-5-standard', frets: 21, capo: 3 },
  lastView: { root: 'Db', scale: 'dorian' },
  tab: {
    system: 'window',
    pattern: 2,
    windowStart: 7,
    windowSpan: 5,
    direction: 'both',
    highlight: false,
  },
  audio: { volume: 35, muted: true },
  chordPanel: { collapsed: true, height: 300 },
  voicings: { maxSpan: 6, openStrings: false, mutedStrings: false, inversions: true, startFret: 9 },
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
      chordSymbols: 'standard',
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
      display: {
        accidentals: 'flats',
        labels: 'intervals',
        theme: 'dark',
        theme_id: 'solar',
        left_handed: true,
        chord_symbols: 'jazz',
      },
      instrument: { kind: 'bass', strings: 5, tuning: 'bass-5-standard', frets: 21, capo: 3 },
      last_view: { root: 'Db', scale: 'dorian' },
      tab: {
        system: 'window',
        pattern: 2,
        window_start: 7,
        window_span: 5,
        direction: 'both',
        highlight: false,
      },
      audio: { volume: 35, muted: true },
      chord_panel: { collapsed: true, height: 300 },
      voicings: {
        max_span: 6,
        open_strings: false,
        muted_strings: false,
        inversions: true,
        start_fret: 9,
      },
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

  it('reads the theme id, the Default theme when it is missing (ADR-40)', () => {
    expect(parsed('version = 1\n[display]\ntheme = "dark"\n').settings.themeId).toBe('default');
    const result = parsed('version = 1\n[display]\ntheme_id = "print"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual({ ...defaultSettings(), themeId: 'print' });
    const invalid = parsed('version = 1\n[display]\ntheme_id = 3\n');
    expect(invalid.settings.themeId).toBe('default');
    expect(invalid.problems).toEqual([
      'display.theme_id should be a text of 1 to 64 characters, not 3',
    ]);
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

  it('reads the tab position and falls back per value', () => {
    const result = parsed(`version = 1
[tab]
system = "caged"
pattern = 3
window_start = 30
window_span = 0
direction = "both"
`);
    expect(result.settings.tab).toEqual({
      ...DEFAULT_SETTINGS.tab,
      pattern: 3,
      direction: 'both',
    });
    expect(result.problems).toEqual([
      'tab.system should be "3nps" or "window", not "caged"',
      'tab.window_start should be a whole number from 0 to 27, not 30',
      'tab.window_span should be a whole number from 1 to 12, not 0',
    ]);
  });

  it('reads a version 1 file written before the tab table existed', () => {
    const result = parsed('version = 1\n[last_view]\nroot = "G"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings.tab).toEqual(DEFAULT_SETTINGS.tab);
  });

  it('reads the audio table and falls back per value', () => {
    const result = parsed('version = 1\n[audio]\nvolume = 120\nmuted = true\nloud = 1\n');
    expect(result.settings.audio).toEqual({ volume: DEFAULT_SETTINGS.audio.volume, muted: true });
    expect(result.problems).toEqual([
      'audio.volume should be a whole number from 0 to 100, not 120',
      'audio.loud is not a known setting',
    ]);
  });

  it('reads a version 1 file written before the audio table existed', () => {
    const result = parsed('version = 1\n[last_view]\nroot = "G"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings.audio).toEqual({ volume: 70, muted: false });
  });

  it('reads the chord panel table and falls back per value', () => {
    const result = parsed('version = 1\n[chord_panel]\ncollapsed = true\nheight = 5\nwidth = 1\n');
    expect(result.settings.chordPanel).toEqual({
      collapsed: true,
      height: DEFAULT_SETTINGS.chordPanel.height,
    });
    expect(result.problems).toEqual([
      'chord_panel.height should be a whole number from 96 to 640, not 5',
      'chord_panel.width is not a known setting',
    ]);
  });

  it('reads a version 1 file written before the chord panel table existed', () => {
    const result = parsed('version = 1\n[last_view]\nroot = "G"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings.chordPanel).toEqual({ collapsed: false, height: 220 });
  });

  it('reads the voicing constraints and falls back per value', () => {
    const result = parsed(
      'version = 1\n[voicings]\nmax_span = 9\nopen_strings = false\ninversions = true\nlimit = 3\n',
    );
    expect(result.settings.voicings).toEqual({
      maxSpan: 4,
      openStrings: false,
      mutedStrings: true,
      inversions: true,
      // A file from before the start fret: no limit.
      startFret: 0,
    });
    expect(result.problems).toEqual([
      'voicings.max_span should be a whole number from 1 to 6, not 9',
      'voicings.limit is not a known setting',
    ]);
  });

  it('reads a version 1 file written before the voicings table existed', () => {
    const result = parsed('version = 1\n[last_view]\nroot = "G"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings.voicings).toEqual({
      maxSpan: 4,
      openStrings: true,
      mutedStrings: true,
      inversions: false,
      startFret: 0,
    });
  });

  it('reads the start fret and falls back on one off the longest neck', () => {
    const seven = parsed('version = 1\n[voicings]\nstart_fret = 7\n');
    expect(seven.settings.voicings.startFret).toBe(7);
    expect(seven.problems).toEqual([]);
    const result = parsed('version = 1\n[voicings]\nstart_fret = 30\n');
    expect(result.settings.voicings.startFret).toBe(0);
    expect(result.problems).toEqual([
      'voicings.start_fret should be a whole number from 0 to 27, not 30',
    ]);
  });

  it('reads the chord symbol style and falls back on an unknown one', () => {
    expect(parsed('version = 1\n[display]\nchord_symbols = "jazz"\n').settings.chordSymbols).toBe(
      'jazz',
    );
    const result = parsed('version = 1\n[display]\nchord_symbols = "fancy"\n');
    expect(result.settings.chordSymbols).toBe('standard');
    expect(result.problems).toEqual([
      'display.chord_symbols should be "standard" or "jazz", not "fancy"',
    ]);
  });

  it('reads a version 1 file written before the chord symbol style existed', () => {
    const result = parsed('version = 1\n[display]\naccidentals = "flats"\n');
    expect(result.problems).toEqual([]);
    expect(result.settings.chordSymbols).toBe('standard');
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
