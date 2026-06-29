/**
 * CredentialsSection — test logins as brand cards. Click a value to copy; tick
 * "used" to track which roles you've exercised (persisted, keyed by role).
 *
 * Ported from CredentialsSection.jsx:
 *  - lucide-react → Icon
 *  - CREDENTIALS, LOGIN_FIELD, THEME imports removed → useQa() values
 *  - pick() from strings replaced by useQa().pick
 *  - navigator.clipboard guarded
 */

import { useState } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

// ---------------------------------------------------------------------------
// CopyField
// ---------------------------------------------------------------------------

function CopyField({ value, ink }: { value: string; ink: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    if (value === '—') return;
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1100);
    } catch {
      // clipboard write failed — silently ignore
    }
  };

  return (
    <button
      onClick={copy}
      disabled={value === '—'}
      dir="ltr"
      className="qa-group qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-md qa-px-1.5 qa-py-0.5 qa-font-mono qa-text-xs qa-hover-bg-black-5"
      style={{ background: 'transparent', border: 'none', cursor: value === '—' ? 'default' : 'pointer' }}
    >
      <span style={{ color: ink }}>{value}</span>
      {value !== '—' && (
        done
          ? <Icon name="Check" size={12} className="qa-text-green-600" />
          : <Icon name="Copy" size={12} className="qa-opacity-40 qa-group-hover-opacity-80" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CredentialsSection
// ---------------------------------------------------------------------------

export default function CredentialsSection() {
  const { loginsUsed, toggleLogin, t, lang, pick, loginField, credentials, theme } = useQa();

  const usedCount = credentials.filter((c) => loginsUsed.has(c.role)).length;
  const field = pick(loginField);

  return (
    <div className="qa-space-y-2.5">
      {/* header */}
      <div className="qa-flex qa-items-center qa-justify-between qa-gap-2 qa-text-xs">
        <span className="qa-text-slate-500">{t('login_with', { field })}</span>
        <span
          className="qa-shrink-0 qa-rounded-full qa-px-2 qa-py-0.5 qa-font-medium qa-text-white"
          style={{ background: theme.sage }}
        >
          {t('used_count', { n: usedCount, m: credentials.length })}
        </span>
      </div>

      {/* credential cards */}
      {credentials.map((c) => {
        const used = loginsUsed.has(c.role);
        const label = lang === 'ar' && c.roleAr ? c.roleAr : c.role;

        return (
          <div
            key={c.role}
            className="qa-rounded-xl qa-border qa-p-2.5 qa-shadow-sm qa-transition"
            style={{
              borderColor: used ? theme.sage : `${theme.primary}14`,
              background: used ? `${theme.sage}12` : '#fff',
            }}
          >
            <div className="qa-flex qa-items-center qa-gap-2">
              <Icon name="CircleUser" size={16} className="qa-shrink-0" style={{ color: theme.primary }} />
              <span className="qa-text-sm qa-font-semibold" style={{ color: theme.ink }}>
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
                className="qa-ms-auto qa-inline-flex qa-items-center qa-gap-1 qa-text-xs"
                style={{
                  color: used ? theme.sage : '#94a3b8',
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
                <CopyField value={c.login} ink={theme.ink} />
                <span className="qa-text-slate-300">·</span>
                <CopyField value={c.password} ink={theme.ink} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
