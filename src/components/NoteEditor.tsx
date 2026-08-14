/**
 * NoteEditor — two ways to add a point:
 *   1. "Capture from page" → on-page select (element/region) + auto-screenshot
 *      + inline note (the primary flow — see CaptureMode).
 *   2. A quick manual note (text + optional pasted / dragged / uploaded image).
 *
 * v0.3 "Graphite":
 *  - `theme` removed from useQa() — colours come from the fixed design tokens
 *    / semantic utility classes in styles.ts.
 *  - The capture CTA is a solid accent-coloured button (the old gradient is
 *    gone along with per-install theming).
 *  - The quick-note form gets a severity chip row (bug/question/polish,
 *    default 'bug'), passed through to addNote() on save.
 *
 * Ported from NoteEditor.jsx:
 *  - lucide-react → Icon
 *  - THEME import removed → Graphite design tokens
 *  - Tailwind classes → qa-* equivalents
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQa } from '../context/QaContext';
import { Icon, type IconName } from '../icons/Icon';

type QaSeverity = 'bug' | 'question' | 'polish';

// ---------------------------------------------------------------------------
// SeverityChipRow — single-select chip row for the quick-note form.
// ---------------------------------------------------------------------------

const SEVERITIES: Array<{ value: QaSeverity; labelKey: string; icon?: IconName }> = [
  { value: 'bug', labelKey: 'sev_bug', icon: 'Bug' },
  { value: 'question', labelKey: 'sev_question' },
  { value: 'polish', labelKey: 'sev_polish' },
];

function SeverityChipRow({
  value,
  onChange,
  t,
}: {
  value: QaSeverity;
  onChange: (v: QaSeverity) => void;
  t: (key: string) => string;
}) {
  return (
    <div>
      <div className="qa-mb-1 qa-text-11 qa-text-lo">{t('severity_label')}</div>
      <div className="qa-flex qa-flex-wrap qa-gap-1.5" role="radiogroup" aria-label={t('severity_label')}>
        {SEVERITIES.map((s) => {
          const active = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(s.value)}
              className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-2 qa-py-1 qa-text-11 qa-font-medium qa-transition ${
                active ? 'qa-bg-accent' : 'qa-bg-3 qa-text-mid qa-hover-bg-2'
              }`}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              {s.icon && <Icon name={s.icon} size={12} />}
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function NoteEditor() {
  const { addNote, startCapture, t } = useQa();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [severity, setSeverity] = useState<QaSeverity>('bug');
  const fileRef = useRef<HTMLInputElement>(null);

  // Always-current mirror of previewUrl, so the unmount cleanup below can
  // revoke whatever the LAST blob URL was rather than the one captured at
  // mount time (an empty deps array would otherwise freeze it at `null`).
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Revoke preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const setImage = useCallback((blob: Blob | null) => {
    if (!blob) return;
    setScreenshot(blob);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
  }, []);

  const clearImage = () => {
    setScreenshot(null);
    setPreviewUrl((o) => {
      if (o) URL.revokeObjectURL(o);
      return null;
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    );
    if (item) {
      const b = item.getAsFile();
      if (b) { e.preventDefault(); setImage(b); }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = Array.from(e.dataTransfer.files ?? []).find((x) =>
      x.type.startsWith('image/'),
    );
    if (f) setImage(f);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f?.type.startsWith('image/')) setImage(f);
    e.target.value = '';
  };

  const resetForm = () => {
    setOpen(false);
    clearImage();
    setDescription('');
    setSeverity('bug');
  };

  const save = async () => {
    if (!description.trim()) return;
    await addNote({ description, screenshot: screenshot ?? undefined, severity });
    setDescription('');
    clearImage();
    setSeverity('bug');
    setOpen(false);
  };

  return (
    <div className="qa-space-y-2">
      {/* Primary CTA — Capture from page (solid accent, no gradient) */}
      <button
        onClick={() => startCapture()}
        className="qa-tap qa-flex qa-w-full qa-items-center qa-justify-center qa-gap-2 qa-rounded-xl qa-bg-accent qa-px-4 qa-py-3 qa-text-sm qa-font-semibold qa-shadow-sm qa-transition qa-hover-brightness-105"
        style={{ border: 'none', cursor: 'pointer' }}
      >
        <Icon name="Crosshair" size={16} />
        {t('capture_cta')}
      </button>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="qa-tap qa-flex qa-w-full qa-items-center qa-justify-center qa-gap-1 qa-rounded-lg qa-border qa-border-dashed qa-border-subtle qa-py-1.5 qa-text-xs qa-text-accent"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          <Icon name="Plus" size={14} />
          {t('quick_note')}
        </button>
      ) : (
        <div
          onPaste={onPaste}
          className="qa-space-y-2 qa-rounded-xl qa-border qa-border-subtle qa-bg-2 qa-p-2.5"
        >
          <textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t('desc_placeholder')}
            className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-border-subtle qa-bg-1 qa-text-hi qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
          />

          <SeverityChipRow value={severity} onChange={setSeverity} t={t} />

          {/* Drop zone / image preview */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`qa-rounded-lg qa-border qa-border-dashed qa-px-2 qa-py-2 qa-text-center qa-text-xs ${
              dragOver ? 'qa-border-accent qa-bg-accent-tint' : 'qa-border-subtle qa-bg-1'
            }`}
          >
            {previewUrl ? (
              <div className="qa-relative qa-inline-block">
                <img src={previewUrl} alt="preview" style={{ maxHeight: '7rem', borderRadius: '0.25rem' }} />
                <button
                  onClick={clearImage}
                  className="qa-tap-icon qa-absolute qa-rounded-full qa-bg-danger-tint qa-text-danger"
                  style={{
                    top: '-8px',
                    insetInlineEnd: '-8px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="Trash2" size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-text-accent"
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

          {/* Action row */}
          <div className="qa-flex qa-gap-2">
            <button
              onClick={() => void save()}
              disabled={!description.trim()}
              className="qa-tap qa-flex-1 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-sm qa-font-semibold"
              style={{ border: 'none', cursor: 'pointer' }}
            >
              {t('add_point')}
            </button>
            <button
              onClick={resetForm}
              className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-text-sm qa-text-mid"
              style={{ background: 'transparent', cursor: 'pointer' }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
