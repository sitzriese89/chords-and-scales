// Layout of the fretboard drawing, in SVG user units. Pure geometry, no music theory: it
// places frets, strings and inlays, and mirrors everything for left-handed players.
//
// The drawing has the same width whatever the fret count, so in a given container the string
// spacing is the same for 12 or 27 frets; only the frets get narrower.

/** Distance between neighbouring strings. */
export const STRING_GAP = 28;
/** Distance from the nut to the last fret wire. */
export const NECK_WIDTH = 1300;
/** Largest dot radius; the root square has the same half width. */
export const MAX_DOT_RADIUS = 10.5;
/** Room kept free between a dot and the fret wires of its space. */
export const DOT_CLEARANCE = 5;
/** Space left of the nut for open-string dots. */
export const OPEN_WIDTH = 34;
export const NUT_WIDTH = 6;
export const INLAY_RADIUS = 5;
const PAD_X = 6;
const PAD_TOP = 8;
/** Board beyond the last fret wire. */
const TAIL = 10;
/** Room under the board for fret numbers. */
const NUMBERS_HEIGHT = 22;

export interface Span {
  /** Left edge in the drawing (after mirroring). */
  x: number;
  width: number;
}

export interface Inlay {
  fret: number;
  x: number;
  ys: number[];
}

export interface FretboardLayout {
  width: number;
  height: number;
  /** Top and bottom edge of the board. */
  boardTop: number;
  boardBottom: number;
  /** The wooden board, from the nut to past the last fret. */
  board: Span;
  nut: Span;
  /** Radius of a tone dot (half width of the root square), small enough for the last fret. */
  dotRadius: number;
  /** Radius of a dimmed dot. */
  dimRadius: number;
  /** x of fret wire n, for n = 1..frets. */
  fretWireX: (fret: number) => number;
  /** x of the centre of a dot on this fret (0 = open string, left of the nut). */
  fretCenterX: (fret: number) => number;
  /** The clickable span of a fret: the space between its wires (or the open area). */
  fretSpan: (fret: number) => Span;
  /** y of string s, for s = 1 (top) ..strings. */
  stringY: (string: number) => number;
  /** y of the fret numbers under the board. */
  numbersY: number;
  inlays: Inlay[];
}

/** Frets that carry an inlay: 3, 5, 7, 9 and their octave repeats single, 12 and 24 double. */
export function inlayFrets(frets: number): { fret: number; double: boolean }[] {
  const out: { fret: number; double: boolean }[] = [];
  for (let fret = 1; fret <= frets; fret++) {
    const m = fret % 12;
    if (m === 0) out.push({ fret, double: true });
    else if (m === 3 || m === 5 || m === 7 || m === 9) out.push({ fret, double: false });
  }
  return out;
}

/**
 * Where fret wire n sits as a fraction of the scale length, measured from the nut. Real
 * fretboards place it at 1 - 2^(-n/12), so every fret space is 2^(1/12) times narrower than
 * the one before.
 */
function wireFraction(fret: number): number {
  return 1 - 2 ** (-fret / 12);
}

export function fretboardLayout(opts: {
  strings: number;
  frets: number;
  leftHanded?: boolean;
}): FretboardLayout {
  const strings = Math.max(1, Math.floor(opts.strings));
  const frets = Math.max(1, Math.floor(opts.frets));
  const leftHanded = opts.leftHanded ?? false;

  // Scale length chosen so the last fret wire lands at NECK_WIDTH; dots shrink if the last
  // (narrowest) fret space can't hold a full-size one.
  const scaleLength = NECK_WIDTH / wireFraction(frets);
  const lastSpace = scaleLength * (wireFraction(frets) - wireFraction(frets - 1));
  const dotRadius = Math.min(MAX_DOT_RADIUS, (lastSpace - DOT_CLEARANCE) / 2);

  // Right-handed coordinates; mirrored below.
  const openLeft = PAD_X;
  const nutLeft = openLeft + OPEN_WIDTH;
  const nutRight = nutLeft + NUT_WIDTH;
  const wire = (fret: number) => nutRight + scaleLength * wireFraction(fret);
  const boardRight = wire(frets) + TAIL;
  const width = boardRight + PAD_X;

  const boardTop = PAD_TOP;
  const boardBottom = boardTop + strings * STRING_GAP;
  const height = boardBottom + NUMBERS_HEIGHT;

  const mx = (x: number) => (leftHanded ? width - x : x);
  const mspan = (left: number, right: number): Span =>
    leftHanded ? { x: width - right, width: right - left } : { x: left, width: right - left };

  const center = (fret: number) =>
    fret === 0 ? (openLeft + nutLeft) / 2 : (wire(fret - 1) + wire(fret)) / 2;
  const stringY = (string: number) => boardTop + STRING_GAP / 2 + (string - 1) * STRING_GAP;

  const boardHeight = boardBottom - boardTop;
  const inlays = inlayFrets(frets).map(({ fret, double }) => ({
    fret,
    x: mx(center(fret)),
    ys: double
      ? [boardTop + boardHeight / 4, boardTop + (3 * boardHeight) / 4]
      : [boardTop + boardHeight / 2],
  }));

  return {
    width,
    height,
    boardTop,
    boardBottom,
    board: mspan(nutRight, boardRight),
    nut: mspan(nutLeft, nutRight),
    dotRadius,
    dimRadius: dotRadius * 0.7,
    fretWireX: (fret) => mx(wire(fret)),
    fretCenterX: (fret) => mx(center(fret)),
    fretSpan: (fret) => (fret === 0 ? mspan(openLeft, nutLeft) : mspan(wire(fret - 1), wire(fret))),
    stringY,
    numbersY: boardBottom + NUMBERS_HEIGHT / 2 + 2,
    inlays,
  };
}
