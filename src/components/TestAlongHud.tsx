/**
 * TestAlongHud — the guided-walkthrough bottom bar.
 *
 * Replaces QaPanel while a test-along walkthrough is active (contract §6):
 * QaRoot mounts this component (and suppresses QaPanel) whenever
 * `testAlong.active` is true. It shows the current journey step ("Step n of
 * m" + its `what`/`expect` copy), lets the tester step Back/Next through the
 * journey, grade the current step Pass/Fail, jump straight into capture mode
 * anchored to this step (the resulting note auto-links via QaContext's
 * journeyRef resolution — nothing extra to pass here), and Exit back to the
 * normal panel.
 *
 * Defensive `testAlong.active` guard: QaRoot is contracted to only mount this
 * component while a walkthrough is active, but the guard costs nothing and
 * means a future wiring mistake fails safe (renders nothing) instead of
 * showing a broken bar with no steps.
 *
 * On every step change (index changes — including the initial mount at
 * index 0) this re-highlights the spot the LATEST evidence note for that step
 * was captured at, via flashLocate(), so the tester can see at a glance where
 * a past capture landed without having to open the note itself.
 *
 * Layout: fixed to the bottom, spanning the safe-area-inset gutters (an
 * inner, width-capped bar is centered inside that full-width strip — the
 * outer strip is pointer-events:none so any empty margin around the capped
 * bar never blocks clicks to the page, matching NoticeHost's "outer none /
 * content auto" split). qa-bg-1 surface + border-subtle + elev-3, same
 * z-layer as the panel it replaces (--qa-z-panel).
 */

import { useEffect } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/Icon';
import { flashLocate } from '../lib/highlight';
import { RISK_COLORS } from '../lib/coverage';

