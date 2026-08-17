import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  base: './',
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    clearMocks: true,
    // The Electron main-process tests run on node:test, not Vitest: they need
    // a real filesystem and real extractors, not jsdom. `npm run test:main`
    // owns them.
    exclude: ['node_modules/**', 'dist/**', 'electron/**'],
  },
});
