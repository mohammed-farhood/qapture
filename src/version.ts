/**
 * The version of this build, injected from package.json by tsup.
 *
 * Declared with a fallback so a consumer running the TypeScript sources
 * directly (or a test that imports this without the bundler's `define`) gets a
 * harmless placeholder rather than a ReferenceError.
 */
declare const __QA_VERSION__: string | undefined;

export const QA_VERSION: string =
  typeof __QA_VERSION__ === 'string' ? __QA_VERSION__ : '0.0.0-dev';
