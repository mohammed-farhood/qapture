/**
 * QaRoot — the top-level component for qapture's Shadow-DOM tree.
 *
 * Responsibilities:
 *  1. Error boundary: catches errors thrown during rendering, in lifecycle
 *     methods, and in constructors of the components below it, so a
 *     rendering bug in the tool doesn't crash the host application. It does
 *     NOT catch errors thrown from event handlers (e.g. pointer/keyboard
 *     handlers) — React never routes those through componentDidCatch — nor
 *     errors in async callbacks; those need their own handling if needed.
 *  2. QaProvider: wires up all runtime state.
 *  3. Visibility gating: renders the whole widget (FAB included) only when
 *     allowed — see `widgetShown` below.
 *  4. Hotkey: registers config.hotkey on document to show/hide the widget
 *     and open/close the panel.
 *  5. CaptureGate: mounts <CaptureMode> only when captureActive is true.
 *  6. Always mounts <NoticeHost> (toast stack) once the widget is shown, and
 *     mounts <TestAlongHud> in place of <QaPanel> while a guided walkthrough
 *     is active.
 *
 * v0.3 "Graphite" — widgetShown vs. isOpen split (this file):
 *  Pre-0.3, a single `visible` boolean gated the whole widget AND doubled as
 *  the hotkey target, so toggling the hotkey after the panel had been
 *  manually closed made the FAB itself vanish — there was no way to tell
 *  "hide everything" apart from "just close the panel". Those are now two
 *  independent pieces of state:
 *    - `widgetShown` (local to this component) — whether the widget (FAB
 *      included) renders at all.
 *    - `isOpen` (QaContext) — whether the panel is open. Unaffected by
 *      whether the widget itself is shown.
 *  The hotkey now behaves as: if the widget is currently hidden, show it AND
 *  open the panel (so pressing it always lands somewhere useful); otherwise
 *  it toggles ONLY the panel — the FAB never disappears again once the
 *  widget has been shown.
 *  While `testAlong.active`, <QaPanel> is suppressed (not rendered) in favor
 *  of <TestAlongHud>, which replaces it as the bottom UI for the walkthrough.
 *
 * Visibility logic (widgetShown's initial value):
 *  - config.alwaysVisible === true → always show
 *  - config.visible === true       → always show
 *  - config.visible === false      → always hide
 *  - config.visible === undefined  → show only in non-production environments
 *
 * "Production" is detected as:
 *  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
 * (build tools typically replace process.env.NODE_ENV at bundle time)
 */

import React, { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ResolvedConfig } from '../config/schema';
import { QaProvider, useQa } from '../context/QaContext';
import QaFab from './QaFab';
import QaPanel from './QaPanel';
import NoticeHost from './NoticeHost';
import WalkHud from './WalkHud';
import CaptureMode from './CaptureMode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isProduction(): boolean {
  try {
    // Read NODE_ENV without referencing the bare `process` identifier (the
    // browser-only TS lib has no Node types); most bundlers still define it.
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process;
    return proc?.env?.['NODE_ENV'] === 'production';
  } catch {
    return false;
  }
}

/**
 * Parse a hotkey string like 'shift+alt+q' into its parts.
 * Returns null if the string is empty or malformed.
 */
