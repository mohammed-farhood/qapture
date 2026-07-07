/**
 * NoteEditor — two ways to add a point:
 *   1. "Capture from page" → on-page select (element/region) + auto-screenshot
 *      + inline note (the primary flow — see CaptureMode).
 *   2. A quick manual note (text + optional pasted / dragged / uploaded image).
 *
 * Ported from NoteEditor.jsx:
 *  - lucide-react → Icon
 *  - THEME import removed → useQa().theme
 *  - Tailwind classes → qa-* equivalents
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

export default function NoteEditor() {
  const { addNote, startCapture, t, theme } = useQa();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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

  const save = async () => {
    if (!description.trim()) return;
    await addNote({ description, screenshot: screenshot ?? undefined });
    setDescription('');
    clearImage();
    setOpen(false);
  };

  return (
    <div className="qa-space-y-2">
      {/* Primary CTA — Capture from page */}
      <button
        onClick={startCapture}
        className="qa-flex qa-w-full qa-items-center qa-justify-center qa-gap-2 qa-rounded-xl qa-px-4 qa-py-3 qa-text-sm qa-font-semibold qa-text-white qa-shadow-sm qa-transition qa-hover-brightness-105"
        style={{
          backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <Icon name="Crosshair" size={16} />
        {t('capture_cta')}
      </button>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="qa-flex qa-w-full qa-items-center qa-justify-center qa-gap-1 qa-rounded-lg qa-border qa-border-dashed qa-py-1.5 qa-text-xs qa-tap"
          style={{
            borderColor: `${theme.primary}33`,
            color: theme.primary,
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Icon name="Plus" size={14} />
          {t('quick_note')}
        </button>
      ) : (
        <div
          onPaste={onPaste}
          className="qa-space-y-2 qa-rounded-xl qa-border qa-p-2.5"
          style={{ borderColor: `${theme.primary}1a`, background: theme.cream }}
        >
          <textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t('desc_placeholder')}
            className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
            style={{ borderColor: `${theme.primary}33`, background: '#fff', color: 'inherit' }}
          />

          {/* Drop zone / image preview */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="qa-rounded-lg qa-border qa-border-dashed qa-px-2 qa-py-2 qa-text-center qa-text-xs"
            style={{
              borderColor: dragOver ? theme.accent : `${theme.primary}33`,
              background: dragOver ? `${theme.accent}12` : '#fff',
            }}
          >
            {previewUrl ? (
              <div className="qa-relative qa-inline-block">
                <img src={previewUrl} alt="preview" style={{ maxHeight: '7rem', borderRadius: '0.25rem' }} />
                <button
                  onClick={clearImage}
                  className="qa-absolute qa-rounded-full qa-p-1 qa-text-white qa-tap-icon"
                  style={{
                    top: '-8px',
                    insetInlineEnd: '-8px',
                    background: theme.primary,
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
                className="qa-inline-flex qa-items-center qa-gap-1 qa-tap"
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

          {/* Action row */}
          <div className="qa-flex qa-gap-2">
            <button
              onClick={save}
              disabled={!description.trim()}
              className="qa-flex-1 qa-rounded-lg qa-px-3 qa-py-1.5 qa-text-sm qa-font-semibold qa-text-white qa-tap"
              style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
            >
              {t('add_point')}
            </button>
            <button
              onClick={() => { setOpen(false); clearImage(); setDescription(''); }}
              className="qa-rounded-lg qa-border qa-px-3 qa-text-sm qa-tap"
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
      )}
    </div>
  );
}
