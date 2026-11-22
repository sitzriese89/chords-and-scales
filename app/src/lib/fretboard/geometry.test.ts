import { describe, expect, it } from 'vitest';
import {
  DOT_CLEARANCE,
  DRAWING_WIDTH,
  MAX_DOT_RADIUS,
  MIN_NECK_SCALE,
  MIN_NECK_WIDTH,
  STRING_GAP,
  fretboardLayout,
  inlayFrets,
} from './geometry';

describe('minimum neck width', () => {
  it('is the drawing at the smallest readable scale, for any neck', () => {
    for (const frets of [12, 24, 27]) {
      for (const strings of [4, 6, 9]) {
        expect(fretboardLayout({ strings, frets }).width).toBeCloseTo(DRAWING_WIDTH, 9);
      }
    }
    expect(MIN_NECK_WIDTH).toBe(954);
    const scale = MIN_NECK_WIDTH / DRAWING_WIDTH;
    expect(scale).toBeGreaterThanOrEqual(MIN_NECK_SCALE);
    // A 24-fret neck at that width: dots about 15 px across, strings 20 px apart.
    const l = fretboardLayout({ strings: 6, frets: 24 });
    expect(2 * l.dotRadius * scale).toBeGreaterThan(14);
    expect(STRING_GAP * scale).toBeGreaterThan(19);
  });
});

describe('fretboardLayout', () => {
  it('spaces frets like a real neck: each space 2^(1/12) narrower than the last', () => {
    const l = fretboardLayout({ strings: 6, frets: 24 });
    for (let fret = 2; fret <= 24; fret++) {
      const prev = l.fretSpan(fret - 1).width;
      const cur = l.fretSpan(fret).width;
      expect(prev / cur).toBeCloseTo(2 ** (1 / 12), 6);
    }
  });

  it('keeps the same width for any fret count and fits the dots into the last fret', () => {
    const widths = new Set<number>();
    for (const frets of [12, 21, 24, 27]) {
      const l = fretboardLayout({ strings: 6, frets });
      widths.add(Math.round(l.width * 1000));
      expect(l.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS);
      expect(2 * l.dotRadius + DOT_CLEARANCE).toBeLessThanOrEqual(l.fretSpan(frets).width + 1e-9);
      expect(l.dimRadius).toBeLessThan(l.dotRadius);
    }
    expect(widths.size).toBe(1);
    expect(fretboardLayout({ strings: 6, frets: 12 }).dotRadius).toBe(MAX_DOT_RADIUS);
  });

  it('puts fret 12 halfway between the nut and the bridge-side octave', () => {
    const l = fretboardLayout({ strings: 6, frets: 24 });
    const nut = l.nut.x + l.nut.width;
    // Wire 12 is at half the scale length, wire 24 at three quarters.
    expect((l.fretWireX(24) - nut) / (l.fretWireX(12) - nut)).toBeCloseTo(1.5, 6);
  });

  it('draws string 1 at the top', () => {
    const l = fretboardLayout({ strings: 9, frets: 12 });
    for (let s = 2; s <= 9; s++) expect(l.stringY(s)).toBeGreaterThan(l.stringY(s - 1));
    expect(l.stringY(1)).toBeGreaterThan(l.boardTop);
    expect(l.stringY(9)).toBeLessThan(l.boardBottom);
  });

  it('mirrors every x for left-handed players', () => {
    const r = fretboardLayout({ strings: 6, frets: 22 });
    const l = fretboardLayout({ strings: 6, frets: 22, leftHanded: true });
    expect(l.width).toBe(r.width);
    for (let fret = 0; fret <= 22; fret++) {
      expect(l.fretCenterX(fret)).toBeCloseTo(r.width - r.fretCenterX(fret), 6);
      const rs = r.fretSpan(fret);
      expect(l.fretSpan(fret).x).toBeCloseTo(r.width - rs.x - rs.width, 6);
    }
    expect(l.nut.x).toBeCloseTo(r.width - r.nut.x - r.nut.width, 6);
  });

  it('keeps the open-string area on the nut side', () => {
    const r = fretboardLayout({ strings: 6, frets: 12 });
    expect(r.fretCenterX(0)).toBeLessThan(r.nut.x);
    const l = fretboardLayout({ strings: 6, frets: 12, leftHanded: true });
    expect(l.fretCenterX(0)).toBeGreaterThan(l.nut.x + l.nut.width);
  });
});

describe('inlayFrets', () => {
  it('marks 3/5/7/9/15/17/19/21 single and 12/24 double', () => {
    expect(inlayFrets(24)).toEqual([
      { fret: 3, double: false },
      { fret: 5, double: false },
      { fret: 7, double: false },
      { fret: 9, double: false },
      { fret: 12, double: true },
      { fret: 15, double: false },
      { fret: 17, double: false },
      { fret: 19, double: false },
      { fret: 21, double: false },
      { fret: 24, double: true },
    ]);
  });

  it('repeats past 24 and stops at the last fret', () => {
    expect(inlayFrets(27).map((i) => i.fret)).toContain(27);
    expect(inlayFrets(12).map((i) => i.fret)).toEqual([3, 5, 7, 9, 12]);
  });
});
