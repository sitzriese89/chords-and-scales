import { mount } from 'svelte';
import {
  applyTheme,
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  type SchemePreference,
} from '../src/lib/themes';
import '../src/styles/base.css';
import FretboardFixture from './FretboardFixture.svelte';

// A built-in theme and scheme can come from the URL, e.g. ?theme=print or ?scheme=dark.
const query = new URLSearchParams(location.search);
const theme = BUILT_IN_THEMES.find((t) => t.id === query.get('theme')) ?? DEFAULT_THEME;
const scheme = (query.get('scheme') as SchemePreference | null) ?? 'system';
applyTheme(theme, ['light', 'dark'].includes(scheme) ? scheme : 'system');

mount(FretboardFixture, { target: document.getElementById('app')! });
