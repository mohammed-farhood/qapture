/**
 * Hand-rolled argv parser — no third-party dependencies.
 *
 * Supported surface:
 *   qapture init [target-dir] [--force]
 *   qapture shots [--port N] [--allow ORIGIN]...
 *   qapture version
 */

export type Command = 'init' | 'shots' | 'version' | 'help';

export interface ParsedArgs {
  command: Command;
  /** Absolute or relative target directory (resolved by caller). */
  dir: string;
  force: boolean;
  /** `shots` only: port to listen on. */
  port: number;
  /** `shots` only: non-loopback origins allowed to ask for a capture. */
  allow: string[];
}

/** Port the widget looks for. Changing it means changing it in both places. */
export const DEFAULT_SHOT_PORT = 7017;

/**
 * Parse raw argv (process.argv.slice(2)).
 * Never throws; unknown commands fall through to 'help'.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, ...rest] = argv;
  const base = {
    dir: process.cwd(),
    force: false,
    port: DEFAULT_SHOT_PORT,
    allow: [] as string[],
  };

  // ── version ───────────────────────────────────────────────────────────────
  if (
    cmd === 'version' ||
    cmd === '--version' ||
    cmd === '-v' ||
    cmd === '-V'
  ) {
    return { ...base, command: 'version' };
  }

  // ── help / no command ─────────────────────────────────────────────────────
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    return { ...base, command: 'help' };
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

    return { ...base, command: 'init', dir, force };
  }

  // ── shots ─────────────────────────────────────────────────────────────────
  if (cmd === 'shots') {
    let port = DEFAULT_SHOT_PORT;
    const allow: string[] = [];

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--port' || arg === '-p') {
        const n = Number(rest[++i]);
        if (Number.isInteger(n) && n > 0 && n < 65536) port = n;
      } else if (arg.startsWith('--port=')) {
        const n = Number(arg.slice('--port='.length));
        if (Number.isInteger(n) && n > 0 && n < 65536) port = n;
      } else if (arg === '--allow') {
        const origin = rest[++i];
        if (origin) allow.push(origin.replace(/\/$/, ''));
      } else if (arg.startsWith('--allow=')) {
        const origin = arg.slice('--allow='.length);
        if (origin) allow.push(origin.replace(/\/$/, ''));
      }
      // Unknown flags are silently ignored to stay forward-compatible
    }

    return { ...base, command: 'shots', port, allow };
  }

  // Unknown command → help
  return { ...base, command: 'help' };
}
