/**
 * The settings document `settings.toml` (ADR-17): display preferences and the last view.
 *
 * Tables: `display`, `instrument`, `last_view`, `tab` (the tab view's position, ADR-25) and
 * `audio` (volume and mute, ADR-28).
 * Adding a key or table whose absence means its default is not a format change: older files
 * load with the default, so the version stays.
 *
 * The file is hand-editable TOML with snake_case keys; in TypeScript it is a `Settings` object.
 * Reading is forgiving: a value that is missing or invalid falls back to its default and is
 * reported, so one typo doesn't reset everything. Only a file that isn't TOML, or has a
 * version this app can't migrate, is unusable as a whole.
 *
 * Tuning, root and scale are kept as plain strings here: whether they name a catalog entry is
 * for the catalogs to decide (#3, #4), not for the settings file.
 */
import { parse, stringify } from 'smol-toml';

/** Current version of the settings file format. */
export const SETTINGS_VERSION = 1;

export const ACCIDENTALS = ['sharps', 'flats'] as const;
export const LABEL_MODES = ['notes', 'intervals', 'none'] as const;
export const THEMES = ['system', 'light', 'dark'] as const;
export const INSTRUMENT_KINDS = ['guitar', 'bass'] as const;
/** Tab positions (ADR-7): a 3-notes-per-string pattern or a fret window. */
export const POSITION_SYSTEMS = ['3nps', 'window'] as const;
/** The order the tab plays a position in. */
export const DIRECTIONS = ['ascending', 'descending', 'both'] as const;

/** Volume is a whole percent. */
export const MAX_VOLUME = 100;

export const MIN_STRINGS = 4;
export const MAX_STRINGS = 9;
export const MIN_FRETS = 12;
export const MAX_FRETS = 27;
/** The widest fret window: an octave of frets. */
export const MAX_WINDOW_SPAN = 12;
/** Highest 3NPS pattern index: a scale has at most 12 degrees. */
export const MAX_PATTERN = 11;

export type Accidentals = (typeof ACCIDENTALS)[number];
export type LabelMode = (typeof LABEL_MODES)[number];
export type Theme = (typeof THEMES)[number];
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];
export type PositionSystem = (typeof POSITION_SYSTEMS)[number];
export type Direction = (typeof DIRECTIONS)[number];

export interface Settings {
  /** How non-root notes are spelled (ADR-6). */
  accidentals: Accidentals;
  /** What fretboard dots show. */
  labels: LabelMode;
  theme: Theme;
  leftHanded: boolean;
  instrument: {
    kind: InstrumentKind;
    strings: number;
    /** Tuning id from the tuning catalog or the user's tunings. */
    tuning: string;
    frets: number;
    /** Capo fret; 0 is no capo. Always below `frets`. */
    capo: number;
  };
  lastView: {
    /** Root as the user typed or picked it; its spelling is kept (ADR-6). */
    root: string;
    /** Scale id from the scale catalog or the user's scales. */
    scale: string;
  };
  /** The position shown as tab and highlighted on the neck (ADR-25). */
  tab: {
    system: PositionSystem;
    /**
     * The 3NPS pattern, as the index of the scale degree it starts on (0 = from the root). If
     * that pattern doesn't fit the neck the first one that does is shown; this stays as is.
     */
    pattern: number;
    /** First fret of the fret window (absolute, ADR-18). */
    windowStart: number;
    /** Frets in the window. */
    windowSpan: number;
    direction: Direction;
    /** Dim the scale notes outside the position on the fretboard. */
    highlight: boolean;
  };
  /** Sound (ADR-28). */
  audio: {
    /** Master volume, 0 to 100 percent. */
    volume: number;
    /** No sound at all; the volume is kept. */
    muted: boolean;
  };
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  accidentals: 'sharps',
  labels: 'notes',
  theme: 'system',
  leftHanded: false,
  instrument: Object.freeze({
    kind: 'guitar',
    strings: 6,
    tuning: 'guitar-6-standard',
    frets: 24,
    capo: 0,
  }),
  lastView: Object.freeze({ root: 'C', scale: 'major' }),
  tab: Object.freeze({
    system: '3nps',
    pattern: 0,
    windowStart: 5,
    windowSpan: 4,
    direction: 'ascending',
    highlight: true,
  }),
  audio: Object.freeze({ volume: 70, muted: false }),
});

