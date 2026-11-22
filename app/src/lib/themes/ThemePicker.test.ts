// The theme picker in the real app (ADR-40), with the real WASM core (loaded in test-setup.ts).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.svelte';
import { SETTINGS_DOCUMENT } from '../settings';
import { BrowserStorage, TauriStorage, type Storage } from '../storage';
import { fakeCommands } from '../storage/fake-commands';
import { THEME_STYLE_ID } from './apply';

const root = document.documentElement;
const surface = () => getComputedStyle(root).getPropertyValue('--surface').trim();

const SOLAR = `/* A user theme: only some tokens, light only. */
:root { --theme-name: 'Solar'; }
[data-scheme='light'] {
  --surface: #fdf6e3;
  --text: #fdf6e4;
}
`;

async function startApp(storage: Storage) {
  const result = render(App, { storage });
  await screen.findByRole('grid', { name: /^Fretboard/ });
  return result;
}

const panel = () => within(screen.getByRole('complementary', { name: 'Settings' }));
const themeSelect = () => panel().getByRole('combobox', { name: 'Theme' });
const offered = () =>
  [...themeSelect().querySelectorAll('optgroup')].map((group) => [
    group.label,
    [...group.querySelectorAll('option')].map((o) => o.textContent?.trim()),
  ]);
const radio = (name: string) => panel().getByRole('radio', { name });

describe('theme picker', () => {
  let storage: BrowserStorage;

  beforeEach(() => {
    window.localStorage.clear();
    storage = new BrowserStorage(window.localStorage);
  });

  afterEach(() => {
    cleanup();
    document.getElementById(THEME_STYLE_ID)?.remove();
    delete root.dataset.scheme;
  });

  it('offers the built-in themes and shows the Default one, following the OS', async () => {
    await startApp(storage);
    expect(offered()).toEqual([
      [
        'Built-in',
        ['Default', 'High contrast', 'Atom One', 'Catppuccin', 'Dracula', 'Nord', 'Print'],
      ],
    ]);
    expect(themeSelect()).toHaveValue('default');
    expect(radio('System')).toBeChecked();
    // jsdom has no matchMedia, so the OS preference here is light.
    expect(root.dataset.scheme).toBe('light');
    expect(surface()).toBe('#f7f6f3');
  });

  it('applies and saves the light/dark choice', async () => {
    await startApp(storage);
    await fireEvent.click(radio('Dark'));
    expect(root.dataset.scheme).toBe('dark');
    expect(surface()).toBe('#171615');
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/theme = "dark"/);
    await fireEvent.click(radio('Light'));
    expect(root.dataset.scheme).toBe('light');
  });

  it('applies and saves a theme, and a one-scheme theme ignores light/dark', async () => {
    await startApp(storage);
    await fireEvent.click(radio('Dark'));
    await fireEvent.change(themeSelect(), { target: { value: 'print' } });
    expect(themeSelect()).toHaveValue('print');
    expect(root.dataset.scheme).toBe('light');
    expect(surface()).toBe('#ffffff');
    expect(radio('Dark')).toBeDisabled();
    expect(radio('Dark')).toBeChecked();
    expect(panel().getByText('Print is always light.')).toBeInTheDocument();
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/theme_id = "print"/);

    await fireEvent.change(themeSelect(), { target: { value: 'high-contrast' } });
    expect(radio('Dark')).toBeEnabled();
    expect(root.dataset.scheme).toBe('dark');
    expect(surface()).toBe('#000000');
  });

  it.each([
    ['browser', () => new BrowserStorage(window.localStorage)],
    ['Tauri', () => new TauriStorage(fakeCommands())],
  ])('lists a user theme file from %s storage under its own group', async (_, open) => {
    const store = open();
    await store.write('theme-solar.css', SOLAR);
    await startApp(store);
    expect(offered()).toEqual([
      [
        'Built-in',
        ['Default', 'High contrast', 'Atom One', 'Catppuccin', 'Dracula', 'Nord', 'Print'],
      ],
      ['Your themes', ['Solar']],
    ]);
    await fireEvent.change(themeSelect(), { target: { value: 'solar' } });
    expect(surface()).toBe('#fdf6e3');
    // Missing tokens come from the Default theme.
    expect(getComputedStyle(root).getPropertyValue('--accent').trim()).toBe('#1f5fae');
    await expect.poll(() => store.read(SETTINGS_DOCUMENT)).toMatch(/theme_id = "solar"/);
  });

  it('lists the problems with the theme files: missing tokens, contrast, unusable files', async () => {
    await storage.write('theme-solar.css', SOLAR);
    await storage.write('theme-broken.css', 'not css');
    await startApp(storage);
    const details = panel()
      .getByText(/problems with your theme files/)
      .closest('details')!;
    const items = within(details)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toBe('theme-broken.css is not used because "not css" is not part of a block');
    expect(items).toContainEqual(expect.stringMatching(/^theme-solar\.css: light: .* are missing/));
    expect(items).toContainEqual(
      expect.stringMatching(/^theme-solar\.css: light: --text on --surface has a contrast of/),
    );
  });

  it('shows the Default theme when the saved theme is gone, and says so', async () => {
    await storage.write(SETTINGS_DOCUMENT, 'version = 1\n[display]\ntheme_id = "solar"\n');
    await startApp(storage);
    expect(themeSelect()).toHaveValue('default');
    expect(panel().getByText(/“solar” was not found, so Default is shown/)).toBeInTheDocument();
    expect(surface()).toBe('#f7f6f3');
  });
});
