// The shared control styles in the real app (ADR-56): which radio groups are drawn as
// segmented controls, and that they are still native radio groups underneath, so focus, the
// arrow keys and screen readers work as before. The look itself is in base.css.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, goTo, pageTab, settingsDialog } from '../../test-shell';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { BrowserStorage } from '../storage';

async function startApp() {
  render(App, { storage: new BrowserStorage(window.localStorage), harmonizer: cMajorHarmonizer });
  await appReady();
  await screen.findByRole('grid', { name: /^Fretboard/ });
}

const radiosIn = (group: HTMLElement) => within(group).getAllByRole('radio') as HTMLInputElement[];

/** Asserts that `group` is a segmented control built on one native radio group. */
function expectSegmentedRadioGroup(group: HTMLElement) {
  expect(group.localName).toBe('fieldset');
  expect(group.classList.contains('segmented')).toBe(true);
  const radios = radiosIn(group);
  expect(radios.length).toBeGreaterThan(1);
  // One group: the browser moves between them with the arrow keys and tabs in once.
  expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
  expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
  for (const radio of radios) {
    // A real, focusable radio with its segment's text as its name: not hidden from the
    // keyboard or the accessibility tree.
    expect(radio.type).toBe('radio');
    expect(radio.tabIndex).toBe(0);
    expect(radio.disabled).toBe(false);
    expect(radio.closest('[aria-hidden="true"], [hidden], [inert]')).toBeNull();
    // Each radio sits in its own label, right before the segment it is drawn as.
    expect(radio.parentElement!.localName).toBe('label');
    expect(radio.parentElement!.parentElement).toBe(group);
    expect(radio.nextElementSibling!.localName).toBe('span');
  }
}

/** Choosing another segment checks its radio, unchecks the others and keeps focus on it. */
function expectChoosable(group: HTMLElement) {
  const radios = radiosIn(group);
  const other = radios.find((radio) => !radio.checked)!;
  other.focus();
  expect(document.activeElement).toBe(other);
  fireEvent.click(other);
  expect(other.checked).toBe(true);
  expect(radiosIn(group).filter((radio) => radio.checked)).toEqual([other]);
}

describe('segmented controls', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('draws the view toggles and the tab controls as segmented radio groups', async () => {
    await startApp();
    goTo('Scales');
    const page = within(screen.getByRole('main', { name: 'Scales' }));
    for (const name of ['Labels', 'Accidentals', 'Position', 'Direction']) {
      const group = page.getByRole('group', { name });
      expectSegmentedRadioGroup(group);
      expectChoosable(group);
    }
  });

  it('keeps the space between a sign and its word in a segment', async () => {
    await startApp();
    const group = screen.getByRole('group', { name: 'Accidentals' });
    expect(radiosIn(group).map((radio) => radio.nextElementSibling!.textContent)).toEqual([
      '♯ Sharps',
      '♭ Flats',
    ]);
  });

  it('leaves plain radio groups as radios with labels beside them', async () => {
    await startApp();
    // Each is checked while its overlay is open: opening the next one closes it.
    const expectPlain = (group: HTMLElement) => {
      expect(group.closest('.segmented')).toBeNull();
      expect(radiosIn(group).length).toBeGreaterThan(1);
    };
    expectPlain(settingsDialog().getByRole('group', { name: 'Light or dark' }));
    expectPlain(chordPicker().getByRole('group', { name: 'Choose a chord by' }));
    expectPlain(chordPicker().getByRole('group', { name: 'Chord names' }));
    goTo('Sheet');
    expectPlain(screen.getByRole('group', { name: 'Sheet light or dark' }));
  });
});

describe('page tabs and primary actions', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('marks the current page only, and not as a chosen option', async () => {
    await startApp();
    goTo('Chords');
    expect(pageTab('Chords').getAttribute('aria-current')).toBe('page');
    expect(pageTab('Scales').hasAttribute('aria-current')).toBe(false);
    expect(pageTab('Sheet').hasAttribute('aria-current')).toBe(false);
    // Page tabs are navigation, not toggles: nothing on them says pressed or checked.
    for (const page of ['Scales', 'Chords', 'Sheet'] as const) {
      expect(pageTab(page).hasAttribute('aria-pressed')).toBe(false);
      expect(pageTab(page).classList.contains('primary')).toBe(false);
    }
  });

  it('gives Play the primary style', async () => {
    await startApp();
    goTo('Scales');
    const play = screen.getByRole('button', { name: /^Play / });
    expect(play.classList.contains('primary')).toBe(true);
  });
});
