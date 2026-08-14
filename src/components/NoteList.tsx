/**
 * NoteList / NoteItem — saved points with thumbnail, location chip, EDIT + delete.
 * Edit lets you fix the description and replace / remove the screenshot before export.
 *
 * v0.3 "Graphite":
 *  - `theme` removed from useQa() — every colour comes from the fixed design
 *    tokens / semantic utility classes in styles.ts, never from context.
 *  - Skeleton rows while `notesLoading && !notes.length` (IDB hasn't answered yet).
 *  - Severity chip (bug/question/polish, defaults 'bug') + a status pill that
 *    toggles open ⇄ verified on a single tap — no separate edit mode needed.
 *  - "Copy as agent prompt" — renders the note via noteToMarkdown() and writes
 *    it straight to the clipboard, so a single finding can be pasted into a
 *    terminal coding agent without exporting the whole session.
 *
 * Ported from NoteList.jsx:
 *  - lucide-react → Icon
 *  - THEME import removed → Graphite design tokens
 *  - Tailwind classes → qa-* equivalents
 */

import { useState, useRef, useEffect } from 'react';
import { useQa } from '../context/QaContext';
import type { QaNote, QaTarget } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import { noteToMarkdown } from '../lib/noteMarkdown';
import LocationReveal from './LocationReveal';
import ShotAnnotator from './ShotAnnotator';

type QaSeverity = 'bug' | 'question' | 'polish';
type QaStatus = 'open' | 'fixed' | 'verified';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// ---------------------------------------------------------------------------
// KindBadge
// ---------------------------------------------------------------------------

