import { mount } from 'svelte';
import App from './App.svelte';
import { applyTheme, DEFAULT_THEME } from './lib/themes';
import { initTheory } from './lib/theory';
import './styles/base.css';

// The Default theme until the settings say which one to show (ADR-40), so the page is never
// unstyled while the core loads. App takes over from here.
const stopDefaultTheme = applyTheme(DEFAULT_THEME, 'system');

// The theory core must be loaded before any component calls it.
initTheory().then(() => {
  stopDefaultTheme();
  mount(App, { target: document.getElementById('app')! });
});