export function defaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS) as Settings;
}

/** Longest accepted id or root string. */
const MAX_TEXT = 64;

/** The outcome of reading a settings file. */
export type ParsedSettings =
  | {
      ok: true;
      settings: Settings;
      /** Values that were invalid or unknown; invalid ones fell back to their default. */
      problems: string[];
    }
  | {
      ok: false;
      /** Why the file can't be used at all; the caller falls back to defaults. */
      reason: string;
    };

type Doc = Record<string, unknown>;

/**
 * Upgrades a parsed file from version `n` (the key) to `n + 1`. When the format changes:
 * bump `SETTINGS_VERSION`, add the step from the old version here, and test it. Versions with
 * no path to the current one are unusable (the app warns and uses defaults).
 */
const MIGRATIONS: Record<number, (doc: Doc) => Doc> = {};

function migrate(doc: Doc): { doc: Doc } | { reason: string } {
  let version = doc.version;
  if (version === undefined) return { reason: 'it has no version' };
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { reason: `its version ${JSON.stringify(version)} is not a whole number` };
  }
  if (version > SETTINGS_VERSION) {
    return { reason: `it was written by a newer version of the app (format ${version})` };
  }
  while (version < SETTINGS_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { reason: `its format ${version} is no longer supported` };
    doc = step(doc);
    version += 1;
  }
  return { doc };
}

