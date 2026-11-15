import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTE_INTERVAL,
  DEFAULT_STRUM_SPREAD,
  sequenceEvents,
  strumEvents,
} from './schedule';

describe('sequenceEvents', () => {
  it('spaces the notes one interval apart, in the order given', () => {
    expect(sequenceEvents([60, 62, 64])).toEqual([
      { midi: 60, at: 0, velocity: 1 },
      { midi: 62, at: DEFAULT_NOTE_INTERVAL, velocity: 1 },
      { midi: 64, at: 2 * DEFAULT_NOTE_INTERVAL, velocity: 1 },
    ]);
  });

  it('plays a descending line and a repeated note as they come', () => {
    const events = sequenceEvents([64, 62, 62, 60], { interval: 0.25 });
    expect(events.map((e) => [e.midi, e.at])).toEqual([
      [64, 0],
      [62, 0.25],
      [62, 0.5],
      [60, 0.75],
    ]);
  });

  it('is empty for no notes', () => {
    expect(sequenceEvents([])).toEqual([]);
  });
});

describe('strumEvents', () => {
  it('goes from the lowest string up on a downstrum', () => {
    const events = strumEvents([40, 47, 52]);
    expect(events.map((e) => [e.midi, e.at])).toEqual([
      [40, 0],
      [47, DEFAULT_STRUM_SPREAD],
      [52, 2 * DEFAULT_STRUM_SPREAD],
    ]);
  });

  it('goes from the highest string down on an upstrum', () => {
    const events = strumEvents([40, 47, 52], { direction: 'up', spread: 0.01 });
    expect(events.map((e) => [e.midi, e.at])).toEqual([
      [52, 0],
      [47, 0.01],
      [40, 0.02],
    ]);
  });

  it('lowers each string by the square root of how many there are', () => {
    expect(strumEvents([40]).map((e) => e.velocity)).toEqual([1]);
    for (const event of strumEvents([40, 45, 50, 55])) expect(event.velocity).toBeCloseTo(0.5);
  });

  it('does not change the list it is given', () => {
    const midis = [40, 47, 52];
    strumEvents(midis, { direction: 'up' });
    expect(midis).toEqual([40, 47, 52]);
  });

  it('is empty for no notes', () => {
    expect(strumEvents([])).toEqual([]);
  });
});
