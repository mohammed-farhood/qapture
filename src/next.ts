// Next.js App Router entry: re-export the client component. The 'use client'
// directive is injected into the BUILD output by tsup's banner (see tsup.config.ts)
// — keeping it out of source avoids tsup's "directive ignored when bundled" warning.
export { QaStudio, initQaStudio } from './index';
export type { QaConfig } from './index';
