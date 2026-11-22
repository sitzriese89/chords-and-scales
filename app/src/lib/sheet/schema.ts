/**
 * The export sheet document `sheet.toml` (SPEC §5.10, ADR-43): a title, the sheet's own theme
 * and light/dark choice, and the items in order.
 *
 * An item stores what produced it, not a drawing: its kind (a scale on the neck, a scale
 * position as tab, a chord on the neck, a chord shape as a diagram), the root as typed, the
 * scale or chord id, the shape's frets, and a snapshot of the instrument and display settings
 * at the time it was added. The sheet draws it again from these with the app's own components,
 * so it looks as it did on screen (ADR-3).
 *
 * ```toml
 * version = 1
 * title = "Practice"
 * theme_id = "print"
 * theme = "light"
 *
 * [[item]]
 * kind = "scale"            # "scale" | "tab" | "chord" | "voicing"
 * [item.display]            # accidentals, labels, left_handed, chord_symbols
 * [item.instrument]         # kind, strings, tuning, frets, capo
 * [item.scale]              # root, scale: scale and tab items, a chord over its scale
 * [item.tab]                # the [tab] keys of settings.toml: scale and tab items
 * [item.chord]              # root, id, bass, over_scale; shape = "x,3,2,0,1,0" for a voicing
 * [item.voicings]           # the [voicings] keys of settings.toml: voicing items
 * ```
 *
 * Reading is forgiving, like the settings (ADR-17): a missing value is its default, an invalid
 * one falls back to its default with a warning. An item that can't be drawn at all (no or an
 * unknown kind, no root or id, a malformed shape) is dropped with a warning; the other items
 * load. Only a file that isn't TOML or has a version this app can't migrate is unusable.
 * Whether an id names a catalog entry is checked when the item is drawn (`view.ts`).
 */
import { parse, stringify } from 'smol-toml';
import {
  ACCIDENTALS,
  CHORD_SYMBOL_STYLES,
  DEFAULT_SETTINGS,
  DIRECTIONS,
  INSTRUMENT_KINDS,
  isTable,
  LABEL_MODES,
  MAX_FRETS,
  MAX_PATTERN,
  MAX_STRINGS,
  MAX_VOICING_SPAN,
  MAX_WINDOW_SPAN,
  migrateDocument,
  MIN_FRETS,
  MIN_STRINGS,
  POSITION_SYSTEMS,
  TableReader,
  type Doc,
  type Settings,
} from '../settings/schema';

/** Current version of the sheet file format. */
export const SHEET_VERSION = 1;

export const SHEET_ITEM_KINDS = ['scale', 'tab', 'chord', 'voicing'] as const;
export type SheetItemKind = (typeof SHEET_ITEM_KINDS)[number];

/** The sheet's light/dark choice. A theme with one scheme always shows that one. */
export const SHEET_SCHEMES = ['light', 'dark'] as const;
export type SheetScheme = (typeof SHEET_SCHEMES)[number];

/** A new sheet is printed: the Print theme, light. */
export const DEFAULT_SHEET_THEME_ID = 'print';
export const DEFAULT_SHEET_TITLE = 'Sheet';
export const MAX_SHEET_TITLE = 120;

/**
 * The settings an item was added with: what the explorer, tab, chord overlay and voicing list
 * read (`explorerView`, `voicingList`). `lastView` is the scale (scale and tab items, and the
 * scale behind a chord from a degree); `tab` the position; `voicings` the constraints a shape
 * was listed under.
 */
export type SheetSettings = Pick<
  Settings,
  | 'accidentals'
  | 'labels'
  | 'leftHanded'
  | 'chordSymbols'
  | 'instrument'
  | 'lastView'
  | 'tab'
  | 'voicings'
>;

/** The chord of a chord or voicing item. */
export interface SheetChord {
  /** The root as displayed when it was added (`D♭`). */
  root: string;
  /** Chord id from the catalog or the user's chords. */
  id: string;
  /** The bass of a typed slash chord (`E` in `Am7/E`), written in the name only (ADR-33). */
  bass?: string;
  /** The chord came from a degree of `view.lastView`, drawn over the dimmed scale. */
  overScale: boolean;
  /** A voicing's frets, lowest string first, `x` muted: `x,3,2,0,1,0` (`shapeKey`). */
  shape?: string;
}

