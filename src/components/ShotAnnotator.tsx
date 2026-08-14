/**
 * ShotAnnotator — draw on a captured screenshot.
 *
 * "This bit, right here" is the hardest thing to say in words and the easiest
 * thing to draw. A tester who can circle the broken control saves the person
 * reading the note a paragraph of description and a guess.
 *
 * DESIGN NOTES
 *  - It NEVER interrupts. Capture stays exactly as fast as it was: shoot,
 *    type, save. Drawing is something the tester opts into by tapping the
 *    screenshot they already have in front of them.
 *  - Marks are burned into the image on save, so they survive everywhere the
 *    screenshot goes — the note, the folder, the ZIP, an agent's context —
 *    with no viewer needed and no second file to keep in sync.
 *  - Cancel returns the original blob untouched.
 *  - Everything is pointer events, so it works with a mouse, a finger and a
 *    stylus without three code paths.
 *
 * The editor works in the image's OWN pixel space (a canvas sized to the
 * screenshot), and scales pointer coordinates into it. That keeps strokes
 * crisp on a retina capture and correct no matter how the preview is sized.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQa } from '../context/QaContext';
import { Icon, type IconName } from '../icons/Icon';
import { encodeShot } from '../lib/capture';

type Tool = 'pen' | 'arrow' | 'box';

type Point = { x: number; y: number };
type Mark =
  | { tool: 'pen'; points: Point[]; color: string; width: number }
  | { tool: 'arrow'; from: Point; to: Point; color: string; width: number }
  | { tool: 'box'; from: Point; to: Point; color: string; width: number };

const TOOLS: { tool: Tool; icon: IconName; labelKey: string }[] = [
  { tool: 'pen',   icon: 'Pencil',    labelKey: 'draw_pen' },
  { tool: 'arrow', icon: 'ArrowUpRight', labelKey: 'draw_arrow' },
  { tool: 'box',   icon: 'Square',    labelKey: 'draw_box' },
];

/**
 * Above the annotation card (z 10096), which is a sibling rendered later in
 * the same stacking context. Without this the card wins on DOM order and
 * silently swallows the drags meant for the canvas — the editor opens and
 * looks right, and nothing you draw appears.
 */
const ANNOTATOR_Z = 10098;

/** Marker colours. Red first: it is what everyone reaches for. */
const COLORS = ['#FF3B30', '#FFCC00', '#34C759', '#0A84FF'];

/**
 * Stroke width relative to the image, so a mark reads the same on a small
 * element crop and a full-viewport capture.
 */
