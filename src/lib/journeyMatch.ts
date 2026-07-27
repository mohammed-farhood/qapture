/**
 * journeyMatch.ts — link a captured note back to the journey step it belongs to.
 *
 * The tester is on /orders/1042 when they capture a bug. The journey declares
 * the step as /orders/:id. Without this, that note lands unattached and the
 * coverage report never learns the step was exercised.
 */

import type { QaJourneyLane } from '../config/schema';

export type QaJourneyRef = { laneId: string; path: string };

/** Strip query/hash and any trailing slash (but keep a bare '/'). */
function normalizeRoute(route: string): string {
  const path = String(route ?? '').split(/[?#]/)[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

function segments(path: string): string[] {
  return normalizeRoute(path).split('/').filter(Boolean);
}

/**
 * True when `stepPath` matches `route`, treating `:param` (and `[param]`,
 * Next.js's file-route spelling) as a wildcard for exactly one segment.
 */
function matchesWithParams(stepPath: string, route: string): boolean {
  const stepSegs = segments(stepPath);
  const routeSegs = segments(route);
  if (stepSegs.length !== routeSegs.length) return false;
  return stepSegs.every((seg, i) => {
    const isParam = seg.startsWith(':') || (seg.startsWith('[') && seg.endsWith(']'));
    return isParam || seg.toLowerCase() === routeSegs[i].toLowerCase();
  });
}

/**
 * Every journey step matching the current route.
 *
 * Exact matches are returned FIRST, so a caller taking [0] gets the most
 * specific step: a journey declaring both /orders/new and /orders/:id should
 * attribute a note captured on /orders/new to the literal step, not the
 * parameterised one that also happens to match.
 */
export function matchRouteToSteps(
  journey: QaJourneyLane[] | null | undefined,
  route: string,
): QaJourneyRef[] {
  if (!Array.isArray(journey) || !journey.length) return [];
  const target = normalizeRoute(route);

  const exact: QaJourneyRef[] = [];
  const param: QaJourneyRef[] = [];

  for (const lane of journey) {
    if (!lane || !Array.isArray(lane.steps)) continue;
    for (const step of lane.steps) {
      if (!step || typeof step.path !== 'string') continue;
      const ref: QaJourneyRef = { laneId: lane.id, path: step.path };
      if (normalizeRoute(step.path).toLowerCase() === target.toLowerCase()) {
        exact.push(ref);
      } else if (matchesWithParams(step.path, target)) {
        param.push(ref);
      }
    }
  }

  return [...exact, ...param];
}
