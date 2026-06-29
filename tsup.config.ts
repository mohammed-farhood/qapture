import { defineConfig } from 'tsup';

const externalReact = ['react', 'react-dom', 'react/jsx-runtime'];

// Two build groups:
//  1) the library (ESM + CJS, dts, react externalized, code-split so
//     jszip/html2canvas stay lazy chunks). The `qa-studio/next` entry gets its
//     "use client" directive prepended by scripts/postbuild.mjs — esbuild strips
//     source/banner directives when bundling, so post-processing is the reliable way.
//  2) the CLI scaffolder (Node CJS, shebang, no react).
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      next: 'src/next.ts',
      standalone: 'src/standalone.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: externalReact,
  },
  {
    entry: { 'bin/init': 'src/bin/init.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node18',
    dts: false,
    sourcemap: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
    // Bundle the markdown artifacts (SKILL.md, AGENTS section) as text constants
    // so the CLI is a single self-contained file with no runtime file lookups.
    loader: { '.md': 'text' },
  },
]);
