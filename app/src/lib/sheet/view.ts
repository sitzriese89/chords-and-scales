/**
 * What the export sheet draws for an item (ADR-43): the props of the app's own components,
 * computed by the same view models the app uses (`explorerView`, `voicingList`) from what the
 * item stored. No theory here; every note, position and shape comes from the core.
 *
 * An item whose root, scale, chord, tuning or shape can't be found any more (a user item
 * deleted, a file edited by hand) is `missing`, with the reason, and the rest of the sheet is
 * drawn as usual. The item stays in the file, so it comes back if the user item does.
 */
import { chordSymbol } from '../chords/display';
import { displayRoot, explorerView } from '../explorer/view';
import type { FretboardDot } from '../fretboard';
import { DEFAULT_SETTINGS } from '../settings';
import type { TabString } from '../tab/position';
import { getChord, getScale, getTuning, type ChordVoicing, type VoicedString } from '../theory';
import { shapeText } from '../voicings/diagram';
import { dotLabeller, shapeKey, voicingList } from '../voicings/list';
import type { SheetItem, SheetSettings } from './schema';

/** How many of the core's shapes are searched for a stored one. */
export const SHAPE_SEARCH_LIMIT = 1000;

/** The instrument line under an item's title: `Standard tuning (6 strings), capo 2`. */
function instrumentLine(view: SheetSettings, tuningName: string, strings: number): string {
  const capo = view.instrument.capo > 0 ? `, capo ${view.instrument.capo}` : '';
  return `${tuningName} tuning (${strings} strings)${capo}`;
}

interface Drawn {
  title: string;
  /** The tuning and capo it is drawn on. */
  caption: string;
}

export type SheetItemView =
  | (Drawn & {
      kind: 'fretboard';
      strings: number;
      frets: number;
      capo: number;
      dots: FretboardDot[];
      leftHanded: boolean;
    })
  | (Drawn & {
      kind: 'tab';
      strings: TabString[];
      notes: { string: number; fret: number; root: boolean }[];
      capo: number;
    })
  | (Drawn & {
      kind: 'diagram';
      voicing: ChordVoicing;
      capo: number;
      leftHanded: boolean;
      label: (note: VoicedString) => string;
    })
  | { kind: 'missing'; title: string; reason: string };

/** What is gone, if anything: the reason the item can't be drawn. */
function missingReason(item: SheetItem): string | null {
  const { view } = item;
  if (!getTuning(view.instrument.tuning)) {
    return `The tuning “${view.instrument.tuning}” no longer exists.`;
  }
  const needsScale =
    item.kind === 'scale' || item.kind === 'tab' || (item.kind === 'chord' && item.chord.overScale);
  if (needsScale) {
    if (displayRoot(view.lastView.root) === undefined) {
      return `“${view.lastView.root}” is not a note name.`;
    }
    if (!getScale(view.lastView.scale)) {
      return `The scale “${view.lastView.scale}” no longer exists.`;
    }
  }
  if (item.kind === 'chord' || item.kind === 'voicing') {
    if (displayRoot(item.chord.root) === undefined) {
      return `“${item.chord.root}” is not a note name.`;
    }
    if (!getChord(item.chord.id)) return `The chord “${item.chord.id}” no longer exists.`;
  }
  return null;
}

/** A short name for an item that can't be drawn, from what it stored. */
function storedTitle(item: SheetItem): string {
  switch (item.kind) {
    case 'scale':
      return `${item.view.lastView.root} ${item.view.lastView.scale}`;
    case 'tab':
      return `Tab: ${item.view.lastView.root} ${item.view.lastView.scale}`;
    case 'chord':
      return `${item.chord.root} ${item.chord.id}`;
    case 'voicing':
      return `${item.chord.root} ${item.chord.id}: ${item.chord.shape}`;
  }
}

/**
 * The item as the sheet draws it. Read the catalogs' `revision` with it (ADR-24): a user scale,
 * chord or tuning can change.
 */
export function sheetItemView(item: SheetItem): SheetItemView {
  const reason = missingReason(item);
  if (reason) return { kind: 'missing', title: storedTitle(item), reason };

  const { view } = item;
  // The tab and display settings the views read; the others don't matter here.
  const settings = { ...view, tab: { ...view.tab } };

  if (item.kind === 'voicing') {
    const chord = { root: displayRoot(item.chord.root)!, chordId: item.chord.id };
    const voicing = voicingList(settings, chord, SHAPE_SEARCH_LIMIT).find(
      (v) => shapeKey(v) === item.chord.shape,
    );
    const name = chordSymbol(chord.root, { id: chord.chordId }, view.chordSymbols);
    if (!voicing) {
      return {
        kind: 'missing',
        title: `${name}: ${item.chord.shape}`,
        reason: `The shape ${item.chord.shape} is not a voicing of ${name} on this neck any more.`,
      };
    }
    const tuning = getTuning(view.instrument.tuning)!;
    return {
      kind: 'diagram',
      title: `${name}: ${shapeText(voicing)}`,
      caption: instrumentLine(view, tuning.name, tuning.notes.length),
      voicing,
      capo: view.instrument.capo,
      leftHanded: view.leftHanded,
      label: dotLabeller(view.labels, chord, view.accidentals),
    };
  }

  if (item.kind === 'chord') {
    // A chord alone needs no scale; any valid one keeps the explorer's view model happy.
    if (!item.chord.overScale) settings.lastView = { ...DEFAULT_SETTINGS.lastView };
    const shown = explorerView(settings, {
      root: displayRoot(item.chord.root)!,
      chordId: item.chord.id,
      fromScale: item.chord.overScale,
      bass: item.chord.bass,
    });
    const chordName = shown.chord?.name ?? item.chord.id;
    return {
      kind: 'fretboard',
      title: item.chord.overScale
        ? `${chordName} over ${shown.root} ${shown.scale.name}`
        : chordName,
      caption: instrumentLine(view, shown.tuning.name, shown.tuning.notes.length),
      strings: shown.tuning.notes.length,
      frets: shown.frets,
      capo: shown.capo,
      dots: shown.dots,
      leftHanded: view.leftHanded,
    };
  }

  const shown = explorerView(settings);
  const name = `${shown.root} ${shown.scale.name}`;
  const caption = instrumentLine(view, shown.tuning.name, shown.tuning.notes.length);
  if (item.kind === 'tab') {
    return {
      kind: 'tab',
      title: `${name}, ${shown.position.description}`,
      caption,
      strings: shown.tabStrings,
      notes: shown.tabNotes.map(({ string, fret, root }) => ({ string, fret, root })),
      capo: shown.capo,
    };
  }
  return {
    kind: 'fretboard',
    title: name,
    caption,
    strings: shown.tuning.notes.length,
    frets: shown.frets,
    capo: shown.capo,
    dots: shown.dots,
    leftHanded: view.leftHanded,
  };
}
