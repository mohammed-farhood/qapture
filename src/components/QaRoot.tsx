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
import TestAlongHud from './TestAlongHud';
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
  const { isOpen, setIsOpen, testAlong } = useQa();

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

  if (!widgetShown) return null;

  return (
    <>
      <QaFab />
      {testAlong.active ? <TestAlongHud /> : <QaPanel />}
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
