import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dev the library straight from source: alias the package name to ../src so edits
// are live with no rebuild. Dedupe react so the source and the host share one copy.
const src = fileURLToPath(new URL('../src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { 'qapture': src },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Bind 0.0.0.0 and print a Network URL so an iPad on the same LAN can
    // open the dev server for on-device touch testing.
    host: true,
  },
});
