/**
 * WalkHud — one guided sequence, three things to walk.
 *
 * WHY THIS REPLACED THE TEST-ALONG HUD
 * ------------------------------------
 * The Guide was a dead checklist. It said "check the payment step on
 * /checkout" and you ticked a box — but pressing the line did nothing: you
 * read the page name and navigated there yourself. Meanwhile "review what I
 * filed" and "re-check the fixes" wanted the exact same controls (go there,
 * show me, next) and had none.
 *
 * So there is now one walk, over two kinds of stop:
 *
 *   PLAN  — a step from the testing journey: what to check, what passing
 *           looks like, and a grade (pass / fail / doesn't apply).
 *   NOTE  — something already captured: its words, its screenshot, the spot
 *           lit up on the page, and — for anything in the re-test queue —
 *           re-shoot and a verdict.
 *
 * The notes walk deliberately walks whatever the LIST is showing, so the
 * re-test round is just "filter to Re-test, then walk". One mechanism, no
 * third mode to maintain.
 *
 * SURVIVING NAVIGATION is the whole trick. A walk moves the tester between
 * pages, and a page move may be a full load — so the position lives in
 * localStorage (see QaContext), and this HUD simply renders whatever the
 * restored state says. Without that the feature would die at its first stop.
 */

import { useEffect } from 'react';
import { useQa } from '../context/QaContext';
import { Icon, type IconName } from '../icons/Icon';
import { flashLocate } from '../lib/highlight';
import { ANY_PAGE } from '../lib/fallbackJourney';

const RISK_COLOR: Record<string, string> = {
  red: 'var(--qa-danger)',
  amber: 'var(--qa-warn)',
  green: 'var(--qa-success)',
};

