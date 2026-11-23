// The app shell (ADR-51, ADR-53) in the real app: the toolbar, the pages, the scale picker's
// drawer, the instrument popover and the Settings dialog. Real WASM core and storage.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App.svelte';
import {
  defaultSettings,
  SETTINGS_DOCUMENT,
  serializeSettings,
  type Settings,
} from './lib/settings';
import { BrowserStorage, TauriStorage, type Storage } from './lib/storage';
import { fakeCommands } from './lib/storage/fake-commands';
import { appReady, chordPicker, instrumentButton, pageTab, toolbar } from './test-shell';

async function startApp(storage: Storage) {
  render(App, { storage });
  await appReady();
}

async function startWith(change: (s: Settings) => void) {
  const storage = new BrowserStorage(window.localStorage);
  const settings = defaultSettings();
  change(settings);
  await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
  await startApp(storage);
  return storage;
}

const currentPage = () =>
  within(screen.getByRole('navigation', { name: 'Pages' }))
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-current') === 'page')
    .map((b) => b.textContent);
const pickerButton = () => screen.getByRole('button', { name: 'Choose scale' });
const drawer = () => screen.queryByRole('dialog', { name: 'Choose scale' });
const settingsButton = () => screen.getByRole('button', { name: 'Settings' });
const settingsDialog = () => screen.queryByRole('dialog', { name: 'Settings' });
const instrumentPopover = () => screen.queryByRole('dialog', { name: 'Instrument' });

