// Postbuild: ensure the Next.js App Router entry keeps its "use client" boundary.
// esbuild/tsup strip module-level directives when bundling, so we prepend it here.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const directive = '"use client";\n';

for (const file of ['next.js', 'next.cjs']) {
  const p = join(dist, file);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  if (src.startsWith('"use client"') || src.startsWith("'use client'")) continue;
  writeFileSync(p, directive + src);
  console.log(`[postbuild] prepended "use client" → dist/${file}`);
}