export default function TestAlongHud() {
  const {
    dir,
    t,
    pick,
    testAlong,
    testAlongSteps,
    gotoStep,
    gradeStep,
    exitTestAlong,
    startCapture,
    evidenceByStep,
  } = useQa();

  const index = testAlong.index;
  const steps = testAlongSteps;
  const currentStep = steps[index];

  // Chevrons point the way they NAVIGATE, not a fixed left/right — in RTL,
  // "back" moves visually rightward (reading flows right-to-left), so the
  // glyphs swap while the button's semantic role (prev/next) stays put.
  const backIcon: IconName = dir === 'rtl' ? 'ChevronRight' : 'ChevronLeft';
  const nextIcon: IconName = dir === 'rtl' ? 'ChevronLeft' : 'ChevronRight';

  // Re-highlight the latest evidence for the CURRENT step whenever the step
  // index changes (including the very first render, since a walkthrough may
  // resume on a step that already has captures from an earlier session).
  // Deliberately keyed on `testAlong.index` alone — NOT on `evidenceByStep` —
  // so capturing a NEW note for the step the tester is already on (via
  // "Capture here", below) doesn't immediately re-flash it a second time;
  // the flash is a "where was this tested before" cue on arrival, not an
  // echo of an action just taken on this same step.
  useEffect(() => {
    const step = steps[index];
    if (!step) return;
    const notesForStep = evidenceByStep.get(step.key);
    if (!notesForStep || notesForStep.length === 0) return;
    const latest = notesForStep[notesForStep.length - 1]; // oldest→newest per contract
    if (latest.target) flashLocate(latest.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testAlong.index]);

  if (!testAlong.active) return null;

  const atFirst = index <= 0;
  const atLast = index >= steps.length - 1;
  const riskColor = RISK_COLORS[currentStep?.risk ?? 'green'];

  return (
    <div
      data-qa-overlay="true"
      dir={dir}
      className="qa-fixed qa-print-hidden"
      style={{
        left: 'env(safe-area-inset-left)',
        right: 'env(safe-area-inset-right)',
        bottom: 'env(safe-area-inset-bottom)',
        zIndex: 'var(--qa-z-panel)',
        padding: '0.75rem',
        pointerEvents: 'none',
      }}
    >
      <div
        role="region"
        aria-label={t('journey_title')}
        className="qa-flex qa-flex-col qa-gap-2 qa-bg-1 qa-border qa-border-subtle qa-elev-3 qa-rounded-xl qa-p-3"
        style={{ maxWidth: '32rem', marginInline: 'auto', pointerEvents: 'auto' }}
      >
        {/* ── Step counter + risk dot + Exit ─────────────────────────────── */}
        <div className="qa-flex qa-items-center qa-gap-2">
          <span
            aria-hidden="true"
            className="qa-shrink-0 qa-rounded-full"
            style={{ width: 8, height: 8, backgroundColor: riskColor }}
          />
          <span className="qa-text-11 qa-font-semibold qa-text-mid">
            {t('step_of', { n: index + 1, m: steps.length })}
          </span>
          <button
            type="button"
            onClick={exitTestAlong}
            className="qa-tap qa-ms-auto qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-px-2 qa-py-1 qa-text-11 qa-font-medium qa-text-lo qa-hover-bg-2 qa-focus-ring qa-transition"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="X" size={14} />
            {t('exit_walkthrough')}
          </button>
        </div>

        {/* ── Current step copy ──────────────────────────────────────────── */}
        {currentStep && (
          <div className="qa-min-w-0">
            <p className="qa-text-sm qa-font-medium qa-text-hi qa-break-words">
              {pick(currentStep.what)}
            </p>
            {currentStep.expect && (
              <p className="qa-text-11 qa-text-mid qa-mt-1 qa-break-words">
                <span className="qa-font-semibold">{t('expected_label')}: </span>
                {pick(currentStep.expect)}
              </p>
            )}
          </div>
        )}

        {/* ── Nav / grade / capture ───────────────────────────────────────── */}
        <div className="qa-flex qa-flex-wrap qa-items-center qa-gap-2">
          <button
            type="button"
            onClick={() => gotoStep(index - 1)}
            disabled={atFirst}
            className="qa-tap qa-shrink-0 qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1.5 qa-text-xs qa-font-medium qa-text-hi qa-hover-bg-2 qa-focus-ring qa-transition"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            <Icon name={backIcon} size={14} />
            {t('prev_step')}
          </button>

          <button
            type="button"
            onClick={() => currentStep && gradeStep(currentStep.key, 'fail')}
            disabled={!currentStep}
            className="qa-tap qa-flex-1 qa-inline-flex qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-bg-danger-tint qa-text-danger qa-text-xs qa-font-semibold qa-focus-ring qa-transition"
            style={{ border: 'none', cursor: 'pointer', minWidth: '4.5rem' }}
          >
            <Icon name="AlertTriangle" size={14} />
            {t('mark_fail')}
          </button>

          <button
            type="button"
            onClick={() => currentStep && gradeStep(currentStep.key, 'pass')}
            disabled={!currentStep}
            className="qa-tap qa-flex-1 qa-inline-flex qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-bg-success-tint qa-text-success qa-text-xs qa-font-semibold qa-focus-ring qa-transition"
            style={{ border: 'none', cursor: 'pointer', minWidth: '4.5rem' }}
          >
            <Icon name="Check" size={14} />
            {t('mark_pass')}
          </button>

          <button
            type="button"
            onClick={() => startCapture()}
            className="qa-tap qa-flex-1 qa-inline-flex qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-text-xs qa-font-semibold qa-focus-ring qa-transition"
            style={{ border: 'none', cursor: 'pointer', minWidth: '6rem' }}
          >
            <Icon name="Crosshair" size={14} />
            {t('capture_here')}
          </button>

          <button
            type="button"
            onClick={() => gotoStep(index + 1)}
            disabled={atLast}
            className="qa-tap qa-shrink-0 qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1.5 qa-text-xs qa-font-medium qa-text-hi qa-hover-bg-2 qa-focus-ring qa-transition"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            {t('next_step')}
            <Icon name={nextIcon} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
