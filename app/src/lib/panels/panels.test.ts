// The collapsible side panels (ADR-50): the component alone, and the scale picker and the
// settings panel in the real app.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.svelte';
import { defaultSettings, SETTINGS_DOCUMENT, serializeSettings, type Settings } from '../settings';
import { BrowserStorage } from '../storage';
import CollapsiblePanel from './CollapsiblePanel.svelte';

const body = createRawSnippet(() => ({ render: () => '<p>Panel content</p>' }));

describe('CollapsiblePanel', () => {
  afterEach(cleanup);

  it('shows its body and a Collapse button that controls it while expanded', () => {
    const ontoggle = vi.fn();
    render(CollapsiblePanel, {
      id: 'demo',
      title: 'Demo',
      collapsed: false,
      ontoggle,
      children: body,
    });
    const button = screen.getByRole('button', { name: 'Collapse Demo' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'demo-body');
    expect(document.getElementById('demo-body')).toBeVisible();
    expect(screen.getByText('Panel content')).toBeVisible();
    expect(screen.getByText('Demo')).toBeVisible();
  });

  it('keeps only its title and an Expand button while collapsed; the body stays mounted', () => {
    render(CollapsiblePanel, {
      id: 'demo',
      title: 'Demo',
      collapsed: true,
      ontoggle: () => {},
      children: body,
    });
    const button = screen.getByRole('button', { name: 'Expand Demo' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'demo-body');
    expect(screen.getByText('Demo')).toBeVisible();
    expect(screen.getByText('Panel content')).not.toBeVisible();
  });

  it('asks its parent to toggle; it is a native button, so Enter and Space work', async () => {
    const ontoggle = vi.fn();
    render(CollapsiblePanel, {
      id: 'demo',
      title: 'Demo',
      collapsed: false,
      ontoggle,
      children: body,
    });
    const button = screen.getByRole('button', { name: 'Collapse Demo' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('tabindex');
    await fireEvent.click(button);
    expect(ontoggle).toHaveBeenCalledOnce();
  });
});

describe('the side panels in the app', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  async function startApp(change: (s: Settings) => void = () => {}) {
    const storage = new BrowserStorage(window.localStorage);
    const settings = defaultSettings();
    change(settings);
    await storage.write(SETTINGS_DOCUMENT, serializeSettings(settings));
    render(App, { storage });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    return storage;
  }

  const picker = () => screen.getByRole('navigation', { name: 'Scale picker' });
  const settingsPanel = () => screen.getByRole('complementary', { name: 'Settings' });
  const layout = () => document.querySelector('.layout')!;
  // Found while hidden too, to check that they are.
  const rootField = () => within(picker()).getByRole('combobox', { name: 'Root', hidden: true });
  const tuningSelect = () =>
    within(settingsPanel()).getByRole('combobox', { name: 'Tuning', hidden: true });

  it('collapses and expands the scale picker by mouse, and saves it', async () => {
    const storage = await startApp();
    const button = within(picker()).getByRole('button', { name: 'Collapse Scale picker' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(rootField()).toBeVisible();
    expect(layout()).not.toHaveClass('picker-collapsed');

    await fireEvent.click(button);
    const expand = within(picker()).getByRole('button', { name: 'Expand Scale picker' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(within(picker()).getByText('Scale picker')).toBeVisible();
    expect(rootField()).not.toBeVisible();
    // The board's column takes the width.
    expect(layout()).toHaveClass('picker-collapsed');
    // The other panel is untouched.
    expect(tuningSelect()).toBeVisible();
    await expect
      .poll(() => storage.read(SETTINGS_DOCUMENT))
      .toMatch(/\[scale_picker\]\ncollapsed = true/);

    await fireEvent.click(expand);
    expect(rootField()).toBeVisible();
    expect(layout()).not.toHaveClass('picker-collapsed');
    await expect
      .poll(() => storage.read(SETTINGS_DOCUMENT))
      .toMatch(/\[scale_picker\]\ncollapsed = false/);
  });

  it('collapses and expands the settings panel from the keyboard, and saves it', async () => {
    const storage = await startApp();
    const button = within(settingsPanel()).getByRole('button', { name: 'Collapse Settings' });
    // Keyboard users reach the native button and activate it; a button's Enter and Space
    // arrive as a click.
    button.focus();
    expect(button).toHaveFocus();
    await fireEvent.click(button);
    const expand = within(settingsPanel()).getByRole('button', { name: 'Expand Settings' });
    expect(expand).toHaveFocus();
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(tuningSelect()).not.toBeVisible();
    expect(layout()).toHaveClass('settings-collapsed');
    expect(rootField()).toBeVisible();
    await expect
      .poll(() => storage.read(SETTINGS_DOCUMENT))
      .toMatch(/\[settings_panel\]\ncollapsed = true/);

    await fireEvent.click(expand);
    expect(tuningSelect()).toBeVisible();
    expect(layout()).not.toHaveClass('settings-collapsed');
  });

  it('starts with the panels as they were saved', async () => {
    await startApp((s) => {
      s.scalePicker.collapsed = true;
      s.settingsPanel.collapsed = true;
    });
    expect(within(picker()).getByRole('button', { name: 'Expand Scale picker' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      within(settingsPanel()).getByRole('button', { name: 'Expand Settings' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(rootField()).not.toBeVisible();
    expect(tuningSelect()).not.toBeVisible();
    expect(layout()).toHaveClass('picker-collapsed');
    expect(layout()).toHaveClass('settings-collapsed');
  });

  it('keeps a collapsed panel collapsed across a restart', async () => {
    const storage = await startApp();
    await fireEvent.click(within(picker()).getByRole('button', { name: 'Collapse Scale picker' }));
    await expect
      .poll(() => storage.read(SETTINGS_DOCUMENT))
      .toMatch(/\[scale_picker\]\ncollapsed = true/);
    cleanup();

    render(App, { storage });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    expect(within(picker()).getByRole('button', { name: 'Expand Scale picker' })).toBeVisible();
    expect(rootField()).not.toBeVisible();
    expect(tuningSelect()).toBeVisible();
  });

  it('opens an older settings file without the panel tables with both panels expanded', async () => {
    const storage = new BrowserStorage(window.localStorage);
    await storage.write(SETTINGS_DOCUMENT, 'version = 1\n[chord_panel]\ncollapsed = true\n');
    render(App, { storage });
    await screen.findByRole('grid', { name: /^Fretboard/ });
    expect(within(picker()).getByRole('button', { name: 'Collapse Scale picker' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      within(settingsPanel()).getByRole('button', { name: 'Collapse Settings' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(rootField()).toBeVisible();
    expect(tuningSelect()).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
