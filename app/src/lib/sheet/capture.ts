/**
 * Sheet items made from what the app shows now (ADR-43): the current settings, the tab's
 * position and the chosen chord, copied, so later changes in the app leave the item as
 * it was added.
 */
import { displayRoot, resolveScale } from '../explorer/view';
import { instrumentTuning } from '../instrument/tuning';
import { viewOf as copyOf, type SheetItem, type SheetSettings } from './schema';

/**
 * The settings as the app draws them, copied: a stored root, scale or tuning the app couldn't
 * use is replaced by what it shows instead (ADR-23), so the item draws what was on screen.
 */
function viewOf(settings: SheetSettings): SheetSettings {
  const view = copyOf(settings);
  const { root, scale } = resolveScale(settings);
  if (displayRoot(view.lastView.root) === undefined) view.lastView.root = root;
  view.lastView.scale = scale.id;
  view.instrument.tuning = instrumentTuning(settings.instrument).id;
  return view;
}

type ItemOf<K extends SheetItem['kind']> = Extract<SheetItem, { kind: K }>;

/** The scale on the neck, as the explorer shows it (with the tab position's highlight). */
export function scaleItem(settings: SheetSettings): ItemOf<'scale'> {
  return { kind: 'scale', view: viewOf(settings) };
}

/**
 * The tab of the position shown. `pattern` is the 3NPS pattern the tab shows, which may not be
 * the stored one when that doesn't fit (ADR-25); the item keeps the one that was on screen.
 */
export function tabItem(settings: SheetSettings, pattern: number | null): ItemOf<'tab'> {
  const view = viewOf(settings);
  if (pattern !== null) view.tab.pattern = pattern;
  return { kind: 'tab', view };
}

/** The chord the panel shows, as the neck draws it: alone, or over the scale for a degree. */
export interface CapturedChord {
  root: string;
  chordId: string;
  fromScale: boolean;
  bass?: string;
}

export function chordItem(settings: SheetSettings, chord: CapturedChord): ItemOf<'chord'> {
  return {
    kind: 'chord',
    view: viewOf(settings),
    chord: {
      root: chord.root,
      id: chord.chordId,
      overScale: chord.fromScale,
      ...(chord.bass ? { bass: chord.bass } : {}),
    },
  };
}

/**
 * A shape from the voicing browser, as its chord diagram; `shape` is its `shapeKey`
 * (`x,3,2,0,1,0`), so this module needs nothing from `voicings/`.
 */
export function voicingItem(
  settings: SheetSettings,
  chord: { root: string; chordId: string },
  shape: string,
): ItemOf<'voicing'> {
  return {
    kind: 'voicing',
    view: viewOf(settings),
    chord: { root: chord.root, id: chord.chordId, overScale: false, shape },
  };
}
