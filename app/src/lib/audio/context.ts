import { createContext } from 'svelte';
import type { AudioEngine } from './engine';

/** `getAudio()` in any component below `App`; `App` calls `setAudio()` (ADR-28). */
export const [getAudio, setAudio] = createContext<AudioEngine>();
