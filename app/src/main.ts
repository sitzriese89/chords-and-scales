import { mount } from 'svelte';
import App from './App.svelte';
import { initTheory } from './lib/theory';
import './app.css';

// The theory core must be loaded before any component calls it.
initTheory().then(() => {
  mount(App, { target: document.getElementById('app')! });
});
