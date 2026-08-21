/**
 * frameCalibration.ts — work out where this page sits inside a captured frame,
 * by MEASURING it rather than calculating it.
 *
 * WHY THIS EXISTS
 * ---------------
 * Chromium can hand us a capture of *this tab*: the frame is the viewport, so
 * mapping a viewport rect into it is one multiply. Safari and Firefox have no
 * tab capture at all — the best they can offer is a whole WINDOW or the whole
 * SCREEN. That frame does contain our page, but with the browser's toolbar
 * above it, possibly a desktop around it, at some unknown scale.
 *
 * The obvious way to locate the page inside that frame is arithmetic:
 * `outerHeight - innerHeight` for the toolbar, `screenX/screenY` for the
 * window, `devicePixelRatio` for Retina. Every one of those is a guess that
 * can be quietly wrong — a bookmarks bar, a scaled display, a second monitor,
 * a browser that rounds its numbers for fingerprinting. And "quietly wrong"
 * here means a screenshot that is confidently of the wrong pixels, which is
 * the worst thing a QA tool can produce: it looks fine, so nobody checks it,
 * and the bug report points at innocent code.
 *
 * So we don't guess. For one frame the page is covered with an opaque card
 * carrying four known colours at four known corners. We find those colours in
 * the captured frame and solve for scale and origin directly. Toolbar height,
 * pixel ratio, monitor layout and window position all cancel out, because none
 * of them were ever used.
 *
 * The opaque backdrop is not decoration: it guarantees the only saturated red
 * / green / blue / magenta in the frame is ours, so detection cannot be fooled
 * by a red button in the page behind it.
 *
 * Two markers (opposite corners) determine the mapping. The other two are
 * spent checking it — predicted position versus found position. A calibration
 * that doesn't agree with itself is REJECTED, and the caller falls back to
 * re-drawing the page. Refusing beats a confident lie.
 *
 * Everything here is pure: it takes pixels in and gives numbers out, so
 * scripts/frame-calibration-smoke.mjs can drive it with synthetic frames and
 * check the arithmetic without a browser, a screen or a permission prompt.
 */

/** Edge length of each corner marker, in CSS pixels. */
export const MARKER_SIZE = 28;

/**
 * Corner markers, in the order the solver expects.
 *
 * Fully-saturated primaries plus magenta: maximally far apart from each other
 * so the nearest-colour match can't confuse two of them even after the video
 * codec has had its way with the frame (screen-share streams are compressed,
 * and chroma subsampling smears small patches of colour).
 */
export const MARKERS = [
  { key: 'tl', color: [255, 0, 0] as const },
  { key: 'tr', color: [0, 255, 0] as const },
  { key: 'bl', color: [0, 0, 255] as const },
  { key: 'br', color: [255, 0, 255] as const },
] as const;

export type MarkerKey = (typeof MARKERS)[number]['key'];

/** Where each marker's CENTRE sits, in viewport CSS coordinates. */
export function markerCentres(vw: number, vh: number): Record<MarkerKey, { x: number; y: number }> {
  const h = MARKER_SIZE / 2;
  return {
    tl: { x: h, y: h },
    tr: { x: vw - h, y: h },
    bl: { x: h, y: vh - h },
    br: { x: vw - h, y: vh - h },
  };
}

/** The affine mapping from viewport CSS coordinates to frame pixels. */
export interface FrameMapping {
  scaleX: number;
  scaleY: number;
  /** Frame coordinates of viewport (0, 0). */
  originX: number;
  originY: number;
}

export interface MarkerHit {
  x: number;
  y: number;
  count: number;
}

/**
 * Squared distance in RGB. Cheap, and adequate because the four targets are
 * chosen to be far apart — we never need perceptual accuracy, only "which of
 * these four, if any".
 */
function dist2(r: number, g: number, b: number, c: readonly [number, number, number]): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * How close a pixel must be to a marker colour to count as that marker.
 *
 * Generous, because compression shifts saturated colours noticeably — but far
 * below the distance between any two of our targets (65025), so a pixel can
 * never be a plausible match for two markers at once.
 */
const COLOR_TOLERANCE_2 = 90 * 90;

