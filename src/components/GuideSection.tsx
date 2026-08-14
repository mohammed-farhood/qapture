/**
 * GuideSection — a visual journey map that is also the checklist. Role lanes
 * with connected tickable nodes + per-role and overall progress. Bilingual
 * (story-style step text from config.journey). Ticks persist (via context).
 *
 * Ported from GuideSection.jsx:
 *  - lucide-react → Icon
 *  - JOURNEY, THEME imports removed → useQa().journey / useQa().theme
 *  - pick() from strings replaced by useQa().pick
 *  - Guard for empty journey (avoids NaN %)
 *
 * Phase 2 additions:
 *  - 6px risk dot next to each step path (red/amber/green/none via RISK_COLORS)
 *  - Per-lane "red: N" badge when uncovered red steps exist
 *  - "RED N/M covered" primary metric above the overall progress bar
 *
 * v0.3 "Graphite" additions:
 *  - `theme` removed from useQa() — every colour below reads a fixed token
 *    (CSS custom property) or semantic utility class. The one per-lane
 *    customization point (config `journey[].color`) still works exactly as
 *    before, just defaulting to a literal mirror of --qa-accent instead of
 *    theme.primary (same hand-kept-in-sync-literal pattern as coverage.ts /
 *    highlight.ts, since this module can't read the shadow-scoped token at
 *    module scope).
 *  - "Start walkthrough" button in the overall banner → startTestAlong().
 *  - Per-step evidence badge (t('evidence_n')) sourced from evidenceByStep, a
 *    danger-tinted fail state from guideFailed, and a warn-tinted "ticked, no
 *    evidence" flag (t('no_evidence')) for steps checked without any linked
 *    note.
 */

import { useQa } from '../context/QaContext';
import type { QaJourneyLane, QaJourneyStep, QaBilingual } from '../config/schema';
import { Icon } from '../icons/Icon';
import { computeCoverage, RISK_COLORS } from '../lib/coverage';

const keyOf = (id: string, path: string) => `${id}::${path}`;

// Fixed Graphite accent mirror — literal copy of --qa-accent from styles.ts,
// used as the default lane colour when a journey lane doesn't specify its own
// via config. See file header note.
const DEFAULT_LANE_COLOR = '#4D9CFF';

// ---------------------------------------------------------------------------
// Lane
// ---------------------------------------------------------------------------

