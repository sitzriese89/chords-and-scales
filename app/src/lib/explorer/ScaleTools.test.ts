// The Scales page in the real app, neck first (ADR-55): the summary row with the view toggles,
// the neck, the tool row (ADR-52: Harmonize and Select notes, Add scale to sheet at its end)
// with what the tools open unfolding under it, then the tab.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import type { Harmonizer } from '../chords';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings } from '../settings';
import { BrowserStorage } from '../storage';

async function startApp(options: { harmonizer?: Harmonizer | null } = {}) {
  const storage = new BrowserStorage(window.localStorage);
  const settings = defaultSettings();
  settings.lastView = { root: 'A', scale: 'dorian' };
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  render(App, {
    storage,
    ...(options.harmonizer === undefined ? {} : { harmonizer: options.harmonizer }),
  });
  await screen.findByRole('grid', { name: /^Fretboard/ });
}

const scalesPage = () => within(screen.getByRole('main', { name: 'Scales' }));
const toolRow = () => screen.getByRole('group', { name: 'Scale tools' });
const neck = () => screen.getByRole('grid', { name: /^Fretboard/ });
const harmonizePanel = () => screen.getByRole('region', { name: 'Harmonize A Dorian' });
const lookupPanel = () => screen.getByRole('region', { name: 'Find chords and scales' });
const tabSection = () => screen.getByRole('region', { name: /^Tab: / });

/** Whether `a` comes before `b` in the document (and so on screen, top to bottom). */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The elements in the order they are in the document. */
function inOrder(...elements: Element[]): boolean {
  return elements.every((el, i) => i === 0 || before(elements[i - 1], el));
}

describe('scales page, neck first', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('reads summary (with the view toggles), neck, tool row, tab', async () => {
    await startApp();
    const page = scalesPage();
    const heading = page.getByRole('heading', { name: 'A Dorian', level: 2 });
    const notes = page.getByRole('list', { name: 'Notes of A Dorian' });
    const labels = page.getByRole('group', { name: 'Labels' });
    const accidentals = page.getByRole('group', { name: 'Accidentals' });
    const addScale = page.getByRole('button', { name: 'Add scale to sheet' });

    expect(
      inOrder(heading, notes, labels, accidentals, neck(), toolRow(), addScale, tabSection()),
    ).toBe(true);
    // The view toggles share the summary row with the name and the notes.
    const summary = heading.parentElement!;
    expect(summary.contains(notes)).toBe(true);
    expect(summary.contains(labels)).toBe(true);
    expect(summary.contains(accidentals)).toBe(true);
    // Add scale to sheet ends the tool row's line, outside the group of tools.
    expect(toolRow().contains(addScale)).toBe(false);
    expect(toolRow().parentElement!.contains(addScale)).toBe(true);
    // The tab section: its heading, Play and Add tab to sheet, then the tab.
    const tab = within(tabSection());
    expect(
      inOrder(
        tab.getByRole('heading', { level: 3 }),
        tab.getByRole('button', { name: /^Play / }),
        tab.getByRole('button', { name: 'Add tab to sheet' }),
        tab.getByRole('img', { name: /^Tab: A Dorian/ }),
      ),
    ).toBe(true);
  });

  it('lists the notes inline, name then interval, the root marked by more than colour', async () => {
    await startApp();
    const notes = scalesPage().getByRole('list', { name: 'Notes of A Dorian' });
    const items = within(notes).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'A 1',
      'B 2',
      'C ♭3',
      'D 4',
      'E 5',
      'F♯ 6',
      'G ♭7',
    ]);
    // The root alone carries the class that underlines it.
    expect(items.map((li) => li.classList.contains('root'))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('keeps the neck at a minimum width inside a panel that scrolls sideways', async () => {
    await startApp();
    const drawing = neck().parentElement!;
    expect(drawing.style.minWidth).toBe('954px');
    expect(drawing.parentElement).toHaveClass('neck');
  });

  it('puts Harmonize and Select notes in one row under the neck', async () => {
    await startApp();
    expect(
      within(toolRow())
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Harmonize', 'Select notes']);
    expect(inOrder(neck(), toolRow(), tabSection())).toBe(true);
  });

  it('unfolds what each tool opens under the row, across its width, both at once', async () => {
    await startApp();
    const harmonize = within(toolRow()).getByRole('button', { name: 'Harmonize' });
    const select = within(toolRow()).getByRole('button', { name: 'Select notes' });

    await fireEvent.click(harmonize);
    expect(harmonize).toHaveAttribute('aria-expanded', 'true');
    expect(harmonize).toHaveAttribute('aria-controls', harmonizePanel().id);
    expect(inOrder(neck(), toolRow(), harmonizePanel(), tabSection())).toBe(true);
    // The size choice is in the panel, not in the row.
    expect(within(toolRow()).queryByRole('radio')).toBeNull();
    expect(within(harmonizePanel()).getByRole('radio', { name: 'Triads' })).toBeChecked();

    await fireEvent.click(select);
    expect(select).toHaveAttribute('aria-pressed', 'true');
    // The row still holds just the two buttons; the panels follow it in button order.
    expect(within(toolRow()).getAllByRole('button')).toEqual([harmonize, select]);
    expect(inOrder(neck(), toolRow(), harmonizePanel(), lookupPanel(), tabSection())).toBe(true);
    expect(toolRow().contains(harmonizePanel())).toBe(false);
    expect(toolRow().contains(lookupPanel())).toBe(false);

    // Each closes on its own.
    await fireEvent.click(harmonize);
    expect(screen.queryByRole('region', { name: 'Harmonize A Dorian' })).toBeNull();
    expect(lookupPanel()).toBeInTheDocument();
    await fireEvent.click(select);
    expect(screen.queryByRole('region', { name: 'Find chords and scales' })).toBeNull();
  });

  it('offers only Select notes without a harmonizer', async () => {
    await startApp({ harmonizer: null });
    expect(
      within(toolRow())
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Select notes']);
  });

  it('docks the tool row under the neck panel, with the open panels under the row', async () => {
    await startApp();
    await fireEvent.click(within(toolRow()).getByRole('button', { name: 'Harmonize' }));
    await fireEvent.click(within(toolRow()).getByRole('button', { name: 'Select notes' }));
    // The neck panel and the row's strip are one card: the strip comes right after the panel.
    const panel = neck().closest('.neck')!;
    const bar = toolRow().parentElement!;
    expect(bar).toHaveClass('bar');
    expect(panel.parentElement).toHaveClass('neck-card');
    expect(panel.nextElementSibling?.firstElementChild).toBe(bar);
    // What the tools open is outside the strip, under it.
    expect(bar.contains(harmonizePanel())).toBe(false);
    expect(bar.contains(lookupPanel())).toBe(false);
    expect(inOrder(bar, harmonizePanel(), lookupPanel(), tabSection())).toBe(true);
    // The tab sits in its card with no second frame around it.
    expect(tabSection().querySelector('figure.tab')).not.toHaveClass('framed');
  });
});