/** Grid cell size, in frame pixels, used to group matching pixels into blobs. */
const CLUSTER_CELL = 8;

/** How many candidate blobs per colour we're willing to carry forward. */
const MAX_CANDIDATES = 4;

/**
 * Every distinct blob of each marker colour, biggest first.
 *
 * Returning CANDIDATES rather than one answer per colour is the whole trick.
 * A whole-screen share contains the rest of the desktop, and something else on
 * that desktop may well be saturated red — another window, a notification, a
 * wallpaper. Collapsing all red pixels into one position (a mean, or even a
 * median) lets that intruder drag the answer, and a dragged answer is exactly
 * the confident lie this module exists to prevent.
 *
 * So we hand every plausible blob to the solver and let VERIFICATION pick: the
 * real four are the only combination that forms a consistent rectangle.
 *
 * Blobs are found by bucketing matches into a coarse grid and joining touching
 * cells, which costs one pass over the frame and needs no recursion.
 */
export function findMarkerCandidates(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Record<MarkerKey, MarkerHit[]> {
  const cols = Math.ceil(width / CLUSTER_CELL);
  const rows = Math.ceil(height / CLUSTER_CELL);
  const cells: Record<string, Int32Array> = {};
  for (const m of MARKERS) cells[m.key] = new Int32Array(cols * rows);

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    const cy = (y / CLUSTER_CELL) | 0;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      if (data[i + 3] < 128) continue; // transparent — not part of the frame
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // A marker is saturated; skip the backdrop and anything near-grey fast.
      if (Math.max(r, g, b) - Math.min(r, g, b) < 60) continue;
      for (const m of MARKERS) {
        if (dist2(r, g, b, m.color) <= COLOR_TOLERANCE_2) {
          cells[m.key][cy * cols + ((x / CLUSTER_CELL) | 0)]++;
          break;
        }
      }
    }
  }

  const out = {} as Record<MarkerKey, MarkerHit[]>;
  for (const m of MARKERS) {
    const grid = cells[m.key];
    const seen = new Uint8Array(cols * rows);
    const blobs: MarkerHit[] = [];
    for (let start = 0; start < grid.length; start++) {
      if (!grid[start] || seen[start]) continue;
      // Flood the touching non-empty cells (8-neighbour), iteratively.
      const queue = [start];
      seen[start] = 1;
      let sumX = 0;
      let sumY = 0;
      let total = 0;
      while (queue.length) {
        const idx = queue.pop() as number;
        const n = grid[idx];
        const cx = idx % cols;
        const cy = (idx / cols) | 0;
        sumX += (cx * CLUSTER_CELL + CLUSTER_CELL / 2) * n;
        sumY += (cy * CLUSTER_CELL + CLUSTER_CELL / 2) * n;
        total += n;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const nIdx = ny * cols + nx;
            if (seen[nIdx] || !grid[nIdx]) continue;
            seen[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
      if (total < 16) continue; // too few pixels to be a marker
      blobs.push({ x: sumX / total, y: sumY / total, count: total });
    }
    blobs.sort((a, b) => b.count - a.count);
    out[m.key] = blobs.slice(0, MAX_CANDIDATES);
  }
  return out;
}

/** How far a check marker may sit from its predicted spot, as a fraction of the frame. */
const VERIFY_TOLERANCE = 0.02;

/** Widest disagreement allowed between the horizontal and vertical scales. */
const SQUARENESS_TOLERANCE = 0.05;

/**
 * Solve for the mapping from two opposite corners, then spend the other two
 * proving it. Returns null — meaning "fall back, don't guess" — whenever the
 * numbers don't hold together.
 */
export function deriveMapping(
  candidates: Record<MarkerKey, MarkerHit[]>,
  vw: number,
  vh: number,
  frameW: number,
  frameH: number,
): FrameMapping | null {
  const tls = candidates.tl ?? [];
  const brs = candidates.br ?? [];
  // Try every plausible pairing of the two solving corners and keep the first
  // that the OTHER two corners agree with. Candidate lists are capped at four
  // apiece, so this is at most sixteen cheap attempts.
  for (const tl of tls) {
    for (const br of brs) {
      const m = solveFrom(tl, br, candidates, vw, vh, frameW, frameH);
      if (m) return m;
    }
  }
  return null;
}

function solveFrom(
  tl: MarkerHit,
  br: MarkerHit,
  candidates: Record<MarkerKey, MarkerHit[]>,
  vw: number,
  vh: number,
  frameW: number,
  frameH: number,
): FrameMapping | null {
  if (!(vw > MARKER_SIZE) || !(vh > MARKER_SIZE)) return null;

  const centres = markerCentres(vw, vh);
  const spanCssX = centres.br.x - centres.tl.x;
  const spanCssY = centres.br.y - centres.tl.y;
  if (spanCssX <= 0 || spanCssY <= 0) return null;

  const scaleX = (br.x - tl.x) / spanCssX;
  const scaleY = (br.y - tl.y) / spanCssY;
  if (!(scaleX > 0.05) || !(scaleY > 0.05)) return null;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return null;

  // Screen pixels are square. If our two scales disagree we have mis-detected
  // something, not discovered an anamorphic display.
  if (Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > SQUARENESS_TOLERANCE) return null;

  const originX = tl.x - centres.tl.x * scaleX;
  const originY = tl.y - centres.tl.y * scaleY;
  const mapping: FrameMapping = { scaleX, scaleY, originX, originY };

  // The whole viewport has to land inside the frame we were given.
  const farX = originX + vw * scaleX;
  const farY = originY + vh * scaleY;
  const slack = Math.max(4, frameW * 0.01);
  if (originX < -slack || originY < -slack || farX > frameW + slack || farY > frameH + slack) {
    return null;
  }

  // Independent check: the two corners we did NOT solve with must land where
  // this mapping says they should. Any one candidate of that colour landing on
  // the predicted spot is enough — the others are the decoys we are trying to
  // reject, and demanding that ALL of them agree would reject the real answer
  // whenever the desktop happens to contain a second green thing.
  //
  // At least one of the two must be present and agree, or nothing has actually
  // been verified and we are back to trusting arithmetic.
  const tolerance = Math.max(6, Math.max(frameW, frameH) * VERIFY_TOLERANCE);
  let verified = 0;
  for (const key of ['tr', 'bl'] as const) {
    const hits = candidates[key] ?? [];
    if (!hits.length) continue; // that colour is absent — no evidence either way
    const want = centres[key];
    const px = originX + want.x * scaleX;
    const py = originY + want.y * scaleY;
    // Present but nowhere near where it should be means this pairing is wrong,
    // full stop: we can see that colour, and it is not where the mapping says.
    if (!hits.some((h) => Math.hypot(px - h.x, py - h.y) <= tolerance)) return null;
    verified++;
  }
  if (verified === 0) return null;

  return mapping;
}

/** Frame-pixel source rect for a viewport-coordinate rect, clamped to the frame. */
export function mapRectToFrame(
  rect: { left: number; top: number; width: number; height: number },
  m: FrameMapping,
  frameW: number,
  frameH: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  const x0 = m.originX + rect.left * m.scaleX;
  const y0 = m.originY + rect.top * m.scaleY;
  const sx = Math.max(0, Math.min(frameW, Math.round(x0)));
  const sy = Math.max(0, Math.min(frameH, Math.round(y0)));
  const sw = Math.min(frameW - sx, Math.round(rect.width * m.scaleX));
  const sh = Math.min(frameH - sy, Math.round(rect.height * m.scaleY));
  if (sw < 1 || sh < 1) return null;
  return { sx, sy, sw, sh };
}

/**
 * A cheap fingerprint of everything that would invalidate a calibration:
 * the window moved, was resized, changed zoom, or hopped to another display.
 * Compared as a string, so a change of any kind forces a re-measure.
 */
export function environmentSignature(): string {
  if (typeof window === 'undefined') return '';
  return [
    window.innerWidth, window.innerHeight,
    window.outerWidth, window.outerHeight,
    window.screenX, window.screenY,
    Math.round((window.devicePixelRatio || 1) * 100),
  ].join('x');
}
