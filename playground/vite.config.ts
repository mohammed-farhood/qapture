import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dev the library straight from source: alias the package name to ../src so edits
// are live with no rebuild. Dedupe react so the source and the host share one copy.
const src = fileURLToPath(new URL('../src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'qa-studio': src },
    dedupe: ['react', 'react-dom'],
  },
});
