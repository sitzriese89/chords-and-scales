import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from './App.svelte';
import { version } from './lib/theory';

describe('App', () => {
  it('shows the theory core version from WASM', () => {
    render(App);
    expect(screen.getByText(`Theory core v${version()}`)).toBeInTheDocument();
  });
});
