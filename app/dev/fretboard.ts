import { mount } from 'svelte';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import FretboardFixture from './FretboardFixture.svelte';

mount(FretboardFixture, { target: document.getElementById('app')! });