function KindBadge({
  target,
  t,
}: {
  target: QaTarget | undefined;
  t: (key: string) => string;
}) {
  if (!target) {
    return (
      <span className="qa-inline-flex qa-items-center qa-gap-1 qa-text-10 qa-text-lo">
        <Icon name="FileText" size={12} />
        {t('kind_note')}
      </span>
    );
  }
  const region = target.kind === 'region';
  return (
    <span
      className={`qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-1.5 qa-py-0.5 qa-text-10 qa-font-medium ${
        region ? 'qa-bg-accent-tint qa-text-accent' : 'qa-bg-3 qa-text-hi'
      }`}
    >
      <Icon name={region ? 'Square' : 'MousePointerClick'} size={10} />
      {region ? t('kind_region') : t('kind_element')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SeverityChip — display only (this list's chip doesn't cycle values; the
// severity is set at capture time in NoteEditor / CaptureMode).
// ---------------------------------------------------------------------------

const SEVERITY_CLASS: Record<QaSeverity, string> = {
  bug:      'qa-bg-danger-tint qa-text-danger',
  question: 'qa-bg-warn-tint qa-text-warn',
  polish:   'qa-bg-accent-tint qa-text-accent',
};

const SEVERITY_LABEL_KEY: Record<QaSeverity, string> = {
  bug: 'sev_bug',
  question: 'sev_question',
  polish: 'sev_polish',
};

function SeverityChip({ severity, t }: { severity: QaSeverity; t: (key: string) => string }) {
  return (
    <span
      className={`qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-1.5 qa-py-0.5 qa-text-10 qa-font-medium ${SEVERITY_CLASS[severity]}`}
    >
      {severity === 'bug' && <Icon name="Bug" size={10} />}
      {t(SEVERITY_LABEL_KEY[severity])}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusPill — tap toggles open ⇄ verified directly, no edit mode needed.
// ---------------------------------------------------------------------------

/**
 * Tapping cycles open → fixed → verified → open.
 *
 * `fixed` is the re-test queue: "someone says this is done, nobody has
 * checked". Keeping it on the same one-tap control (rather than a separate
 * menu) is deliberate — a tester marks a batch fixed in seconds when the
 * developer says so, then filters to Re-test on the next build and taps each
 * one through to verified as they confirm it.
 */
const STATUS_ORDER: QaStatus[] = ['open', 'fixed', 'verified'];

const STATUS_STYLE: Record<QaStatus, { cls: string; icon: 'Circle' | 'RotateCcw' | 'CheckCircle2'; key: string }> = {
  open:     { cls: 'qa-bg-3 qa-text-mid qa-hover-bg-2',        icon: 'Circle',       key: 'status_open' },
  fixed:    { cls: 'qa-bg-warn-tint qa-text-warn',             icon: 'RotateCcw',    key: 'status_fixed' },
  verified: { cls: 'qa-bg-success-tint qa-text-success',       icon: 'CheckCircle2', key: 'status_verified' },
};

function StatusPill({
  status,
  onCycle,
  t,
}: {
  status: QaStatus;
  onCycle: (next: QaStatus) => void;
  t: (key: string) => string;
}) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.open;
  const next = STATUS_ORDER[(STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length];
  return (
    <button
      type="button"
      onClick={() => onCycle(next)}
      aria-label={`${t(style.key)} — ${t(STATUS_STYLE[next].key)}`}
      title={t(STATUS_STYLE[next].key)}
      className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-1.5 qa-py-0.5 qa-text-10 qa-font-medium qa-transition ${style.cls}`}
      style={{ border: 'none', cursor: 'pointer' }}
    >
      <Icon name={style.icon} size={10} />
      {t(style.key)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// NoteItem
// ---------------------------------------------------------------------------

function NoteItem({ note, index }: { note: QaNote; index: number }) {
  const { deleteNote, updateNote, retestNote, notify, t } = useQa();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(note.description);
  const [img, setImg] = useState<Blob | null>(note.screenshot ?? null);
  // v0.5: a saved note's screenshot can be marked up too — plenty of "wait,
  // which button?" only surfaces when reviewing the list later.
  const [drawing, setDrawing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const thumbUrl = useObjectUrl(editing ? (img ?? undefined) : note.screenshot);
  const afterUrl = useObjectUrl(note.afterScreenshot);
  const [retesting, setRetesting] = useState(false);

  // UI defaults per contract §4 — undefined reads as 'bug' / 'open'.
  const severity: QaSeverity = note.severity ?? 'bug';
  const status: QaStatus = note.status ?? 'open';
  const contextEventCount = note.context?.events.length ?? 0;
  const stepCount = note.context?.steps?.length ?? 0;

  const startEdit = () => {
    setDesc(note.description);
    setImg(note.screenshot ?? null);
    setEditing(true);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f?.type.startsWith('image/')) setImg(f);
    e.target.value = '';
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const it = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    );
    if (it) {
      const b = it.getAsFile();
      if (b) { e.preventDefault(); setImg(b); }
    }
  };

  const save = () => {
    const patch: { description: string; screenshot?: Blob | null } = { description: desc };
    if (img !== (note.screenshot ?? null)) patch.screenshot = img; // null → remove
    updateNote(note.id, patch);
    setEditing(false);
  };

  const cycleStatus = (next: QaStatus) => {
    updateNote(note.id, { status: next });
  };

  const copyPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(noteToMarkdown(note));
      notify(t('copied'));
    } catch {
      notify(t('copy_failed'), { tone: 'error' });
    }
  };

  return (
    <li className="qa-rounded-xl qa-border qa-border-subtle qa-bg-1 qa-elev-1 qa-p-3 qa-text-sm qa-text-hi">
      {/* top row */}
      <div className="qa-mb-1 qa-flex qa-flex-wrap qa-items-center qa-gap-1.5">
        <span className="qa-flex qa-h-5 qa-w-5 qa-items-center qa-justify-center qa-rounded-full qa-text-11 qa-font-bold qa-bg-accent">
          {index}
        </span>
        <KindBadge target={note.target} t={t} />
        <SeverityChip severity={severity} t={t} />
        <StatusPill status={status} onCycle={cycleStatus} t={t} />
        <div className="qa-ms-auto qa-flex qa-items-center qa-gap-1.5">
          <button
            onClick={() => void copyPrompt()}
            className="qa-tap-icon qa-text-mid qa-hover-text-slate-600"
            title={t('copy_prompt')}
            aria-label={t('copy_prompt')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="Copy" size={14} />
          </button>
          {!editing && (
            <button
              onClick={startEdit}
              className="qa-tap-icon qa-text-mid qa-hover-text-slate-600"
              title={t('edit')}
              aria-label={t('edit')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Pencil" size={14} />
            </button>
          )}
          <button
            onClick={() => deleteNote(note.id)}
            className="qa-tap-icon qa-text-mid qa-hover-text-red"
            aria-label="delete"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="Trash2" size={16} />
          </button>
        </div>
      </div>

      {/* editing mode */}
      {editing ? (
        <div className="qa-space-y-2" onPaste={onPaste}>
          <textarea
            autoFocus
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-border-subtle qa-bg-2 qa-text-hi qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
          />
          <div className="qa-rounded-lg qa-border qa-border-dashed qa-border-subtle qa-p-2 qa-text-center qa-text-xs">
            {thumbUrl ? (
              <div className="qa-relative qa-inline-block">
                <button
                  type="button"
                  onClick={() => setDrawing(true)}
                  title={t('draw_label')}
                  aria-label={t('draw_label')}
                  className="qa-tap"
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
                >
                  <img
                    src={thumbUrl}
                    alt="screenshot"
                    style={{ maxHeight: '7rem', borderRadius: '0.25rem' }}
                  />
                </button>
                <button
                  onClick={() => setImg(null)}
                  className="qa-tap-icon qa-absolute qa-rounded-full qa-bg-danger-tint qa-text-danger"
                  title={t('remove_image')}
                  style={{
                    top: '-8px',
                    insetInlineEnd: '-8px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="X" size={12} />
                </button>
                {drawing && img && (
                  <ShotAnnotator
                    blob={img}
                    onCancel={() => setDrawing(false)}
                    onDone={(next) => { setDrawing(false); setImg(next); }}
                  />
                )}
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="qa-inline-flex qa-items-center qa-gap-1 qa-text-accent"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <Icon name="ImagePlus" size={16} />
                {t('image_hint')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="qa-hidden"
            />
          </div>
          <div className="qa-flex qa-gap-2">
            <button
              onClick={save}
              disabled={!desc.trim()}
              className="qa-tap qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-sm qa-font-semibold"
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Check" size={16} />
              {t('save')}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-text-sm qa-text-mid"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="qa-whitespace-pre-wrap qa-break-words qa-text-hi">
            {note.description}
          </p>
          <div className="qa-mt-1.5 qa-space-y-1.5 qa-text-11 qa-text-lo">
            <div className="qa-flex qa-items-center qa-gap-1">
              <Icon name="MapPin" size={12} className="qa-shrink-0" />
              <span className="qa-truncate qa-dir-ltr" title={note.url}>
                {note.route}
              </span>
            </div>
            {note.target && <LocationReveal target={note.target} />}
            {contextEventCount > 0 && (
              <div>{t('context_attached', { n: contextEventCount })}</div>
            )}
            {stepCount > 0 && (
              <div className="qa-flex qa-items-center qa-gap-1">
                <Icon name="ClipboardList" size={12} className="qa-shrink-0" />
                {t('steps_recorded', { n: stepCount })}
              </div>
            )}
          </div>
          {/* Re-test: re-shoot this exact target as it looks NOW, so "is it
              actually fixed?" is answered with evidence rather than memory.
              Offered only while the note is in the re-test queue. */}
          {status === 'fixed' && note.target && (
            <button
              type="button"
              disabled={retesting}
              onClick={() => {
                setRetesting(true);
                void retestNote(note.id).finally(() => setRetesting(false));
              }}
              className="qa-tap qa-mt-2 qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-border qa-border-subtle qa-bg-warn-tint qa-text-warn qa-px-2 qa-py-1 qa-text-11 qa-font-medium"
              style={{ cursor: retesting ? 'default' : 'pointer' }}
            >
              <Icon
                name={retesting ? 'Loader2' : 'RotateCcw'}
                size={12}
                className={retesting ? 'qa-animate-spin' : undefined}
              />
              {t('retest_now')}
            </button>
          )}

          {thumbUrl && !afterUrl && (
            <img
              src={thumbUrl}
              alt="screenshot"
              className="qa-mt-2 qa-w-full qa-rounded-lg qa-border qa-border-subtle"
            />
          )}

          {/* Before / after, stacked rather than side by side: at panel width
              two half-size screenshots are unreadable. */}
          {afterUrl && (
            <div className="qa-mt-2 qa-space-y-1">
              {thumbUrl && (
                <>
                  <span className="qa-text-10 qa-text-lo">{t('before_label')}</span>
                  <img
                    src={thumbUrl}
                    alt={t('before_label')}
                    className="qa-w-full qa-rounded-lg qa-border qa-border-subtle"
                  />
                </>
              )}
              <span className="qa-text-10 qa-text-success">{t('after_label')}</span>
              <img
                src={afterUrl}
                alt={t('after_label')}
                className="qa-w-full qa-rounded-lg qa-border"
                style={{ borderColor: 'var(--qa-success)' }}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// NoteList
// ---------------------------------------------------------------------------

export default function NoteList() {
  // Filtering itself lives in QaContext, so export and folder sync always see
  // the complete list no matter what the tester is looking at right now.
  const { notes, visibleNotes, setFilter, notesLoading, t } = useQa();

  // Loading skeleton — only while IDB hasn't answered yet AND there's nothing
  // to show already (an empty result and a slow load look identical to the
  // tester otherwise).
  if (notesLoading && !notes.length) {
    return (
      <ul className="qa-space-y-2" aria-hidden="true">
        <li className="qa-skeleton qa-rounded-xl" style={{ height: '4.5rem' }} />
        <li className="qa-skeleton qa-rounded-xl" style={{ height: '4.5rem' }} />
        <li className="qa-skeleton qa-rounded-xl" style={{ height: '4.5rem' }} />
      </ul>
    );
  }

  if (!notes.length) {
    return (
      <div className="qa-rounded-xl qa-border qa-border-dashed qa-border-subtle qa-py-8 qa-text-center qa-text-sm qa-text-lo">
        {t('no_points')}
        <br />
        {t('no_points_hint', { cta: t('capture_cta') })}
      </div>
    );
  }

  // Notes exist, but the active filter matches none of them. Distinct from
  // "no notes yet" — the way out is to clear the filter, not to capture more.
  if (!visibleNotes.length) {
    return (
      <div className="qa-rounded-xl qa-border qa-border-dashed qa-border-subtle qa-py-6 qa-text-center qa-text-sm qa-text-lo">
        {t('filter_none')}
        <br />
        <button
          type="button"
          onClick={() => setFilter({ severity: 'all', status: 'all', query: '', thisPageOnly: false })}
          className="qa-tap qa-mt-1 qa-text-xs qa-text-accent"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {t('filter_clear')}
        </button>
      </div>
    );
  }

  // Point numbers stay tied to capture order in the FULL list, so a note keeps
  // the same number whether or not a filter is on — the number is what the
  // export, the folder and any agent handoff refer to.
  const numberOf = (id: string) => notes.length - notes.findIndex((n) => n.id === id);

  return (
    <ul className="qa-space-y-2">
      {visibleNotes.map((n) => (
        <NoteItem key={n.id} note={n} index={numberOf(n.id)} />
      ))}
    </ul>
  );
}