export type SheetItem =
  | { kind: 'scale'; view: SheetSettings }
  | { kind: 'tab'; view: SheetSettings }
  | { kind: 'chord'; view: SheetSettings; chord: SheetChord }
  | { kind: 'voicing'; view: SheetSettings; chord: SheetChord & { shape: string } };

export interface Sheet {
  title: string;
  /** A built-in theme's id or a user theme's (ADR-40); one that is gone shows Print. */
  themeId: string;
  scheme: SheetScheme;
  items: SheetItem[];
}

export function emptySheet(): Sheet {
  return {
    title: DEFAULT_SHEET_TITLE,
    themeId: DEFAULT_SHEET_THEME_ID,
    scheme: 'light',
    items: [],
  };
}

/** The parts of the settings an item keeps, copied. */
export function viewOf(settings: SheetSettings): SheetSettings {
  return structuredClone({
    accidentals: settings.accidentals,
    labels: settings.labels,
    leftHanded: settings.leftHanded,
    chordSymbols: settings.chordSymbols,
    instrument: { ...settings.instrument },
    lastView: { ...settings.lastView },
    tab: { ...settings.tab },
    voicings: { ...settings.voicings },
  });
}

/** A shape as written in the file: 4 to 9 strings, each `x` or a fret 0–27. */
const SHAPE = /^(x|\d{1,2})(,(x|\d{1,2})){3,8}$/;

export function isShape(text: string): boolean {
  return SHAPE.test(text) && text.split(',').every((f) => f === 'x' || Number(f) <= MAX_FRETS);
}

export type ParsedSheet =
  | {
      ok: true;
      sheet: Sheet;
      /** Values that fell back to their default, and items that were dropped. */
      problems: string[];
    }
  | { ok: false; reason: string };

/** Upgrades a parsed sheet from version `n` to `n + 1` (see the settings' `MIGRATIONS`). */
const MIGRATIONS: Record<number, (doc: Doc) => Doc> = {};

/** The item's display and instrument snapshot, with defaults for what is missing. */
function readView(item: TableReader): SheetSettings {
  const d = DEFAULT_SETTINGS;
  const display = item.section('display');
  const accidentals = display.oneOf('accidentals', ACCIDENTALS, d.accidentals);
  const labels = display.oneOf('labels', LABEL_MODES, d.labels);
  const leftHanded = display.boolean('left_handed', d.leftHanded);
  const chordSymbols = display.oneOf('chord_symbols', CHORD_SYMBOL_STYLES, d.chordSymbols);
  display.unknownKeys();

  const inst = item.section('instrument');
  const kind = inst.oneOf('kind', INSTRUMENT_KINDS, d.instrument.kind);
  const strings = inst.integer('strings', MIN_STRINGS, MAX_STRINGS, d.instrument.strings);
  const tuning = inst.text('tuning', d.instrument.tuning);
  const frets = inst.integer('frets', MIN_FRETS, MAX_FRETS, d.instrument.frets);
  const capo = inst.integer('capo', 0, frets - 1, d.instrument.capo);
  inst.unknownKeys();

  const tabTable = item.section('tab');
  const tab: Settings['tab'] = {
    system: tabTable.oneOf('system', POSITION_SYSTEMS, d.tab.system),
    pattern: tabTable.integer('pattern', 0, MAX_PATTERN, d.tab.pattern),
    windowStart: tabTable.integer('window_start', 0, MAX_FRETS, d.tab.windowStart),
    windowSpan: tabTable.integer('window_span', 1, MAX_WINDOW_SPAN, d.tab.windowSpan),
    direction: tabTable.oneOf('direction', DIRECTIONS, d.tab.direction),
    highlight: tabTable.boolean('highlight', d.tab.highlight),
  };
  tabTable.unknownKeys();

  const voicingTable = item.section('voicings');
  const voicings: Settings['voicings'] = {
    maxSpan: voicingTable.integer('max_span', 1, MAX_VOICING_SPAN, d.voicings.maxSpan),
    openStrings: voicingTable.boolean('open_strings', d.voicings.openStrings),
    mutedStrings: voicingTable.boolean('muted_strings', d.voicings.mutedStrings),
    inversions: voicingTable.boolean('inversions', d.voicings.inversions),
    startFret: voicingTable.integer('start_fret', 0, MAX_FRETS, d.voicings.startFret),
  };
  voicingTable.unknownKeys();

  return {
    accidentals,
    labels,
    leftHanded,
    chordSymbols,
    instrument: { kind, strings, tuning, frets, capo },
    lastView: { ...d.lastView },
    tab,
    voicings,
  };
}

