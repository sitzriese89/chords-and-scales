import { createContext } from 'svelte';
import type { AudioEngine } from './engine';

/** `getAudio()` in any component below `App`; `App` calls `setAudio()` (ADR-27). */
export const [getAudio, setAudio] = createContext<AudioEngine>();
