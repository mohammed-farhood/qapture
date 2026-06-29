/**
 * Hand-rolled argv parser — no third-party dependencies.
 *
 * Supported surface:
 *   qa-studio init [target-dir] [--force]
 *   qa-studio version
 */

export type Command = 'init' | 'version' | 'help';

export interface ParsedArgs {
  command: Command;
  /** Absolute or relative target directory (resolved by caller). */
  dir: string;
  force: boolean;
}

/**
 * Parse raw argv (process.argv.slice(2)).
 * Never throws; unknown commands fall through to 'help'.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, ...rest] = argv;

  // ── version ───────────────────────────────────────────────────────────────
  if (
    cmd === 'version' ||
    cmd === '--version' ||
    cmd === '-v' ||
    cmd === '-V'
  ) {
    return { command: 'version', dir: process.cwd(), force: false };
  }

  // ── help / no command ─────────────────────────────────────────────────────
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    return { command: 'help', dir: process.cwd(), force: false };
  }

  // ── init ──────────────────────────────────────────────────────────────────
  if (cmd === 'init') {
    let dir = process.cwd();
    let force = false;

    for (const arg of rest) {
      if (arg === '--force' || arg === '-f') {
        force = true;
      } else if (arg === '--no-force') {
        force = false;
      } else if (!arg.startsWith('-')) {
        // First non-flag arg is the target directory
        dir = arg;
      }
      // Unknown flags are silently ignored to stay forward-compatible
    }

    return { command: 'init', dir, force };
  }

  // Unknown command → help
  return { command: 'help', dir: process.cwd(), force: false };
}
