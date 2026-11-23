// The panels are used the same way (ADR-56), with the components' own styles loaded: the tool
// row is the neck panel's footer strip, the tab is a card, the app fills the window with the
// version in a footer at the bottom, and the voicing grid stretches its cards across the width.
import '../../styles/base.css';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { appReady, chordPicker, chordsPage, goTo } from '../../test-shell';
import { cMajorHarmonizer } from '../chords/fixture-harmonizer';
import { BrowserStorage } from '../storage';
import { version } from '../theory';

async function startApp() {
  render(App, { storage: new BrowserStorage(window.localStorage), harmonizer: cMajorHarmonizer });
  await appReady();
  await screen.findByRole('grid', { name: /^Fretboard/ });
}

const style = (el: Element) => getComputedStyle(el);

/** A theme token resolved to the colour it computes to. */
function colour(token: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

describe('page layout', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('docks the tool row under the neck as the panel footer strip', async () => {
    await startApp();
    goTo('Scales');
    const panel = screen.getByRole('grid', { name: /^Fretboard/ }).closest('.neck')!;
    const bar = screen.getByRole('group', { name: 'Scale tools' }).parentElement!;
    // The panel is open at the bottom…
    expect(style(panel).borderBottomWidth).toMatch(/^0(px)?$/);
    expect(style(panel).borderBottomLeftRadius).toMatch(/^0(px)?$/);
    expect(style(panel).padding).toBe('16px 16px 12px');
    // …and the strip closes it, recessed, with no gap between them.
    expect(style(bar).borderTopWidth).toBe('1px');
    expect(style(bar).padding).toBe('10px 16px');
    expect(style(bar).backgroundColor).toBe(colour('--surface-sunken'));
    expect(style(panel.parentElement!).rowGap).not.toMatch(/^[1-9]/);
  });

  it('draws the tab section as a card, the tab inside it unframed', async () => {
    await startApp();
    goTo('Scales');
    const section = screen.getByRole('region', { name: /^Tab: / });
    expect(style(section).borderTopWidth).toBe('1px');
    expect(style(section).borderLeftWidth).toBe('1px');
    expect(style(section).padding).toBe('16px 20px');
    expect(style(section).backgroundColor).toBe(colour('--surface-raised'));
    const tab = section.querySelector('figure.tab')!;
    expect(style(tab).borderTopStyle).not.toBe('solid');
    expect(style(tab).padding).toMatch(/^0(px)?$/);
  });

  it('fills the window, the version in a footer at the bottom', async () => {
    await startApp();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(`Theory core v${version()}`);
    const app = footer.parentElement!;
    expect(app.lastElementChild).toBe(footer);
    expect(style(app).minHeight).toBe(`${window.innerHeight}px`); // 100vh
    expect(style(footer).marginTop).toBe('auto');
    expect(style(footer).borderTopWidth).toBe('1px');
    expect(style(within(footer).getByText(/^Theory core/)).fontSize).toBe('12px');
    expect(style(document.body).paddingLeft).toBe('24px');
    expect(style(document.body).paddingBottom).toMatch(/^0(px)?$/);
  });

  it('lays the voicings out in auto-fill columns that stretch the cards', async () => {
    await startApp();
    await fireEvent.change(chordPicker().getByRole('combobox', { name: 'Chord quality' }), {
      target: { value: 'major' },
    });
    const list = chordsPage().getByRole('list', { name: 'Voicings of C' });
    expect(style(list).display).toBe('grid');
    // 11.5rem columns, 0.75rem apart.
    expect(style(list).gridTemplateColumns).toBe('repeat(auto-fill, minmax(184px, 1fr))');
    expect(style(list).gap).toBe('12px');
    const card = within(list).getAllByRole('button')[0];
    expect(style(card).width).toBe('100%');
  });
});