export default function WalkHud() {
  const {
    dir, t, pick,
    walk, walkStops, walkGoto, walkNext, walkPrev, walkNavigate, exitWalk,
    gradeStep, guideChecked, guideFailed, guideSkipped,
    startCapture, updateNote, retestNote,
    notes,
  } = useQa();

  const index = Math.min(walk.index, Math.max(0, walkStops.length - 1));
  const stop = walkStops[index];

  // Chevrons point the way they NAVIGATE, not a fixed left/right — in RTL,
  // "back" moves visually rightward, so the glyphs swap while the buttons'
  // semantic roles stay put.
  const backIcon: IconName = dir === 'rtl' ? 'ChevronRight' : 'ChevronLeft';
  const nextIcon: IconName = dir === 'rtl' ? 'ChevronLeft' : 'ChevronRight';

  // Arriving at a stop, show where it is. For a note that means its own
  // target; for a plan step, the most recent evidence captured against it.
  // Keyed on the index alone so capturing something new here doesn't
  // immediately re-flash — this is a "where was this" cue on arrival, not an
  // echo of what the tester just did.
  useEffect(() => {
    const current = walkStops[index];
    if (!current) return;
    if (current.kind === 'note') {
      if (current.note.target) flashLocate(current.note.target);
      return;
    }
    const latest = current.evidence[current.evidence.length - 1];
    if (latest?.target) flashLocate(latest.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, walk.source]);

  // An emptied list (every note deleted, or a filter that now matches
  // nothing) would otherwise leave the HUD stranded with nothing to show.
  useEffect(() => {
    if (walk.active && walkStops.length === 0) exitWalk();
  }, [walk.active, walkStops.length, exitWalk]);

  if (!walk.active || !stop) return null;

  const atLast = index >= walkStops.length - 1;

  // ── Per-stop content ─────────────────────────────────────────────────────
  let title: string;
  let body: React.ReactNode;
  let actions: React.ReactNode;

  if (stop.kind === 'plan') {
    const { step } = stop;
    const passed = guideChecked.has(step.key);
    const failed = guideFailed.has(step.key);
    const skipped = guideSkipped.has(step.key);

    title = step.laneRole;
    body = (
      <>
        <p className="qa-m-0 qa-text-sm qa-text-hi">{pick(step.what)}</p>
        {step.expect && (
          <p className="qa-m-0 qa-text-11 qa-text-mid">
            <span className="qa-text-lo">{t('expected_label')}: </span>
            {pick(step.expect)}
          </p>
        )}
        <p className="qa-m-0 qa-flex qa-items-center qa-gap-1.5 qa-text-10 qa-text-lo">
          <span
            aria-hidden="true"
            className="qa-rounded-full qa-shrink-0"
            style={{ width: 7, height: 7, background: RISK_COLOR[step.risk] ?? 'var(--qa-neutral)' }}
          />
          <span className="qa-dir-ltr" dir="ltr">{step.path}</span>
          {stop.evidence.length > 0 && <span>· {t('evidence_n', { n: stop.evidence.length })}</span>}
        </p>
      </>
    );
    actions = (
      <>
        <button
          type="button"
          onClick={() => gradeStep(step.key, 'pass')}
          aria-pressed={passed}
          className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-px-2 qa-py-1 qa-text-11 qa-font-medium ${
            passed ? 'qa-bg-success-tint qa-text-success' : 'qa-bg-2 qa-text-mid'
          }`}
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="Check" size={12} />
          {t('mark_pass')}
        </button>
        <button
          type="button"
          onClick={() => gradeStep(step.key, 'fail')}
          aria-pressed={failed}
          className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-px-2 qa-py-1 qa-text-11 qa-font-medium ${
            failed ? 'qa-bg-danger-tint qa-text-danger' : 'qa-bg-2 qa-text-mid'
          }`}
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="X" size={12} />
          {t('mark_fail')}
        </button>
        <button
          type="button"
          onClick={() => gradeStep(step.key, 'na')}
          aria-pressed={skipped}
          title={t('mark_na_hint')}
          className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-px-2 qa-py-1 qa-text-11 qa-font-medium ${
            skipped ? 'qa-bg-3 qa-text-hi' : 'qa-bg-2 qa-text-mid'
          }`}
          style={{ border: 'none', cursor: 'pointer' }}
        >
          {t('mark_na')}
        </button>
        <button
          type="button"
          onClick={() => startCapture()}
          className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-bg-accent qa-px-2 qa-py-1 qa-text-11 qa-font-semibold"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="Crosshair" size={12} />
          {t('capture_here')}
        </button>
      </>
    );
  } else {
    const { note, number } = stop;
    const status = note.status ?? 'open';
    title = t('walk_note_title', { n: number });
    body = (
      <>
        <p className="qa-m-0 qa-text-sm qa-text-hi">{note.description}</p>
        <p className="qa-m-0 qa-flex qa-items-center qa-gap-1.5 qa-text-10 qa-text-lo">
          <Icon name="MapPin" size={11} className="qa-shrink-0" />
          <span className="qa-dir-ltr qa-truncate" dir="ltr">{note.route}</span>
          {status === 'fixed' && <span className="qa-text-warn">· {t('status_fixed')}</span>}
          {status === 'verified' && <span className="qa-text-success">· {t('status_verified')}</span>}
        </p>
      </>
    );
    actions = (
      <>
        {/* Re-shoot is offered for anything awaiting a re-test — the whole
            point of walking the queue is answering "is it fixed?" with a
            picture rather than a memory. */}
        {status === 'fixed' && (
          <button
            type="button"
            onClick={() => { void retestNote(note.id); }}
            className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-bg-warn-tint qa-text-warn qa-px-2 qa-py-1 qa-text-11 qa-font-medium"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <Icon name="Camera" size={12} />
            {t('retest_now')}
          </button>
        )}
        <button
          type="button"
          onClick={() => { void updateNote(note.id, { status: 'verified' }); walkNext(); }}
          className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-bg-success-tint qa-text-success qa-px-2 qa-py-1 qa-text-11 qa-font-medium"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="CheckCircle2" size={12} />
          {t('status_verified')}
        </button>
        <button
          type="button"
          onClick={() => { void updateNote(note.id, { status: 'open' }); walkNext(); }}
          className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-bg-danger-tint qa-text-danger qa-px-2 qa-py-1 qa-text-11 qa-font-medium"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="X" size={12} />
          {t('walk_still_broken')}
        </button>
      </>
    );
  }

  // '*' means "wherever you are" (generic plan steps), so there is nowhere to
  // take the tester — offering to navigate to a literal "*" would 404 them.
  const onThisPage =
    stop.path === ANY_PAGE ||
    (typeof window !== 'undefined' && stop.path === window.location.pathname);

  return (
    <div
      data-qa-overlay="true"
      dir={dir}
      role="region"
      aria-label={t('walk_title')}
      className="qa-fixed qa-flex qa-flex-col qa-gap-2 qa-rounded-2xl qa-border qa-border-subtle qa-bg-1 qa-elev-3 qa-p-3 qa-print-hidden"
      style={{
        insetInlineStart: 'calc(1rem + env(safe-area-inset-left))',
        bottom: 'calc(8.75rem + env(safe-area-inset-bottom))',
        width: 'min(92vw, 380px)',
        zIndex: 'var(--qa-z-panel)',
      }}
    >
      {/* header: which list, where we are, and the way out */}
      <div className="qa-flex qa-items-center qa-gap-2">
        <span className="qa-text-11 qa-font-semibold qa-text-hi qa-truncate">{title}</span>
        <span className="qa-text-10 qa-text-lo qa-shrink-0">
          {t('step_of', { n: index + 1, m: walkStops.length })}
        </span>
        <button
          type="button"
          onClick={exitWalk}
          className="qa-tap qa-ms-auto qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          {t('exit_walkthrough')}
        </button>
      </div>

      <div className="qa-space-y-1">{body}</div>

      {/* Take me there — the thing the old checklist never did. The reload
          button beside it is not a fallback for an error we can detect; it is
          there because no soft navigation can be guaranteed to move every
          app's router, and the tester must never be stuck. */}
      {!onThisPage && (
        <div className="qa-flex qa-items-center qa-gap-1">
          <button
            type="button"
            onClick={() => walkNavigate(stop.path)}
            className="qa-tap qa-inline-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-px-2 qa-py-1.5 qa-text-11 qa-font-semibold"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <Icon name="MapPinned" size={13} />
            {t('walk_take_me', { path: stop.path })}
          </button>
          <button
            type="button"
            onClick={() => walkNavigate(stop.path, true)}
            title={t('walk_reload_hint')}
            aria-label={t('walk_reload_hint')}
            className="qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-text-mid"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            <Icon name="RotateCcw" size={13} />
          </button>
        </div>
      )}

      <div className="qa-flex qa-flex-wrap qa-items-center qa-gap-1">{actions}</div>

      {/* movement */}
      <div className="qa-flex qa-items-center qa-gap-1">
        {/* Labelled, not icon-only: it sits beside a text "Next", and an
            unlabelled twin reads as a different kind of control. */}
        <button
          type="button"
          onClick={walkPrev}
          disabled={index === 0}
          aria-label={t('prev_step')}
          className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1.5 qa-text-11 qa-font-medium qa-text-mid"
          style={{ background: 'transparent', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}
        >
          <Icon name={backIcon} size={14} />
          {t('prev_step')}
        </button>
        <button
          type="button"
          onClick={walkNext}
          className="qa-tap qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1 qa-rounded-lg qa-border qa-border-subtle qa-px-2 qa-py-1.5 qa-text-11 qa-font-medium qa-text-hi"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          {atLast ? t('walk_finish') : t('next_step')}
          {!atLast && <Icon name={nextIcon} size={14} />}
        </button>
      </div>

      {/* A dot per stop: position at a glance, and a way to jump. */}
      {walkStops.length > 1 && walkStops.length <= 24 && (
        <div className="qa-flex qa-flex-wrap qa-gap-1" aria-hidden="true">
          {walkStops.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => walkGoto(i)}
              tabIndex={-1}
              className="qa-rounded-full"
              style={{
                width: 6,
                height: 6,
                padding: 0,
                border: 'none',
                cursor: 'pointer',
                background: i === index ? 'var(--qa-accent)' : 'var(--qa-surface-3)',
              }}
            />
          ))}
        </div>
      )}

      {/* A walk over notes that have all been dealt with should say so. */}
      {walk.source === 'notes' && notes.length === 0 && (
        <p className="qa-m-0 qa-text-10 qa-text-lo">{t('no_points')}</p>
      )}
    </div>
  );
}
