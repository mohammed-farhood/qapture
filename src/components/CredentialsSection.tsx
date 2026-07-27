/**
 * CredentialsSection — test logins as brand cards. Click a value to copy; tick
 * "used" to track which roles you've exercised (persisted, keyed by role).
 *
 * Ported from CredentialsSection.jsx:
 *  - lucide-react → Icon
 *  - CREDENTIALS, LOGIN_FIELD, THEME imports removed → useQa() values
 *  - pick() from strings replaced by useQa().pick
 *  - navigator.clipboard guarded
 *
 * v0.3 "Graphite":
 *  - `theme` removed from useQa() — every colour below reads a fixed token
 *    (CSS custom property) or semantic utility class instead.
 *  - Clipboard copy now always gives feedback: notify(t('copied')) on
 *    success, notify(t('copy_failed')) when the Clipboard API is unavailable
 *    or the write throws (previously both were silent no-ops).
 */

import { useState } from 'react';
import { useQa } from '../context/QaContext';
import type { QaContextValue } from '../context/QaContext';
import { Icon } from '../icons/Icon';

// ---------------------------------------------------------------------------
// EyeIcon — local show/hide glyph (qapture's Icon set has no Eye/EyeOff; kept
// inline here rather than extending the shared icon union for this one use).
// ---------------------------------------------------------------------------

function EyeIcon({ open, size = 12, className }: { open: boolean; size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CopyField
// ---------------------------------------------------------------------------

const MASK = '••••••••';

function CopyField({
  value,
  maskable = false,
  notify,
  t,
}: {
  value: string;
  maskable?: boolean;
  /** Passed down from useQa() by CredentialsSection so a copy attempt can toast. */
  notify: QaContextValue['notify'];
  t: QaContextValue['t'];
}) {
  const [done, setDone] = useState(false);
  // Default stays "shown" — matches the pre-existing plaintext behavior, with
  // an added ability to toggle it off (Bug #27). Not a behavior change.
  const [revealed, setRevealed] = useState(true);

  const copy = async () => {
    if (value === '—') return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      // No Clipboard API available (older browser / insecure context) — this
      // used to be a silent no-op. Give the tester an explicit signal instead.
      notify(t('copy_failed'), { tone: 'error', id: 'credentials-copy-failed' });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1100);
      notify(t('copied'), { tone: 'success', id: 'credentials-copy' });
    } catch {
      notify(t('copy_failed'), { tone: 'error', id: 'credentials-copy-failed' });
    }
  };

  const hidden = maskable && !revealed && value !== '—';
  const displayValue = hidden ? MASK : value;

  return (
    <span className="qa-inline-flex qa-items-center qa-gap-1">
      <button
        onClick={() => void copy()}
        disabled={value === '—'}
        dir="ltr"
        className="qa-group qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-md qa-px-1.5 qa-py-0.5 qa-font-mono qa-text-xs qa-hover-bg-black-5"
        style={{ background: 'transparent', border: 'none', cursor: value === '—' ? 'default' : 'pointer' }}
      >
        <span className="qa-text-hi">{displayValue}</span>
        {value !== '—' && (
          done
            ? <Icon name="Check" size={12} className="qa-text-success" />
            : <Icon name="Copy" size={12} className="qa-opacity-40 qa-group-hover-opacity-80" />
        )}
      </button>
      {maskable && value !== '—' && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          title={revealed ? 'Hide password' : 'Show password'}
          className="qa-inline-flex qa-items-center qa-rounded-md qa-p-0.5 qa-opacity-40 qa-hover-opacity-80"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <EyeIcon open={revealed} size={12} />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CredentialsSection
// ---------------------------------------------------------------------------

export default function CredentialsSection() {
  const { loginsUsed, toggleLogin, t, lang, pick, loginField, credentials, notify } = useQa();

  const usedCount = credentials.filter((c) => loginsUsed.has(c.role)).length;
  const field = pick(loginField);

  return (
    <div className="qa-space-y-2.5">
      {/* header */}
      <div className="qa-flex qa-items-center qa-justify-between qa-gap-2 qa-text-xs">
        <span className="qa-text-slate-500">{t('login_with', { field })}</span>
        <span
          className="qa-shrink-0 qa-rounded-full qa-px-2 qa-py-0.5 qa-font-medium"
          style={{ background: 'var(--qa-success)', color: 'var(--qa-on-accent)' }}
        >
          {t('used_count', { n: usedCount, m: credentials.length })}
        </span>
      </div>

      {/* credential cards */}
      {credentials.map((c, i) => {
        const used = loginsUsed.has(c.role);
        const label = lang === 'ar' && c.roleAr ? c.roleAr : c.role;

        return (
          <div
            key={`${c.role}-${i}`}
            className={`qa-rounded-xl qa-border qa-p-2.5 qa-elev-1 qa-transition ${used ? 'qa-bg-success-tint' : 'qa-bg-1'}`}
            style={{ borderColor: used ? 'var(--qa-success)' : 'var(--qa-border-subtle)' }}
          >
            <div className="qa-flex qa-items-center qa-gap-2">
              <Icon name="CircleUser" size={16} className="qa-shrink-0 qa-text-accent" />
              <span className="qa-text-sm qa-font-semibold qa-text-hi">
                {label}
              </span>
              {c.hint && (
                <span className="qa-text-10 qa-text-slate-400">
                  {pick(c.hint)}
                </span>
              )}
              <button
                onClick={() => toggleLogin(c.role)}
                disabled={!c.seeded}
                className={`qa-ms-auto qa-inline-flex qa-items-center qa-gap-1 qa-text-xs ${used ? 'qa-text-success' : 'qa-text-lo'}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: c.seeded ? 'pointer' : 'default',
                }}
              >
                <Icon name={used ? 'CheckCircle2' : 'Circle'} size={16} />
                {t('used')}
              </button>
            </div>

            {c.seeded && (
              <div className="qa-mt-1.5 qa-flex qa-flex-wrap qa-items-center qa-gap-x-3 qa-gap-y-1 qa-ps-6">
                <CopyField value={c.login} notify={notify} t={t} />
                <span className="qa-text-slate-300">·</span>
                <CopyField value={c.password} notify={notify} t={t} maskable />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