/** The reason an item can't be drawn at all, if a value it can't do without is missing. */
type Required = (table: TableReader, key: string, what: string) => string | undefined;

/** Reads one `[[item]]`; `null` with the reason in `problems` when it must be dropped. */
function readItem(value: unknown, path: string, problems: string[]): SheetItem | null {
  if (!isTable(value)) {
    problems.push(`${path} is dropped because it is not a table`);
    return null;
  }
  // Problems that only cost a default are kept; one that costs the item replaces them.
  const own: string[] = [];
  const item = new TableReader(value, path, own);
  const dropped: string[] = [];
  const required: Required = (table, key, what) => {
    if (!table.has(key)) {
      dropped.push(`it has no ${what}`);
      return undefined;
    }
    const before = own.length;
    const text = table.text(key, '');
    if (own.length > before) {
      dropped.push(`its ${what} ${own.pop()!.replace(/^.*? should /, 'should ')}`);
      return undefined;
    }
    return text;
  };

  const kindValue = item.has('kind') ? value.kind : undefined;
  const kind = SHEET_ITEM_KINDS.find((k) => k === kindValue);
  item.skip('kind');
  if (!kind) {
    problems.push(
      kindValue === undefined
        ? `${path} is dropped because it has no kind`
        : `${path} is dropped because its kind ${JSON.stringify(kindValue)} is not one of ${SHEET_ITEM_KINDS.map((k) => JSON.stringify(k)).join(', ')}`,
    );
    return null;
  }

  const view = readView(item);
  let result: SheetItem | null = null;
  if (kind === 'scale' || kind === 'tab') {
    const scale = item.section('scale');
    const root = required(scale, 'root', 'scale root');
    const id = required(scale, 'scale', 'scale id');
    scale.unknownKeys();
    if (root !== undefined && id !== undefined) {
      view.lastView = { root, scale: id };
      result = { kind, view };
    }
  } else {
    const chordTable = item.section('chord');
    const root = required(chordTable, 'root', 'chord root');
    const id = required(chordTable, 'id', 'chord id');
    const bass = chordTable.has('bass') ? chordTable.text('bass', '') || undefined : undefined;
    const overScale = kind === 'chord' && chordTable.boolean('over_scale', false);
    let shape: string | undefined;
    if (kind === 'voicing') {
      shape = required(chordTable, 'shape', 'shape');
      if (shape !== undefined && !isShape(shape)) {
        dropped.push(`its shape ${JSON.stringify(shape)} is not frets like "x,3,2,0,1,0"`);
        shape = undefined;
      } else if (shape !== undefined && shape.split(',').length !== view.instrument.strings) {
        dropped.push(
          `its shape ${JSON.stringify(shape)} does not have ${view.instrument.strings} strings`,
        );
        shape = undefined;
      }
    } else {
      chordTable.skip('shape');
    }
    chordTable.unknownKeys();
    if (overScale) {
      const scale = item.section('scale');
      const scaleRoot = required(scale, 'root', 'scale root');
      const scaleId = required(scale, 'scale', 'scale id');
      scale.unknownKeys();
      if (scaleRoot !== undefined && scaleId !== undefined) {
        view.lastView = { root: scaleRoot, scale: scaleId };
      }
    } else {
      item.skip('scale');
    }
    if (root !== undefined && id !== undefined && dropped.length === 0) {
      const chord: SheetChord = { root, id, overScale, ...(bass ? { bass } : {}) };
      result =
        kind === 'voicing'
          ? { kind, view, chord: { ...chord, overScale: false, shape: shape! } }
          : { kind, view, chord };
    }
  }
  item.unknownKeys();

  if (dropped.length > 0 || !result) {
    problems.push(`${path} is dropped because ${dropped.join(' and ')}`);
    return null;
  }
  problems.push(...own);
  return result;
}