function isTable(value: unknown): value is Doc {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads typed values out of one table, recording what was wrong. */
class TableReader {
  private readonly seen = new Set<string>();

  constructor(
    private readonly table: Doc,
    private readonly path: string,
    private readonly problems: string[],
  ) {}

  private key(key: string): string {
    return this.path ? `${this.path}.${key}` : key;
  }

  private get(key: string, fallback: unknown, expected: string, valid: (v: unknown) => boolean) {
    this.seen.add(key);
    const value = this.table[key];
    // A missing value is simply the default, so a hand-written file can be minimal.
    if (value === undefined) return fallback;
    if (!valid(value)) {
      this.problems.push(`${this.key(key)} should be ${expected}, not ${JSON.stringify(value)}`);
      return fallback;
    }
    return value;
  }

  oneOf<T extends string>(key: string, options: readonly T[], fallback: T): T {
    const expected = options.map((o) => JSON.stringify(o)).join(' or ');
    return this.get(key, fallback, expected, (v) => options.includes(v as T)) as T;
  }

  boolean(key: string, fallback: boolean): boolean {
    return this.get(key, fallback, 'true or false', (v) => typeof v === 'boolean') as boolean;
  }

  integer(key: string, min: number, max: number, fallback: number): number {
    return this.get(
      key,
      fallback,
      `a whole number from ${min} to ${max}`,
      (v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max,
    ) as number;
  }

  text(key: string, fallback: string): string {
    return this.get(
      key,
      fallback,
      `a text of 1 to ${MAX_TEXT} characters`,
      (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT,
    ) as string;
  }

  section(key: string): TableReader {
    this.seen.add(key);
    const value = this.table[key];
    let table: Doc = {};
    if (isTable(value)) table = value;
    else if (value !== undefined) this.problems.push(`${this.key(key)} should be a table`);
    return new TableReader(table, this.key(key), this.problems);
  }

  /** Marks a key as handled elsewhere. */
  skip(key: string): void {
    this.seen.add(key);
  }

  /** Reports keys nobody asked for (typos, keys from a newer app). Call last. */
  unknownKeys(): void {
    for (const key of Object.keys(this.table)) {
      if (!this.seen.has(key)) this.problems.push(`${this.key(key)} is not a known setting`);
    }
  }
}

/** Parses the text of `settings.toml`. Never throws. */
export function parseSettings(text: string): ParsedSettings {
  let doc: Doc;
  try {
    doc = parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { ok: false, reason: `it is not valid TOML (${detail})` };
  }
  const migrated = migrate(doc);
  if ('reason' in migrated) return { ok: false, reason: migrated.reason };

  const problems: string[] = [];
  const d = DEFAULT_SETTINGS;
  const root = new TableReader(migrated.doc, '', problems);
  root.skip('version'); // checked by migrate()

  const display = root.section('display');
  const accidentals = display.oneOf('accidentals', ACCIDENTALS, d.accidentals);
  const labels = display.oneOf('labels', LABEL_MODES, d.labels);
  const theme = display.oneOf('theme', THEMES, d.theme);
  const leftHanded = display.boolean('left_handed', d.leftHanded);
  display.unknownKeys();

  const inst = root.section('instrument');
  const kind = inst.oneOf('kind', INSTRUMENT_KINDS, d.instrument.kind);
  const strings = inst.integer('strings', MIN_STRINGS, MAX_STRINGS, d.instrument.strings);
  const tuning = inst.text('tuning', d.instrument.tuning);
  const frets = inst.integer('frets', MIN_FRETS, MAX_FRETS, d.instrument.frets);
  const capo = inst.integer('capo', 0, frets - 1, d.instrument.capo);
  inst.unknownKeys();

  const view = root.section('last_view');
  const rootNote = view.text('root', d.lastView.root);
  const scale = view.text('scale', d.lastView.scale);
  view.unknownKeys();

  const tabTable = root.section('tab');
  const tab: Settings['tab'] = {
    system: tabTable.oneOf('system', POSITION_SYSTEMS, d.tab.system),
    pattern: tabTable.integer('pattern', 0, MAX_PATTERN, d.tab.pattern),
    windowStart: tabTable.integer('window_start', 0, MAX_FRETS, d.tab.windowStart),
    windowSpan: tabTable.integer('window_span', 1, MAX_WINDOW_SPAN, d.tab.windowSpan),
    direction: tabTable.oneOf('direction', DIRECTIONS, d.tab.direction),
    highlight: tabTable.boolean('highlight', d.tab.highlight),
  };
  tabTable.unknownKeys();

  const audioTable = root.section('audio');
  const audio: Settings['audio'] = {
    volume: audioTable.integer('volume', 0, MAX_VOLUME, d.audio.volume),
    muted: audioTable.boolean('muted', d.audio.muted),
  };
  audioTable.unknownKeys();

  root.unknownKeys();

  return {
    ok: true,
    settings: {
      accidentals,
      labels,
      theme,
      leftHanded,
      instrument: { kind, strings, tuning, frets, capo },
      lastView: { root: rootNote, scale },
      tab,
      audio,
    },
    problems,
  };
}

const HEADER = `# Chords & Scales settings. You can edit this file while the app is closed.
# A value the app doesn't understand falls back to its default, with a warning.
`;

/** The text of `settings.toml` for `settings`. */
export function serializeSettings(settings: Settings): string {
  const doc = {
    version: SETTINGS_VERSION,
    display: {
      accidentals: settings.accidentals,
      labels: settings.labels,
      theme: settings.theme,
      left_handed: settings.leftHanded,
    },
    instrument: { ...settings.instrument },
    last_view: { ...settings.lastView },
    tab: {
      system: settings.tab.system,
      pattern: settings.tab.pattern,
      window_start: settings.tab.windowStart,
      window_span: settings.tab.windowSpan,
      direction: settings.tab.direction,
      highlight: settings.tab.highlight,
    },
    audio: { volume: settings.audio.volume, muted: settings.audio.muted },
  };
  return `${HEADER}\n${stringify(doc).trimEnd()}\n`;
}
