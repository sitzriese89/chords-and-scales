// The explorer's tool row in the real app (ADR-52): Harmonize and Select notes side by side
// between the scale's summary and the neck, what they open unfolding under the row.
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

const toolRow = () => screen.getByRole('group', { name: 'Scale tools' });
const neck = () => screen.getByRole('grid', { name: /^Fretboard/ });
const harmonizePanel = () => screen.getByRole('region', { name: 'Harmonize A Dorian' });
const lookupPanel = () => screen.getByRole('region', { name: 'Find chords and scales' });

/** Whether `a` comes before `b` in the document (and so on screen, top to bottom). */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The elements in the order they are in the document. */
function inOrder(...elements: Element[]): boolean {
  return elements.every((el, i) => i === 0 || before(elements[i - 1], el));
}

describe('scale tool row', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('puts Harmonize and Select notes in one row between the summary and the neck', async () => {
    await startApp();
    const row = toolRow();
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Harmonize', 'Select notes']);

    // Summary (name, notes, Add scale to sheet), then the tool row, then the neck.
    expect(
      inOrder(
        screen.getByRole('heading', { name: 'A Dorian' }),
        screen.getByLabelText('Notes of A Dorian'),
        screen.getByRole('button', { name: 'Add scale to sheet' }),
        row,
        neck(),
      ),
    ).toBe(true);
  });

  it('unfolds what each tool opens under the row, across its width, both at once', async () => {
    await startApp();
    const harmonize = within(toolRow()).getByRole('button', { name: 'Harmonize' });
    const select = within(toolRow()).getByRole('button', { name: 'Select notes' });

    await fireEvent.click(harmonize);
    expect(harmonize).toHaveAttribute('aria-expanded', 'true');
    expect(harmonize).toHaveAttribute('aria-controls', harmonizePanel().id);
    expect(inOrder(toolRow(), harmonizePanel(), neck())).toBe(true);
    // The size choice is in the panel, not in the row.
    expect(within(toolRow()).queryByRole('radio')).toBeNull();
    expect(within(harmonizePanel()).getByRole('radio', { name: 'Triads' })).toBeChecked();

    await fireEvent.click(select);
    expect(select).toHaveAttribute('aria-pressed', 'true');
    // The row still holds just the two buttons; the panels follow it in button order.
    expect(within(toolRow()).getAllByRole('button')).toEqual([harmonize, select]);
    expect(inOrder(toolRow(), harmonizePanel(), lookupPanel(), neck())).toBe(true);
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
});
