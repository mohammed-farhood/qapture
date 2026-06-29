/**
 * Ambient declaration so TypeScript understands `import text from '*.md'`.
 * tsup's `loader: { '.md': 'text' }` (in the bin entry config) turns these
 * imports into bundled string constants — zero runtime file-system reads.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