function Lane({
  group,
  checked,
  toggle,
  pick,
  onWalkFrom,
}: {
  group: QaJourneyLane;
  checked: Set<string>;
  toggle: (key: string) => void;
  pick: (v: QaBilingual | null | undefined) => string;
  /** Start the guided walk at this step (v0.7). */
  onWalkFrom: (key: string) => void;
}) {
  const { lang, t, guideFailed, evidenceByStep } = useQa();
  const { id, color = DEFAULT_LANE_COLOR, steps } = group;

  const done = steps.filter((s: QaJourneyStep) => checked.has(keyOf(id, s.path))).length;
  const pct  = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  // Count uncovered reds for this lane specifically
  const uncoveredRedCount = steps.filter(
    (s: QaJourneyStep) => s.risk === 'red' && !checked.has(keyOf(id, s.path)),
  ).length;

  return (
    <div className="qa-rounded-xl qa-border qa-border-subtle qa-bg-2 qa-p-3 qa-elev-1">
      {/* lane header */}
      <div className="qa-mb-2 qa-flex qa-items-center qa-gap-2">
        <span
          className="qa-h-2.5 qa-w-2.5 qa-rounded-full"
          style={{ background: color }}
        />
        <span className="qa-text-sm qa-font-bold qa-text-hi">
          {pick(group.role)}
        </span>
        <span className="qa-ms-auto qa-text-11 qa-font-medium qa-text-slate-400">
          {done}/{steps.length}
        </span>

        {/* uncovered reds badge — hidden when 0 */}
        {uncoveredRedCount > 0 && (
          <span
            className="qa-bg-danger-tint qa-text-danger qa-rounded qa-px-1 qa-text-10 qa-font-medium"
            title={
              lang === 'ar'
                ? `${uncoveredRedCount} منطقة حمراء غير مغطاة`
                : `${uncoveredRedCount} uncovered red zone(s)`
            }
          >
            {lang === 'ar' ? `أحمر: ${uncoveredRedCount}` : `red: ${uncoveredRedCount}`}
          </span>
        )}
      </div>

      {/* progress bar */}
      <div
        className="qa-mb-3 qa-h-1.5 qa-overflow-hidden qa-rounded-full"
        style={{ background: `${color}22` }}
      >
        <div
          className="qa-h-full qa-rounded-full qa-transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* steps */}
      <ol className="qa-relative qa-ms-1.5">
        {/* vertical connector line */}
        <span
          className="qa-absolute qa-top-1 qa-bottom-0 qa-w-px"
          style={{ insetInlineStart: '7px', background: `${color}40`, bottom: '4px' }}
        />
        {steps.map((s: QaJourneyStep, i: number) => {
          const k              = keyOf(id, s.path);
          const on             = checked.has(k);
          const failed         = guideFailed.has(k);
          const evidence       = evidenceByStep.get(k);
          const evidenceCount  = evidence ? evidence.length : 0;
          const riskColor      = s.risk ? RISK_COLORS[s.risk] : RISK_COLORS.none;
          const dotTitle       = !s.risk
            ? (lang === 'ar' ? 'لم يتم تقييم المخاطر بعد' : 'not graded yet')
            : (s.riskWhy ?? s.risk);

          return (
            <li key={`${k}-${i}`} className="qa-relative qa-mb-2 qa-last-mb-0">
              {/* v0.7: pressing a step WALKS from it — navigate there, see
                  what to check, grade it — instead of the tester reading a
                  path and finding the page themselves. The tick box is still
                  the tick box; this is the "take me there" the checklist
                  always implied. */}
              <button
                onClick={() => onWalkFrom(k)}
                title={t('walk_take_me', { path: s.path })}
                aria-label={t('walk_take_me', { path: s.path })}
                className="qa-tap-icon qa-absolute qa-rounded-lg qa-text-mid qa-hover-text-slate-600"
                style={{
                  top: 0,
                  insetInlineEnd: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 2,
                }}
              >
                <Icon name="Play" size={12} />
              </button>
              <button
                onClick={() => toggle(k)}
                className={`qa-flex qa-w-full qa-items-start qa-gap-2.5 qa-rounded-lg qa-p-1 qa-text-start qa-hover-bg-black-3${failed ? ' qa-bg-danger-tint' : ''}`}
                style={{ background: failed ? undefined : 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {/* node circle */}
                <span
                  className="qa-relative qa-z-1 qa-mt-0.5 qa-flex qa-h-4 qa-w-4 qa-shrink-0 qa-items-center qa-justify-center qa-rounded-full qa-border-2 qa-transition"
                  style={{
                    borderColor: failed ? 'var(--qa-danger)' : color,
                    background: on ? color : failed ? 'var(--qa-danger-tint)' : 'var(--qa-surface-1)',
                    zIndex: 1,
                  }}
                >
                  {on && <Icon name="Check" size={10} strokeWidth={3} className="qa-text-white" />}
                  {!on && failed && (
                    <Icon name="AlertTriangle" size={9} strokeWidth={2.5} className="qa-text-danger" />
                  )}
                </span>

                {/* step content */}
                <span className="qa-min-w-0">
                  {/* path + risk dot on the same line */}
                  <span className="qa-flex qa-items-center qa-gap-1">
                    <code
                      className="qa-rounded qa-px-1 qa-text-11 qa-font-semibold qa-dir-ltr qa-text-hi"
                      style={{
                        background: failed ? 'var(--qa-danger-tint)' : `${color}14`,
                        textDecoration: on ? 'line-through' : 'none',
                        opacity: on ? 0.55 : 1,
                      }}
                    >
                      {s.path}
                    </code>
                    {/* 6px risk dot */}
                    <span
                      className="qa-inline-block qa-rounded-full qa-shrink-0"
                      style={{
                        width:        '6px',
                        height:       '6px',
                        background:   riskColor,
                        flexShrink:   0,
                      }}
                      title={dotTitle}
                    />
                  </span>

                  <span
                    className="qa-mt-0.5 qa-block qa-text-11 qa-leading-relaxed qa-text-slate-500"
                    style={{ opacity: on ? 0.5 : 1 }}
                  >
                    {pick(s.what)}
                  </span>

                  {/* evidence / no-evidence flags */}
                  {evidenceCount > 0 && (
                    <span className="qa-mt-1 qa-inline-flex qa-items-center qa-rounded qa-bg-accent-tint qa-text-accent qa-px-1 qa-text-10 qa-font-medium">
                      {t('evidence_n', { n: evidenceCount })}
                    </span>
                  )}
                  {evidenceCount === 0 && on && (
                    <span className="qa-mt-1 qa-inline-flex qa-items-center qa-rounded qa-bg-warn-tint qa-text-warn qa-px-1 qa-text-10 qa-font-medium">
                      {t('no_evidence')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuideSection
// ---------------------------------------------------------------------------

export default function GuideSection() {
  const { guideChecked, toggleGuide, t, journey, pick, lang, startTestAlong, startWalk, testAlongSteps } = useQa();

  const all  = journey.flatMap((g) => g.steps.map((s) => keyOf(g.id, s.path)));
  const done = all.filter((k) => guideChecked.has(k)).length;
  const pct  = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

  // Overall risk coverage (pure, cheap)
  const coverage = computeCoverage(journey, guideChecked);

  return (
    <div className="qa-space-y-3">
      {/* overall progress banner */}
      <div className="qa-rounded-xl qa-border qa-border-accent qa-bg-accent-tint qa-p-3 qa-elev-1">
        {/* RED N/M covered — shown only when the journey has red steps */}
        {coverage.red.total > 0 && (
          <div className="qa-mb-1 qa-flex qa-items-center qa-gap-1.5 qa-text-11">
            <span className="qa-bg-danger-tint qa-text-danger qa-rounded qa-px-1 qa-font-bold">
              {lang === 'ar' ? 'أحمر' : 'RED'}
            </span>
            <span className="qa-dir-ltr qa-font-semibold qa-text-hi">
              {coverage.red.covered}/{coverage.red.total}
              {' '}
              {lang === 'ar' ? 'مغطى' : 'covered'}
            </span>
          </div>
        )}

        {/* overall progress header */}
        <div className="qa-flex qa-items-center qa-justify-between qa-text-sm qa-font-semibold qa-text-hi">
          <span>{t('journey_title')}</span>
          <span className="qa-dir-ltr">
            {done}/{all.length} · {pct}%
          </span>
        </div>

        {/* overall progress bar */}
        <div className="qa-mt-2 qa-h-2 qa-overflow-hidden qa-rounded-full qa-bg-3">
          <div
            className="qa-h-full qa-rounded-full qa-bg-accent qa-transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* walkthrough entry point */}
        <div className="qa-mt-2 qa-flex qa-justify-end">
          <button
            type="button"
            onClick={startTestAlong}
            disabled={all.length === 0}
            className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-full qa-bg-accent qa-border-0 qa-cursor-pointer qa-px-3 qa-py-1 qa-text-xs qa-font-semibold qa-focus-ring"
          >
            <Icon name="Play" size={13} />
            {t('start_walkthrough')}
          </button>
        </div>
      </div>

      {/* lanes */}
      {journey.map((g) => (
        <Lane
          key={g.id}
          group={g}
          checked={guideChecked}
          toggle={toggleGuide}
          onWalkFrom={(key: string) => {
            const at = testAlongSteps.findIndex((step) => step.key === key);
            startWalk('plan', at === -1 ? 0 : at);
          }}
          pick={pick}
        />
      ))}

      {/* empty state */}
      {journey.length === 0 && (
        <p className="qa-py-8 qa-text-center qa-text-sm qa-text-slate-400">
          {t('tab_guide')}
        </p>
      )}
    </div>
  );
}