/** Parses the text of `sheet.toml`. Never throws. */
export function parseSheet(text: string): ParsedSheet {
  let doc: Doc;
  try {
    doc = parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { ok: false, reason: `it is not valid TOML (${detail})` };
  }
  const migrated = migrateDocument(doc, SHEET_VERSION, MIGRATIONS);
  if ('reason' in migrated) return { ok: false, reason: migrated.reason };

  const problems: string[] = [];
  const defaults = emptySheet();
  const root = new TableReader(migrated.doc, '', problems);
  root.skip('version');
  const title = root.text('title', defaults.title, MAX_SHEET_TITLE);
  const themeId = root.text('theme_id', defaults.themeId);
  const scheme = root.oneOf('theme', SHEET_SCHEMES, defaults.scheme);

  root.skip('item');
  const list = migrated.doc.item;
  const items: SheetItem[] = [];
  if (Array.isArray(list)) {
    list.forEach((value, index) => {
      const item = readItem(value, `item ${index + 1}`, problems);
      if (item) items.push(item);
    });
  } else if (list !== undefined) {
    problems.push('item should be a list of [[item]] tables');
  }
  root.unknownKeys();

  return { ok: true, sheet: { title, themeId, scheme, items }, problems };
}

const HEADER = `# Chords & Scales export sheet. You can edit this file while the app is closed.
# Each [[item]] is drawn again from what it stores; an item the app can't read is dropped.
`;

function display(view: SheetSettings) {
  return {
    accidentals: view.accidentals,
    labels: view.labels,
    left_handed: view.leftHanded,
    chord_symbols: view.chordSymbols,
  };
}

function tab(view: SheetSettings) {
  return {
    system: view.tab.system,
    pattern: view.tab.pattern,
    window_start: view.tab.windowStart,
    window_span: view.tab.windowSpan,
    direction: view.tab.direction,
    highlight: view.tab.highlight,
  };
}

/** What `item` writes: only the tables its kind reads. */
function itemDoc(item: SheetItem): Doc {
  const { view } = item;
  const base: Doc = {
    kind: item.kind,
    display: display(view),
    instrument: { ...view.instrument },
  };
  if (item.kind === 'scale' || item.kind === 'tab') {
    return { ...base, scale: { ...view.lastView }, tab: tab(view) };
  }
  const chord: Doc = { root: item.chord.root, id: item.chord.id };
  if (item.chord.bass) chord.bass = item.chord.bass;
  if (item.kind === 'voicing') {
    chord.shape = item.chord.shape;
    return {
      ...base,
      chord,
      voicings: {
        max_span: view.voicings.maxSpan,
        open_strings: view.voicings.openStrings,
        muted_strings: view.voicings.mutedStrings,
        inversions: view.voicings.inversions,
        start_fret: view.voicings.startFret,
      },
    };
  }
  chord.over_scale = item.chord.overScale;
  return item.chord.overScale
    ? { ...base, chord, scale: { ...view.lastView } }
    : { ...base, chord };
}

/** The text of `sheet.toml` for `sheet`. */
export function serializeSheet(sheet: Sheet): string {
  const doc: Doc = {
    version: SHEET_VERSION,
    title: sheet.title,
    theme_id: sheet.themeId,
    theme: sheet.scheme,
  };
  if (sheet.items.length > 0) doc.item = sheet.items.map(itemDoc);
  return `${HEADER}\n${stringify(doc).trimEnd()}\n`;
}
