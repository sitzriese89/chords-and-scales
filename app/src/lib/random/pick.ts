/**
 * The random pick of SPEC §5.8 (ADR-42): a root and an item of a picker's filtered set. The
 * root is a pitch class (0–11); the caller spells it through the core (`spellPitchClass`) in the
 * global sharp/flat preference (ADR-6), so no note name is made here.
 */

/** A source of numbers in [0, 1), like `Math.random`; tests pass a seeded one. */
export type Random = () => number;

/** What is shown now, as an item id and the pitch class of its root. */
export interface Current {
  id: string;
  pitchClass: number;
}

/** A random root, as a pitch class, and item. */
export interface Pick<T> {
  item: T;
  pitchClass: number;
}

/**
 * A root and an item from `items`, every pair (12 roots × the items) equally likely, except the
 * pair `current` while there is another one to pick. `undefined` for an empty set.
 */
export function randomPick<T extends { id: string }>(
  items: readonly T[],
  current: Current | null,
  random: Random = Math.random,
): Pick<T> | undefined {
  const pairs = items.length * 12;
  if (pairs === 0) return undefined;
  const at = (index: number): Pick<T> => ({
    item: items[Math.floor(index / 12)],
    pitchClass: index % 12,
  });
  const found = current ? items.findIndex((item) => item.id === current.id) : -1;
  const valid = current !== null && Number.isInteger(current.pitchClass);
  const skip = found >= 0 && valid && current.pitchClass >= 0 && current.pitchClass < 12;
  const currentIndex = skip ? found * 12 + current.pitchClass : -1;
  const count = skip ? pairs - 1 : pairs;
  let index = Math.min(count - 1, Math.floor(random() * count));
  if (skip && index >= currentIndex) index += 1;
  return at(index);
}

/**
 * A seeded source for tests and reproducible picks: mulberry32, a small fast generator with a
 * full 32-bit period.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
