import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

/**
 * Builds the standalone reader (`dist/reader.js` + `dist/reader.css`) that every published
 * board ships with. One IIFE file, React included, so a static host needs nothing else.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      // Library mode inlines every asset; KaTeX fonts would make reader.css 1.4 MB.
      // Ship KaTeX's own CSS and fonts as files instead; browsers fetch only the woff2 they use.
      name: 'copy-katex',
      closeBundle() {
        const src = path.dirname(require.resolve('katex/dist/katex.min.css'));
        fs.mkdirSync('dist/katex', { recursive: true });
        fs.copyFileSync(path.join(src, 'katex.min.css'), 'dist/katex/katex.min.css');
        fs.cpSync(path.join(src, 'fonts'), 'dist/katex/fonts', { recursive: true, filter: (f) => !/\.(ttf|woff)$/.test(f) });
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    lib: { entry: 'src/reader.tsx', name: 'SpecimenReader', formats: ['iife'], fileName: () => 'reader.js' },
    rollupOptions: { output: { assetFileNames: (a) => (a.name?.endsWith('.css') ? 'reader.css' : 'assets/[name][extname]') } },
  },
});