function parseHotkey(hotkey: string): {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  key: string;
} | null {
  if (!hotkey) return null;
  const parts = hotkey.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  if (!key) return null;
  return {
    shift: parts.includes('shift'),
    alt:   parts.includes('alt'),
    ctrl:  parts.includes('ctrl') || parts.includes('control'),
    meta:  parts.includes('meta') || parts.includes('cmd'),
    key,
  };
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

type EBState = { caught: boolean };

class QaErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { caught: false };
  }

  static getDerivedStateFromError(): EBState {
    return { caught: true };
  }

  override componentDidCatch(err: unknown, info: unknown): void {
    // eslint-disable-next-line no-console
    console.error('[Qapture] Caught error in overlay:', err, info);
  }

  override render(): ReactNode {
    if (this.state.caught) return null; // silent failure — host app is unaffected
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// CaptureGate — mounts CaptureMode only when capture is active
// ---------------------------------------------------------------------------

function CaptureGate() {
  const { captureActive } = useQa();
  return captureActive ? <CaptureMode /> : null;
}

// ---------------------------------------------------------------------------
// Inner — visibility gating + hotkey
// ---------------------------------------------------------------------------

function QaRootInner({ config }: { config: ResolvedConfig }) {
  const { isOpen, setIsOpen, walk, startCapture, endCapture, captureActive } = useQa();

  const shouldShowInitially =
    config.alwaysVisible === true ||
    config.visible === true ||
    (config.visible === undefined && !isProduction());

  // Whole-widget visibility (FAB included) — see the file-level doc comment
  // for why this is now split from the panel's own `isOpen`.
  const [widgetShown, setWidgetShown] = useState(shouldShowInitially);

  // Register the hotkey to show/hide the widget and open/close the panel.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const hk = parseHotkey(config.hotkey);
    if (!hk) return;

    const handler = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === hk.key &&
        !!e.shiftKey === hk.shift &&
        !!e.altKey   === hk.alt   &&
        !!e.ctrlKey  === hk.ctrl  &&
        !!e.metaKey  === hk.meta
      ) {
        e.preventDefault();
        if (!widgetShown) {
          // Widget was fully hidden: bring it up AND open the panel — the
          // hotkey should always land somewhere useful, not just reveal a
          // closed FAB the tester then has to click separately.
          setWidgetShown(true);
          setIsOpen(true);
        } else {
          // Widget already shown: the FAB itself must never disappear again
          // — from here on the hotkey only toggles the panel.
          setIsOpen(!isOpen);
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [config.hotkey, widgetShown, isOpen, setIsOpen]);

  // ── Capture hotkey (v0.5) ────────────────────────────────────────────────
  // Spotting a bug and then hunting for the FAB is three actions before you
  // can point at the thing; a tester does that dozens of times a session.
  // This drops straight into capture mode from wherever the cursor is, and
  // pressing it again backs out.
  //
  // A keydown carries transient activation, so this also satisfies the user
  // gesture that getDisplayMedia needs for pixel-exact capture — the same
  // reason startCapture() re-acquires the tab stream on a click.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const hk = parseHotkey(config.captureHotkey);
    if (!hk) return;

    const handler = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === hk.key &&
        !!e.shiftKey === hk.shift &&
        !!e.altKey   === hk.alt   &&
        !!e.ctrlKey  === hk.ctrl  &&
        !!e.metaKey  === hk.meta
      ) {
        e.preventDefault();
        if (captureActive) { endCapture(false); return; }
        setWidgetShown(true); // capturing while hidden would have nowhere to land
        startCapture();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [config.captureHotkey, captureActive, startCapture, endCapture]);

  // ── "Why isn't it showing up?" (v0.6.1) ─────────────────────────────────
  // The dev-only default is deliberate, but it is also the single most
  // common reason someone reports the widget "not appearing on some pages" —
  // typically a production build, or a page rendered by a route that never
  // mounts the component. Silence makes that unanswerable, so say it once,
  // clearly, with the fix. Only for the ambiguous default: an explicit
  // `visible: false` is someone stating their intent, and deserves no noise.
  useEffect(() => {
    if (widgetShown || config.visible !== undefined || config.alwaysVisible) return;
    // eslint-disable-next-line no-console
    console.info(
      '[Qapture] Hidden: this looks like a production build, and the default is dev-only. ' +
      'Set `alwaysVisible: true` in your qa.config to show it here (it is still 100% ' +
      'client-side — nothing is sent anywhere).',
    );
  }, [widgetShown, config.visible, config.alwaysVisible]);

  if (!widgetShown) return null;

  return (
    <>
      <QaFab />
      {walk.active ? <WalkHud /> : <QaPanel />}
      <NoticeHost />
      <CaptureGate />
    </>
  );
}

// ---------------------------------------------------------------------------
// QaRoot — public entry for ShadowMount
// ---------------------------------------------------------------------------

export default function QaRoot({ config }: { config: ResolvedConfig }) {
  return (
    <QaErrorBoundary>
      <QaProvider config={config}>
        <QaRootInner config={config} />
      </QaProvider>
    </QaErrorBoundary>
  );
}
