/**
 * NoteList / NoteItem — saved points with thumbnail, location chip, EDIT + delete.
 * Edit lets you fix the description and replace / remove the screenshot before export.
 *
 * Ported from NoteList.jsx:
 *  - lucide-react → Icon
 *  - THEME import removed → useQa().theme
 *  - Tailwind classes → qa-* equivalents
 */

import { useState, useRef, useEffect } from 'react';
import { useQa } from '../context/QaContext';
import type { QaNote, QaTarget } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import LocationReveal from './LocationReveal';

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
  theme,
}: {
  target: QaTarget | undefined;
  t: (key: string) => string;
  theme: { primary: string; accentDark: string };
}) {
  if (!target) {
    return (
      <span className="qa-inline-flex qa-items-center qa-gap-1 qa-text-10 qa-text-slate-400">
        <Icon name="FileText" size={12} />
        {t('kind_note')}
      </span>
    );
  }
  const region = target.kind === 'region';
  return (
    <span
      className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-1.5 qa-py-0.5 qa-text-10 qa-font-medium qa-text-white"
      style={{ background: region ? theme.accentDark : theme.primary }}
    >
      <Icon name={region ? 'Square' : 'MousePointerClick'} size={10} />
      {region ? t('kind_region') : t('kind_element')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NoteItem
// ---------------------------------------------------------------------------

function NoteItem({ note, index }: { note: QaNote; index: number }) {
  const { deleteNote, updateNote, t, theme } = useQa();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(note.description);
  const [img, setImg] = useState<Blob | null>(note.screenshot ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const thumbUrl = useObjectUrl(editing ? (img ?? undefined) : note.screenshot);

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

  return (
    <li
      className="qa-rounded-xl qa-border qa-bg-white qa-p-3 qa-text-sm qa-shadow-sm"
      style={{ borderColor: `${theme.primary}14` }}
    >
      {/* top row */}
      <div className="qa-mb-1 qa-flex qa-items-center qa-gap-2">
        <span
          className="qa-flex qa-h-5 qa-w-5 qa-items-center qa-justify-center qa-rounded-full qa-text-11 qa-font-bold qa-text-white"
          style={{ background: theme.accent }}
        >
          {index}
        </span>
        <KindBadge target={note.target} t={t} theme={theme} />
        <div className="qa-ms-auto qa-flex qa-items-center qa-gap-1.5">
          {!editing && (
            <button
              onClick={startEdit}
              className="qa-text-slate-300 qa-hover-text-slate-600"
              title={t('edit')}
              aria-label={t('edit')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Icon name="Pencil" size={14} />
            </button>
          )}
          <button
            onClick={() => deleteNote(note.id)}
            className="qa-text-slate-300 qa-hover-text-red"
            aria-label="delete"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
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
            className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
            style={{ borderColor: `${theme.primary}33`, background: '#fff', color: 'inherit' }}
          />
          <div
            className="qa-rounded-lg qa-border qa-border-dashed qa-p-2 qa-text-center qa-text-xs"
            style={{ borderColor: `${theme.primary}33` }}
          >
            {thumbUrl ? (
              <div className="qa-relative qa-inline-block">
                <img
                  src={thumbUrl}
                  alt="screenshot"
                  style={{ maxHeight: '7rem', borderRadius: '0.25rem' }}
                />
                <button
                  onClick={() => setImg(null)}
                  className="qa-absolute qa-rounded-full qa-p-1 qa-text-white"
                  title={t('remove_image')}
                  style={{
                    top: '-8px',
                    insetInlineEnd: '-8px',
                    background: theme.primary,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="X" size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="qa-inline-flex qa-items-center qa-gap-1"
                style={{ color: theme.primary, background: 'transparent', border: 'none', cursor: 'pointer' }}
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
              className="qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1 qa-rounded-lg qa-px-3 qa-py-1.5 qa-text-sm qa-font-semibold qa-text-white"
              style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Check" size={16} />
              {t('save')}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="qa-rounded-lg qa-border qa-px-3 qa-text-sm"
              style={{
                borderColor: `${theme.primary}33`,
                color: theme.primary,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p
            className="qa-whitespace-pre-wrap qa-break-words"
            style={{ color: theme.ink }}
          >
            {note.description}
          </p>
          <div className="qa-mt-1.5 qa-space-y-1.5 qa-text-11 qa-text-slate-500">
            <div className="qa-flex qa-items-center qa-gap-1">
              <Icon name="MapPin" size={12} className="qa-shrink-0" />
              <span className="qa-truncate qa-dir-ltr" title={note.url}>
                {note.route}
              </span>
            </div>
            {note.target && <LocationReveal target={note.target} />}
          </div>
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt="screenshot"
              className="qa-mt-2 qa-w-full qa-rounded-lg qa-border"
              style={{ borderColor: `${theme.primary}1a` }}
            />
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
  const { notes, t, theme } = useQa();

  if (!notes.length) {
    return (
      <div
        className="qa-rounded-xl qa-border qa-border-dashed qa-py-8 qa-text-center qa-text-sm qa-text-slate-400"
        style={{ borderColor: `${theme.primary}22` }}
      >
        {t('no_points')}
        <br />
        {t('no_points_hint', { cta: t('capture_cta') })}
      </div>
    );
  }

  return (
    <ul className="qa-space-y-2">
      {notes.map((n, i) => (
        <NoteItem key={n.id} note={n} index={notes.length - i} />
      ))}
    </ul>
  );
}