describe('the app shell', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  describe('the pages', () => {
    it('opens on Scales, with the neck at the full width and no settings panel beside it', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      expect(currentPage()).toEqual(['Scales']);
      const scales = screen.getByRole('main', { name: 'Scales' });
      expect(within(scales).getByRole('grid', { name: /^Fretboard/ })).toBeVisible();
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Scale picker' })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Tuning' })).toBeNull();
      expect(screen.queryByRole('checkbox', { name: 'Mute' })).toBeNull();
    });

    it('switches pages from the tabs, the current one marked with aria-current', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pageTab('Chords'));
      expect(currentPage()).toEqual(['Chords']);
      expect(screen.getByRole('main', { name: 'Chords' })).toBeVisible();
      expect(screen.getByText('No chord chosen yet')).toBeVisible();
      expect(screen.queryByRole('grid', { name: /^Fretboard/ })).toBeNull();
      // Each page has its own picker button.
      expect(screen.queryByRole('button', { name: 'Choose scale' })).toBeNull();
      expect(toolbar().getByRole('button', { name: 'Choose chord' })).toBeVisible();

      await fireEvent.click(pageTab('Sheet'));
      expect(currentPage()).toEqual(['Sheet (0)']);
      expect(screen.getByRole('heading', { name: 'Export sheet' })).toBeVisible();

      await fireEvent.click(pageTab('Scales'));
      expect(currentPage()).toEqual(['Scales']);
      expect(screen.getByRole('grid', { name: /^Fretboard/ })).toBeVisible();
    });

    it('switches pages from the keyboard: the tabs are native buttons in tab order', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      const chords = pageTab('Chords');
      expect(chords.tagName).toBe('BUTTON');
      expect(chords).toHaveAttribute('type', 'button');
      expect(chords).not.toHaveAttribute('tabindex');
      chords.focus();
      // A button's Enter and Space arrive as a click.
      await fireEvent.click(chords);
      expect(chords).toHaveFocus();
      expect(chords).toHaveAttribute('aria-current', 'page');
      expect(pageTab('Scales')).not.toHaveAttribute('aria-current');
    });

    it('keeps what was chosen on a page while another is shown', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(chordPicker().getByRole('radio', { name: 'Typed symbol' }));
      await fireEvent.input(chordPicker().getByRole('textbox', { name: 'Chord symbol' }), {
        target: { value: 'Am7' },
      });
      await fireEvent.click(pageTab('Scales'));
      await fireEvent.click(pageTab('Chords'));
      expect(screen.getByRole('heading', { level: 2, name: 'Am7' })).toBeVisible();
      expect(chordPicker().getByRole('textbox', { name: 'Chord symbol' })).toHaveValue('Am7');
    });

    it.each([
      [
        'browser',
        () => {
          const storage = new BrowserStorage(window.localStorage);
          return () => storage;
        },
      ],
      [
        'Tauri',
        () => {
          const folder = new Map<string, string>();
          return () => new TauriStorage(fakeCommands(folder));
        },
      ],
    ])('opens on the page it was left on after a restart: %s', async (_, make) => {
      const open = make();
      await startApp(open());
      await fireEvent.click(pageTab('Chords'));
      await expect.poll(() => open().read(SETTINGS_DOCUMENT)).toMatch(/^page = "chords"$/m);
      cleanup();

      await startApp(open());
      expect(currentPage()).toEqual(['Chords']);
      expect(screen.getByRole('main', { name: 'Chords' })).toBeVisible();
    });

    it('opens an old settings file, with the side panel tables and no page, on Scales without a warning', async () => {
      const storage = new BrowserStorage(window.localStorage);
      await storage.write(
        SETTINGS_DOCUMENT,
        'version = 1\n[scale_picker]\ncollapsed = true\n[settings_panel]\ncollapsed = true\n' +
          '[chord_panel]\ncollapsed = false\n',
      );
      await startApp(storage);
      expect(currentPage()).toEqual(['Scales']);
      expect(screen.queryByRole('status')).toBeNull();
      expect(drawer()).toBeNull();
    });
  });

  describe('the scale picker drawer', () => {
    it('is closed at start and opens from "Choose scale", focus moving into it', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      const button = pickerButton();
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-controls', 'scale-drawer');
      expect(drawer()).toBeNull();

      await fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      const picker = within(drawer()!);
      expect(picker.getByRole('combobox', { name: 'Root' })).toHaveFocus();
      expect(picker.getByRole('listbox', { name: 'Scale' })).toBeVisible();
    });

    it('closes with ✕, focus back on the button', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pickerButton());
      await fireEvent.click(within(drawer()!).getByRole('button', { name: 'Close Choose scale' }));
      expect(drawer()).toBeNull();
      expect(pickerButton()).toHaveAttribute('aria-expanded', 'false');
      expect(pickerButton()).toHaveFocus();
    });

    it('opens and closes from the keyboard: Escape closes it, focus back on the button', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      pickerButton().focus();
      await fireEvent.click(pickerButton());
      const root = within(drawer()!).getByRole('combobox', { name: 'Root' });
      expect(root).toHaveFocus();
      await fireEvent.keyDown(root, { key: 'Escape' });
      expect(drawer()).toBeNull();
      expect(pickerButton()).toHaveFocus();
    });

    it('closes on a click outside it and on a second click on its button', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pickerButton());
      await fireEvent.click(screen.getByRole('heading', { name: 'C Major' }));
      expect(drawer()).toBeNull();

      await fireEvent.click(pickerButton());
      expect(drawer()).not.toBeNull();
      await fireEvent.click(pickerButton());
      expect(drawer()).toBeNull();
    });

    it('shows a picked scale on the neck at once and keeps the search while closed', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pickerButton());
      const picker = within(drawer()!);
      await fireEvent.input(picker.getByRole('searchbox', { name: 'Search scales' }), {
        target: { value: 'dorian' },
      });
      await fireEvent.change(picker.getByRole('listbox', { name: 'Scale' }), {
        target: { value: 'dorian' },
      });
      expect(screen.getByRole('heading', { name: 'C Dorian' })).toBeInTheDocument();

      await fireEvent.keyDown(document.body, { key: 'Escape' });
      await fireEvent.click(pickerButton());
      expect(within(drawer()!).getByRole('searchbox', { name: 'Search scales' })).toHaveValue(
        'dorian',
      );
    });

    it('is not saved: it is closed after a restart', async () => {
      const storage = new BrowserStorage(window.localStorage);
      await startApp(storage);
      await fireEvent.click(pickerButton());
      cleanup();
      await startApp(storage);
      expect(drawer()).toBeNull();
      expect(await storage.read(SETTINGS_DOCUMENT)).not.toMatch(/drawer|picker/);
    });

    it('closes when another page is shown', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pickerButton());
      await fireEvent.click(pageTab('Chords'));
      await fireEvent.click(pageTab('Scales'));
      expect(drawer()).toBeNull();
    });
  });

  describe('the instrument button', () => {
    it('sums up the neck, and follows a change at once', async () => {
      await startWith((s) => (s.instrument.capo = 2));
      expect(instrumentButton()).toHaveAccessibleName(
        'Instrument: 6-string guitar · Standard · 24 frets · capo 2',
      );
      expect(instrumentButton()).toHaveTextContent(
        '6-string guitar · Standard · 24 frets · capo 2',
      );

      await fireEvent.click(instrumentButton());
      const panel = within(instrumentPopover()!);
      await fireEvent.change(panel.getByRole('combobox', { name: 'Strings' }), {
        target: { value: '5' },
      });
      expect(instrumentButton()).toHaveAccessibleName(
        'Instrument: 5-string bass · Standard · 24 frets · capo 2',
      );
    });

    it('opens the instrument settings in a popover and closes it with Escape or a click outside', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      const button = instrumentButton();
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(instrumentPopover()).toBeNull();

      await fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      const strings = within(instrumentPopover()!).getByRole('combobox', { name: 'Strings' });
      expect(strings).toHaveFocus();
      await fireEvent.keyDown(strings, { key: 'Escape' });
      expect(instrumentPopover()).toBeNull();
      expect(button).toHaveFocus();

      await fireEvent.click(button);
      await fireEvent.click(screen.getByRole('heading', { name: 'C Major' }));
      expect(instrumentPopover()).toBeNull();
    });

    it('is on every page: one instrument for the whole app', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(pageTab('Chords'));
      expect(instrumentButton()).toBeVisible();
      await fireEvent.click(pageTab('Sheet'));
      expect(instrumentButton()).toBeVisible();
    });
  });

  describe('the Settings dialog', () => {
    it('opens a modal dialog with Sound and Appearance', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      expect(settingsButton()).toHaveAttribute('aria-haspopup', 'dialog');
      expect(settingsDialog()).toBeNull();

      await fireEvent.click(settingsButton());
      const dialog = settingsDialog()!;
      expect(dialog.tagName).toBe('DIALOG');
      expect(dialog).toHaveAttribute('open');
      const inside = within(dialog);
      expect(inside.getByRole('heading', { name: 'Sound' })).toBeVisible();
      expect(inside.getByRole('checkbox', { name: 'Mute' })).toBeVisible();
      expect(inside.getByRole('heading', { name: 'Appearance' })).toBeVisible();
      expect(inside.getByRole('combobox', { name: 'Theme' })).toBeVisible();
    });

    it('closes with ✕, focus back on ⚙ Settings', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(settingsButton());
      await fireEvent.click(
        within(settingsDialog()!).getByRole('button', { name: 'Close Settings' }),
      );
      expect(settingsDialog()).toBeNull();
      expect(settingsButton()).toHaveFocus();
    });

    it('closes with Escape from the keyboard, focus back on ⚙ Settings', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      settingsButton().focus();
      await fireEvent.click(settingsButton());
      const mute = within(settingsDialog()!).getByRole('checkbox', { name: 'Mute' });
      await fireEvent.keyDown(mute, { key: 'Escape' });
      expect(settingsDialog()).toBeNull();
      expect(settingsButton()).toHaveFocus();
    });

    it('closes on a click on its backdrop, not on one inside it', async () => {
      await startApp(new BrowserStorage(window.localStorage));
      await fireEvent.click(settingsButton());
      const dialog = settingsDialog()!;
      await fireEvent.click(within(dialog).getByRole('heading', { name: 'Sound' }));
      expect(settingsDialog()).not.toBeNull();
      // A click on the backdrop lands on the dialog element itself.
      await fireEvent.click(dialog);
      expect(settingsDialog()).toBeNull();
      expect(settingsButton()).toHaveFocus();
    });

    it('saves a change made in it at once', async () => {
      const storage = new BrowserStorage(window.localStorage);
      await startApp(storage);
      await fireEvent.click(settingsButton());
      await fireEvent.click(within(settingsDialog()!).getByRole('checkbox', { name: 'Mute' }));
      await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/muted = true/);
    });
  });
});
