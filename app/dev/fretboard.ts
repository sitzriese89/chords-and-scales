import { mount } from 'svelte';
import '../src/app.css';
import FretboardFixture from './FretboardFixture.svelte';

mount(FretboardFixture, { target: document.getElementById('app')! });
