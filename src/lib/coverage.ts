/**
 * coverage.ts — pure coverage computation for the graded risk map.
 *
 * computeCoverage walks every journey lane + step and tallies how many
 * red/amber/green steps are covered (i.e. present in guideChecked).
 * It returns a rich summary consumed by GuideSection, QaPanel, and exportZip.
 *
 * Key contracts:
 *  - The checked key for a step is `${lane.id}::${step.path}` — same scheme
 *    used by GuideSection and QaContext.toggleGuide.
 *  - Steps with no `risk` field are counted as 'green'.
 *  - When red.total === 0, redScore is 1 (full coverage by vacuous truth).
 *
 * Tier thresholds (based on redScore):
 *   Minimal  < 0.50
 *   Adequate 0.50 – 0.79
 *   Full     0.80 – 0.99
 *   Complete 1.00
 */

import type { QaJourneyLane } from '../config/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RISK_COLORS = {
  red:   '#EF4444',
  amber: '#F59E0B',
  green: '#22C55E',
  none:  '#CBD5E1',
} as const;

export type RiskColorKey = keyof typeof RISK_COLORS;

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export type CoverageResult = {
  red:   { total: number; covered: number };
  amber: { total: number; covered: number };
  green: { total: number; covered: number };
  total: { total: number; covered: number };
  /** covered/total for red steps; 1 when red.total === 0 */
  redScore: number;
  /** Coverage tier based on redScore */
  tier: 'Minimal' | 'Adequate' | 'Full' | 'Complete';
  /** Steps with risk=red that are NOT yet covered */
  uncoveredReds: Array<{ lane: string; path: string; riskWhy?: string }>;
  /** Steps with risk=red that ARE covered */
  coveredReds:   Array<{ lane: string; path: string }>;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute coverage metrics across all journey lanes.
 *
 * Pure function — no side effects, safe to call during render.
 *
 * @param journey      - resolved journey lanes from config
 * @param guideChecked - set of checked keys (`${laneId}::${step.path}`)
 */
export function computeCoverage(
  journey: QaJourneyLane[],
  guideChecked: Set<string>,
): CoverageResult {
  const red   = { total: 0, covered: 0 };
  const amber = { total: 0, covered: 0 };
  const green = { total: 0, covered: 0 };

  const uncoveredReds: CoverageResult['uncoveredReds'] = [];
  const coveredReds:   CoverageResult['coveredReds']   = [];

  for (const lane of journey) {
    // Use the English role label for report output.
    const laneLabel =
      typeof lane.role === 'string' ? lane.role : lane.role.en;

    for (const step of lane.steps) {
      const key     = `${lane.id}::${step.path}`;
      const covered = guideChecked.has(key);
      const risk    = step.risk ?? 'green';

      if (risk === 'red') {
        red.total++;
        if (covered) {
          red.covered++;
          coveredReds.push({ lane: laneLabel, path: step.path });
        } else {
          uncoveredReds.push({
            lane:    laneLabel,
            path:    step.path,
            riskWhy: step.riskWhy,
          });
        }
      } else if (risk === 'amber') {
        amber.total++;
        if (covered) amber.covered++;
      } else {
        // 'green' or no risk field
        green.total++;
        if (covered) green.covered++;
      }
    }
  }

  const totalTotal   = red.total   + amber.total   + green.total;
  const totalCovered = red.covered + amber.covered + green.covered;

  const redScore = red.total === 0 ? 1 : red.covered / red.total;

  let tier: CoverageResult['tier'];
  if (redScore >= 1) {
    tier = 'Complete';
  } else if (redScore >= 0.8) {
    tier = 'Full';
  } else if (redScore >= 0.5) {
    tier = 'Adequate';
  } else {
    tier = 'Minimal';
  }

  return {
    red,
    amber,
    green,
    total:       { total: totalTotal, covered: totalCovered },
    redScore,
    tier,
    uncoveredReds,
    coveredReds,
  };
}
