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
 */

import { useQa } from '../context/QaContext';
import type { QaJourneyLane, QaJourneyStep, QaBilingual } from '../config/schema';
import { Icon } from '../icons/Icon';
import { computeCoverage, RISK_COLORS } from '../lib/coverage';

const keyOf = (id: string, path: string) => `${id}::${path}`;

// ---------------------------------------------------------------------------
// Lane
// ---------------------------------------------------------------------------

function Lane({
  group,
  checked,
  toggle,
  pick,
}: {
  group: QaJourneyLane;
  checked: Set<string>;
  toggle: (key: string) => void;
  pick: (v: QaBilingual | null | undefined) => string;
}) {
  const { theme, lang } = useQa();
  const { id, color = theme.primary, steps } = group;

  const done = steps.filter((s: QaJourneyStep) => checked.has(keyOf(id, s.path))).length;
  const pct  = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  // Count uncovered reds for this lane specifically
  const uncoveredRedCount = steps.filter(
    (s: QaJourneyStep) => s.risk === 'red' && !checked.has(keyOf(id, s.path)),
  ).length;

  return (
    <div
      className="qa-rounded-xl qa-border qa-bg-white qa-p-3 qa-shadow-sm"
      style={{ borderColor: `${theme.primary}14` }}
    >
      {/* lane header */}
      <div className="qa-mb-2 qa-flex qa-items-center qa-gap-2">
        <span
          className="qa-h-2.5 qa-w-2.5 qa-rounded-full"
          style={{ background: color }}
        />
        <span className="qa-text-sm qa-font-bold" style={{ color: theme.ink }}>
          {pick(group.role)}
        </span>
        <span className="qa-ms-auto qa-text-11 qa-font-medium qa-text-slate-400">
          {done}/{steps.length}
        </span>

        {/* uncovered reds badge — hidden when 0 */}
        {uncoveredRedCount > 0 && (
          <span
            className="qa-rounded qa-px-1 qa-text-10 qa-font-medium"
            style={{ background: '#FEF2F2', color: RISK_COLORS.red }}
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
        {steps.map((s: QaJourneyStep) => {
          const k         = keyOf(id, s.path);
          const on        = checked.has(k);
          const riskColor = s.risk ? RISK_COLORS[s.risk] : RISK_COLORS.none;
          const dotTitle  = !s.risk
            ? (lang === 'ar' ? 'لم يتم تقييم المخاطر بعد' : 'not graded yet')
            : (s.riskWhy ?? s.risk);

          return (
            <li key={s.path} className="qa-relative qa-mb-2 qa-last-mb-0">
              <button
                onClick={() => toggle(k)}
                className="qa-flex qa-w-full qa-items-start qa-gap-2.5 qa-rounded-lg qa-p-1 qa-text-start qa-hover-bg-black-3"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {/* node circle */}
                <span
                  className="qa-relative qa-z-1 qa-mt-0.5 qa-flex qa-h-4 qa-w-4 qa-shrink-0 qa-items-center qa-justify-center qa-rounded-full qa-border-2 qa-transition"
                  style={{
                    borderColor: color,
                    background: on ? color : '#fff',
                    zIndex: 1,
                  }}
                >
                  {on && <Icon name="Check" size={10} strokeWidth={3} className="qa-text-white" />}
                </span>

                {/* step content */}
                <span className="qa-min-w-0">
                  {/* path + risk dot on the same line */}
                  <span className="qa-flex qa-items-center qa-gap-1">
                    <code
                      className="qa-rounded qa-px-1 qa-text-11 qa-font-semibold qa-dir-ltr"
                      style={{
                        background: `${color}14`,
                        color: theme.ink,
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
  const { guideChecked, toggleGuide, t, journey, pick, theme, lang } = useQa();

  const all  = journey.flatMap((g) => g.steps.map((s) => keyOf(g.id, s.path)));
  const done = all.filter((k) => guideChecked.has(k)).length;
  const pct  = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

  // Overall risk coverage (pure, cheap)
  const coverage = computeCoverage(journey, guideChecked);

  return (
    <div className="qa-space-y-3">
      {/* overall progress banner */}
      <div
        className="qa-rounded-xl qa-p-3 qa-text-white qa-shadow-sm"
        style={{ backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
      >
        {/* RED N/M covered — shown only when the journey has red steps */}
        {coverage.red.total > 0 && (
          <div className="qa-mb-1 qa-flex qa-items-center qa-gap-1.5 qa-text-11">
            <span
              className="qa-rounded qa-px-1 qa-font-bold"
              style={{ background: 'rgba(0,0,0,0.25)' }}
            >
              {lang === 'ar' ? 'أحمر' : 'RED'}
            </span>
            <span className="qa-dir-ltr qa-font-semibold">
              {coverage.red.covered}/{coverage.red.total}
              {' '}
              {lang === 'ar' ? 'مغطى' : 'covered'}
            </span>
          </div>
        )}

        {/* overall progress header */}
        <div className="qa-flex qa-items-center qa-justify-between qa-text-sm qa-font-semibold">
          <span>{t('journey_title')}</span>
          <span className="qa-dir-ltr">
            {done}/{all.length} · {pct}%
          </span>
        </div>

        {/* overall progress bar */}
        <div className="qa-mt-2 qa-h-2 qa-overflow-hidden qa-rounded-full qa-bg-white-25">
          <div
            className="qa-h-full qa-rounded-full qa-bg-white qa-transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* lanes */}
      {journey.map((g) => (
        <Lane
          key={g.id}
          group={g}
          checked={guideChecked}
          toggle={toggleGuide}
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
