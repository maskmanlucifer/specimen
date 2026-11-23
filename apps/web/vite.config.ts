import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Dev server proxies the API to `apps/server` on :3000; production serves both from one origin. */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/s/': 'http://localhost:3000' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
