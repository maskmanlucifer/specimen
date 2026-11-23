import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * A static app: no server, no API proxy. `base: './'` keeps asset paths relative, so the same
 * build works at any sub-path, e.g. GitHub Pages at /specimen/app/.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
