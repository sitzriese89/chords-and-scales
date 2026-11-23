// The shared control style reaches every component (ADR-56): with the components' own
// styles loaded, no component still draws its own copy of the button, select or text field.
import '../../styles/base.css';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import {
  appReady,
  chordPicker,
  goTo,
  instrumentPanel,
  scalePicker,
  settingsDialog,
} from '../../test-shell';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { BrowserStorage } from '../storage';

async function startApp() {
  render(App, { storage: new BrowserStorage(window.localStorage), harmonizer: cMajorHarmonizer });
  await appReady();
  await screen.findByRole('grid', { name: /^Fretboard/ });
}

/**
 * Buttons with a shape of their own: tag chips, harmonize cells, lookup results, voicing
 * cards, semitone cells, the page tabs, and the scale list (a list box, not a drop-down).
 * They take the shared colours, not its size.
 */
const OWN_SHAPE =
  '.chip, .clear, .cell, .result, .voicing, .semitone, nav[aria-label="Pages"] *, select[size]';

/** Every text button, select and text field in `root` has the shared geometry. */
function expectShared(root: HTMLElement) {
  const controls = [
    ...root.querySelectorAll<HTMLElement>(
      'button, select, input[type="text"], input[type="number"], input:not([type])',
    ),
  ].filter((control) => !control.matches(OWN_SHAPE));
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const style = getComputedStyle(control);
    const what = control.outerHTML.slice(0, 100);
    expect(style.minHeight, what).toBe('32px'); // --control-h: 2rem
    expect(style.fontSize, what).toBe('14px'); // 0.875rem
    // A joined control rounds its outer corners only.
    if (!control.closest('.combo')) expect(style.borderRadius, what).toBe('8px'); // --radius
  }
}

describe('shared control style', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('reaches the toolbar, the pages, the drawers, the popover and the Settings dialog', async () => {
    await startApp();
    expectShared(screen.getByRole('banner'));
    goTo('Scales');
    expectShared(screen.getByRole('main', { name: 'Scales' }));
    scalePicker();
    expectShared(screen.getByRole('dialog', { name: 'Choose scale' }));
    chordPicker();
    expectShared(screen.getByRole('dialog', { name: 'Choose chord' }));
    instrumentPanel();
    expectShared(screen.getByRole('dialog', { name: 'Instrument' }));
    settingsDialog();
    expectShared(screen.getByRole('dialog', { name: 'Settings' }));
    goTo('Sheet');
    expectShared(screen.getByRole('main', { name: 'Sheet' }));
  });
});