function strokeWidthFor(canvas: { width: number; height: number }): number {
  return Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 160));
}

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark): void {
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = mark.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (mark.tool === 'pen') {
    if (mark.points.length < 2) {
      // A tap with the pen still deserves a visible dot.
      const p = mark.points[0];
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, mark.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(mark.points[0].x, mark.points[0].y);
    for (let i = 1; i < mark.points.length; i++) ctx.lineTo(mark.points[i].x, mark.points[i].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (mark.tool === 'box') {
    ctx.strokeRect(
      Math.min(mark.from.x, mark.to.x),
      Math.min(mark.from.y, mark.to.y),
      Math.abs(mark.to.x - mark.from.x),
      Math.abs(mark.to.y - mark.from.y),
    );
    ctx.restore();
    return;
  }

  // Arrow: shaft plus a filled head, sized off the stroke width so it stays
  // in proportion on any image.
  const { from, to } = mark;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(mark.width * 4, 10);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default function ShotAnnotator({
  blob,
  onDone,
  onCancel,
}: {
  blob: Blob;
  /** Called with the flattened image. */
  onDone: (next: Blob) => void;
  onCancel: () => void;
}) {
  const { t, dir } = useQa();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | CanvasImageSource | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const drawingRef = useRef<Mark | null>(null);
  const pointerRef = useRef<number | null>(null);

  // ── Load the screenshot into an image we can repaint from ───────────────
  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      if (!alive) { URL.revokeObjectURL(url); return; }
      imageRef.current = img;
      sizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
      setReady(true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); onCancel(); };
    img.src = url;
    return () => { alive = false; };
  }, [blob, onCancel]);

  // ── Repaint: the screenshot, then every mark, then the one in progress ──
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const { width, height } = sizeRef.current;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    for (const mark of marks) drawMark(ctx, mark);
    if (drawingRef.current) drawMark(ctx, drawingRef.current);
  }, [marks]);

  useEffect(() => { if (ready) repaint(); }, [ready, repaint]);

  // ── Pointer → image coordinates ─────────────────────────────────────────
  const pointFrom = useCallback((e: React.PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // The canvas is displayed scaled-to-fit; map back into image pixels.
    const scaleX = sizeRef.current.width / (rect.width || 1);
    const scaleY = sizeRef.current.height / (rect.height || 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready || pointerRef.current !== null) return;
    e.preventDefault();
    e.stopPropagation();
    pointerRef.current = e.pointerId;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = pointFrom(e);
    const width = strokeWidthFor(sizeRef.current);
    drawingRef.current =
      tool === 'pen'
        ? { tool: 'pen', points: [p], color, width }
        : { tool, from: p, to: p, color, width };
    repaint();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerRef.current !== e.pointerId || !drawingRef.current) return;
    e.preventDefault();
    const p = pointFrom(e);
    const current = drawingRef.current;
    if (current.tool === 'pen') current.points.push(p);
    else current.to = p;
    repaint();
  };

  const endStroke = (e: React.PointerEvent) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    const current = drawingRef.current;
    drawingRef.current = null;
    if (!current) return;
    // Discard a stray click that produced no shape (except the pen, where a
    // dot is a legitimate mark).
    if (current.tool !== 'pen') {
      const dx = Math.abs(current.to.x - current.from.x);
      const dy = Math.abs(current.to.y - current.from.y);
      if (dx < 4 && dy < 4) { repaint(); return; }
    }
    setMarks((prev) => [...prev, current]);
  };

  const undo = () => setMarks((prev) => prev.slice(0, -1));
  const clear = () => setMarks([]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) { onCancel(); return; }
    setSaving(true);
    try {
      // Repaint without any in-progress stroke, then flatten through the same
      // encoder the capture path uses, so an annotated shot obeys the same
      // size/format budget as every other screenshot.
      const next = await encodeShot(canvas);
      if (next) onDone(next); else onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-qa-overlay="true"
      dir={dir}
      className="qa-fixed qa-inset-0 qa-flex qa-flex-col qa-items-center qa-justify-center qa-p-4"
      style={{ background: 'var(--qa-scrim-dialog)', zIndex: ANNOTATOR_Z }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="qa-flex qa-flex-col qa-gap-2 qa-rounded-xl qa-border qa-border-subtle qa-p-2 qa-elev-3"
        style={{ background: 'var(--qa-surface-1)', maxWidth: '92vw', maxHeight: '90vh' }}
      >
        {/* toolbar */}
        <div className="qa-flex qa-items-center qa-flex-wrap qa-gap-2">
          {TOOLS.map(({ tool: key, icon, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTool(key)}
              aria-pressed={tool === key}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              className={`qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-transition ${
                tool === key ? 'qa-bg-accent' : 'qa-bg-2 qa-text-mid'
              }`}
              style={{ cursor: 'pointer' }}
            >
              <Icon name={icon} size={15} />
            </button>
          ))}

          <span className="qa-w-px qa-h-4 qa-bg-3" aria-hidden="true" />

          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={c}
              className="qa-tap-icon qa-rounded-full qa-transition"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <span
                className="qa-block qa-rounded-full"
                style={{
                  width: 16,
                  height: 16,
                  background: c,
                  outline: color === c ? '2px solid var(--qa-ink-hi)' : '1px solid var(--qa-border-subtle)',
                  outlineOffset: 2,
                }}
              />
            </button>
          ))}

          <span className="qa-w-px qa-h-4 qa-bg-3" aria-hidden="true" />

          <button
            type="button"
            onClick={undo}
            disabled={!marks.length}
            title={t('draw_undo')}
            aria-label={t('draw_undo')}
            className="qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-bg-2 qa-text-mid"
            style={{ cursor: marks.length ? 'pointer' : 'default', opacity: marks.length ? 1 : 0.4 }}
          >
            <Icon name="RotateCcw" size={15} />
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={!marks.length}
            className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-bg-2 qa-px-2 qa-py-1 qa-text-10 qa-text-mid"
            style={{ cursor: marks.length ? 'pointer' : 'default', opacity: marks.length ? 1 : 0.4 }}
          >
            {t('draw_clear')}
          </button>
        </div>

        {/* canvas */}
        <div
          className="qa-flex qa-items-center qa-justify-center qa-rounded-lg qa-overflow-hidden"
          style={{ background: 'var(--qa-surface-0)' }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            style={{
              maxWidth: '86vw',
              maxHeight: '64vh',
              touchAction: 'none',
              cursor: 'crosshair',
              display: 'block',
            }}
          />
        </div>

        {/* footer */}
        <div className="qa-flex qa-items-center qa-gap-2">
          <span className="qa-text-10 qa-text-lo">{t('draw_hint')}</span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="qa-tap qa-ms-auto qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <Icon name={saving ? 'Loader2' : 'Check'} size={14} className={saving ? 'qa-animate-spin' : undefined} />
            {t('done')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-py-1.5 qa-text-xs qa-text-mid"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
