import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.svelte';
import { SETTINGS_DOCUMENT } from './lib/settings';
import { BrowserStorage } from './lib/storage';
import { version } from './lib/theory';

describe('App', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the theory core version from WASM', () => {
    render(App);
    expect(screen.getByText(`Theory core v${version()}`)).toBeInTheDocument();
  });

  it('creates the settings file on first start, without a warning', async () => {
    const storage = new BrowserStorage(window.localStorage);
    render(App, { storage });
    await expect.poll(() => storage.read(SETTINGS_DOCUMENT)).toMatch(/^version = 1$/m);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a dismissable warning for a corrupt settings file', async () => {
    const storage = new BrowserStorage(window.localStorage);
    await storage.write(SETTINGS_DOCUMENT, 'not [toml');
    render(App, { storage });
    const warning = await screen.findByRole('status');
    expect(warning).toHaveTextContent(/default settings are in use/);
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
