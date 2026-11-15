/**
 * The scale explorer's view model: what the fretboard and the scale summary show for the
 * current settings (ADR-23). It only looks things up in the core's answers; every note name,
 * interval label and position comes from WASM (AGENTS.md: no theory in TypeScript).
 */
import type { FretboardDot } from '../fretboard';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import {
  playingOrder,
  tabPosition,
  tabStrings,
  type TabPosition,
  type TabString,
} from '../tab/position';
import {
  fretboardPositions,
  formatNoteName,
  getScale,
  getTuning,
  scaleNotes,
  spellPitchClass,
  type ScaleInfo,
  type ScaleNote,
  type Tuning,
} from '../theory';

export interface ExplorerView {
  /** The root as displayed, in the spelling the user typed or picked: `D♭`. */
  root: string;
  scale: ScaleInfo;
  /** The scale's notes on the root, in formula order. */
  notes: ScaleNote[];
  tuning: Tuning;
  frets: number;
  capo: number;
  /**
   * The scale's notes on the whole neck. With highlighting on, the ones outside the tab's
   * position are dimmed (ADR-25).
   */
  dots: FretboardDot[];
  /** The position the tab shows, from the core. */
  position: TabPosition;
  /** The tab's lines, string 1 first. */
  tabStrings: TabString[];
  /** The position's notes in playing order, for the tab. */
  tabNotes: { string: number; fret: number; root: boolean; midi: number }[];
  /**
   * The sounding pitch of every dot, as the core reports it (a MIDI number), by `string:fret`
   * (see `positionKey`). For playing a clicked dot.
   */
  pitches: Map<string, number>;
  /**
   * Stored values that couldn't be used, each replaced by its default for display (the
   * settings themselves are left alone, so a user file added later can still provide them).
   */
  fallbacks: string[];
}

/** The key of a neck position in `ExplorerView.pitches`. */
export const positionKey = (p: { string: number; fret: number }): string => `${p.string}:${p.fret}`;

/** Reads a note name through the core; `undefined` if it isn't one. */
export function displayRoot(text: string): string | undefined {
  try {
    return formatNoteName(text.trim());
  } catch {
    return undefined;
  }
}

/**
 * The roots offered in the root picker: every pitch class spelled with sharps and with flats,
 * by the core, without repeats: `C, C♯, D♭, D, …`.
 */
export function rootChoices(): string[] {
  const names = new Set<string>();
  for (let pc = 0; pc < 12; pc++) {
    names.add(spellPitchClass(pc, 'sharps'));
    names.add(spellPitchClass(pc, 'flats'));
  }
  return [...names];
}

type ViewSettings = Pick<Settings, 'accidentals' | 'labels' | 'instrument' | 'lastView' | 'tab'>;

/** What to show for `settings`. Unusable stored values fall back to the defaults. */
export function explorerView(settings: ViewSettings): ExplorerView {
  const fallbacks: string[] = [];
  const defaults = DEFAULT_SETTINGS;

  let root = displayRoot(settings.lastView.root);
  if (root === undefined) {
    fallbacks.push(
      `“${settings.lastView.root}” is not a note name; showing ${defaults.lastView.root}.`,
    );
    root = displayRoot(defaults.lastView.root)!;
  }

  let scale = getScale(settings.lastView.scale);
  if (!scale) {
    scale = getScale(defaults.lastView.scale)!;
    fallbacks.push(`There is no scale “${settings.lastView.scale}”; showing ${scale.name}.`);
  }

  let tuning = getTuning(settings.instrument.tuning);
  if (!tuning) {
    tuning = getTuning(defaults.instrument.tuning)!;
    fallbacks.push(
      `There is no tuning “${settings.instrument.tuning}”; showing ${tuning.name} (${tuning.notes.length} strings).`,
    );
  }

  const { frets, capo } = settings.instrument;
  const notes = scaleNotes(scale.id, root, settings.accidentals);
  const byPitchClass = new Map(notes.map((note) => [note.pitchClass, note]));
  const positions = fretboardPositions(
    tuning,
    frets,
    capo,
    notes.map((note) => note.pitchClass),
    notes[0].pitchClass,
  );

  const label = (pitchClass: number): string => {
    const note = byPitchClass.get(pitchClass);
    if (!note) return '';
    switch (settings.labels) {
      case 'notes':
        return note.name;
      case 'intervals':
        // The scale's own label (♯4 in Lydian), not the default one for the semitones.
        return note.interval;
      case 'none':
        return '';
    }
  };

  const position = tabPosition({ tuning, frets, capo, notes, tab: settings.tab });
  const key = positionKey;
  const inPosition = new Set(position.positions.map(key));
  // An empty position (nothing fits) dims nothing, so the neck never goes all grey.
  const dim = settings.tab.highlight && inPosition.size > 0;

  const dots: FretboardDot[] = positions.map((p) => ({
    string: p.string,
    fret: p.fret,
    label: label(p.pitchClass),
    role: dim && !inPosition.has(key(p)) ? 'dim' : p.degree === 0 ? 'root' : 'tone',
    degree: p.degree,
  }));

  const tabNotes = playingOrder(position.positions, settings.tab.direction).map((p) => ({
    string: p.string,
    fret: p.fret,
    root: p.degree === 0,
    midi: p.midi,
  }));
  const pitches = new Map(positions.map((p) => [key(p), p.midi]));

  return {
    root,
    scale,
    notes,
    tuning,
    frets,
    capo,
    dots,
    position,
    tabStrings: tabStrings(tuning, settings.accidentals),
    tabNotes,
    pitches,
    fallbacks,
  };
}
