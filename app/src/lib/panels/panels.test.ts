// The drawer and the popover on their own (ADR-53); the app's use of them is in
// `shell.test.ts`.
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Drawer from './Drawer.svelte';
import Popover from './Popover.svelte';

const body = createRawSnippet(() => ({
  render: () => '<div><label>Name <input /></label><button type="button">Go</button></div>',
}));

describe('Drawer', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  function setup(open: boolean) {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    const outside = document.createElement('p');
    outside.textContent = 'Page text';
    document.body.append(opener, outside);
    const onclose = vi.fn();
    const result = render(Drawer, {
      id: 'demo',
      title: 'Demo',
      open,
      onclose,
      opener,
      children: body,
    });
    return { opener, outside, onclose, ...result };
  }

  const drawer = () => screen.getByRole('dialog', { name: 'Demo' });

  it('is hidden while closed, its content mounted', () => {
    setup(false);
    expect(document.getElementById('demo')).not.toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Name', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows its title and moves focus to its first control when it opens', async () => {
    const { rerender } = setup(false);
    await rerender({ open: true });
    expect(drawer()).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Demo' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('closes with ✕ and gives focus back to the opener', async () => {
    const { onclose, opener } = setup(true);
    const close = screen.getByRole('button', { name: 'Close Demo' });
    expect(close.tagName).toBe('BUTTON');
    await fireEvent.click(close);
    expect(onclose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
  });

  it('closes with Escape and gives focus back to the opener', async () => {
    const { onclose, opener } = setup(true);
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
  });

  it('leaves an Escape another control already handled', async () => {
    const { onclose } = setup(true);
    const input = screen.getByRole('textbox', { name: 'Name' });
    input.addEventListener('keydown', (event) => event.preventDefault());
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes on a click outside it, but not on a click inside or on the opener', async () => {
    const { onclose, opener, outside } = setup(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    await fireEvent.click(opener);
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(outside);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it('after a click outside, gives focus back only if it would be lost', async () => {
    const { opener, outside, rerender } = setup(true);
    // The page text takes no focus: focus would be lost inside the closing drawer.
    await fireEvent.click(outside);
    expect(opener).toHaveFocus();

    const field = document.createElement('input');
    document.body.append(field);
    await rerender({ open: false });
    await rerender({ open: true });
    field.focus();
    await fireEvent.click(field);
    expect(field).toHaveFocus();
  });

  it('leaves clicks and keys in a modal dialog above it alone', async () => {
    const { onclose } = setup(true);
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const button = document.createElement('button');
    modal.append(button);
    document.body.append(modal);
    await fireEvent.click(button);
    await fireEvent.keyDown(button, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
  });

  it('stops listening once closed', async () => {
    const { onclose, outside, rerender } = setup(true);
    await rerender({ open: false });
    await fireEvent.click(outside);
    await fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
  });
});

describe('Popover', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  const label = createRawSnippet(() => ({ render: () => '<span>Neck summary</span>' }));

  function setup() {
    const outside = document.createElement('p');
    outside.textContent = 'Page text';
    document.body.append(outside);
    render(Popover, { id: 'pop', label: 'Instrument', button: label, children: body });
    const button = screen.getByRole('button', { name: /^Neck summary/ });
    return { outside, button };
  }

  const panel = () => screen.queryByRole('dialog', { name: 'Instrument' });

  it('is a closed disclosure button at first', () => {
    const { button } = setup();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'pop');
    expect(panel()).toBeNull();
  });

  it('opens on a click, focus moving into it, and closes on a second click', async () => {
    const { button } = setup();
    await fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toBeNull();
    expect(button).toHaveFocus();
  });

  it('opens from the keyboard and closes with Escape, focus back on the button', async () => {
    const { button } = setup();
    button.focus();
    // A native button: Enter and Space arrive as a click.
    await fireEvent.click(button);
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes on a click outside it, and keeps what was typed for the next time', async () => {
    const { button, outside } = setup();
    await fireEvent.click(button);
    await fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'half done' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(panel()).toBeVisible();
    await fireEvent.click(outside);
    expect(panel()).toBeNull();
    await fireEvent.click(button);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('half done');
  });
});
