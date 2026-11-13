import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Set by `tauri dev` when running on a device on the network (not used on desktop).
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  // Keep Rust errors from `tauri dev` visible.
  clearScreen: false,
  server: {
    // Tauri's devUrl points here (src-tauri/tauri.conf.json).
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
