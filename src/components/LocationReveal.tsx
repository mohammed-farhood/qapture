/**
 * LocationReveal — a confirmation that a place was captured, with the exact
 * technical location HIDDEN by default behind a toggle (for devs who need to
 * know precisely what was picked) + a "Locate on page" flash.
 *
 * Ported from LocationReveal.jsx:
 *  - lucide-react → Icon
 *  - THEME import removed → useQa().theme
 *  - flashLocate imported from ../lib/highlight
 *
 * v0.3 "Graphite": `theme` removed from useQa() — every colour below reads a
 * fixed token (CSS custom property) or semantic utility class instead. No new
 * behavior otherwise; flashLocate(target) drops its (now-removed) colors
 * argument per contract §3 — highlight.ts paints with fixed Graphite
 * constants on its own.
 */

import { useState } from 'react';
import { useQa } from '../context/QaContext';
import type { QaTarget } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import { flashLocate } from '../lib/highlight';

/**
 * v0.7.9: `route` is where the note was FILED.
 *
 * Without it "Locate on page" ran the stored selector against whatever page
 * the tester happened to be on. A selector like `button.btn-primary` exists on
 * half the pages of an app, so the flash landed on a real element that was
 * simply the wrong one — reported as "it just selects something on the same
 * page, even though the note says Settings". Silently pointing at the wrong
 * thing is worse than pointing at nothing, so when the note belongs to another
 * page the control stops hunting and offers to go there instead.
 *
 * Omitted by CaptureMode, which shows this for a selection made a second ago:
 * there is no other page to be on.
 */
export default function LocationReveal({
  target,
  route,
}: {
  target?: QaTarget | null;
  route?: string;
}) {
  const { t, walkNavigate } = useQa();
  const [open, setOpen] = useState(false);

  if (!target) return null;

  const r = target.rect;
  const notePath = (route || '').split('?')[0].split('#')[0];
  const here = typeof window === 'undefined' ? '' : window.location.pathname;
  const elsewhere = !!notePath && notePath !== here;

  return (
    <div className="qa-rounded-lg qa-border qa-border-subtle qa-bg-2">
      {/* header row */}
      <div className="qa-flex qa-items-center qa-gap-1.5 qa-px-2 qa-py-1.5 qa-text-11">
        <Icon name="CheckCircle2" size={14} className="qa-text-success" />
        <span className="qa-font-medium qa-text-hi">
          {t('loc_captured')}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="qa-ms-auto qa-inline-flex qa-items-center qa-gap-1 qa-font-medium qa-tap qa-text-accent"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {open ? t('loc_hide') : t('loc_show')}
          <Icon
            name="ChevronDown"
            size={14}
            style={{
              transition: 'transform 150ms',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      </div>

      {/* details */}
      {open && (
        <div className="qa-space-y-1 qa-px-2 qa-pb-2 qa-text-11 qa-dir-ltr qa-text-hi">
          {target.selector && (
            <div className="qa-flex qa-gap-1">
              <span className="qa-opacity-50">selector</span>
              <code
                className="qa-min-w-0 qa-flex-1 qa-truncate qa-rounded qa-bg-3 qa-px-1"
                title={target.selector}
              >
                {target.selector}
              </code>
            </div>
          )}
          {target.tagName && (
            <div>
              <span className="qa-opacity-50">tag </span>
              <code className="qa-rounded qa-bg-3 qa-px-1">
                &lt;{target.tagName}&gt;
              </code>
            </div>
          )}
          {target.text && (
            <div className="qa-truncate">
              <span className="qa-opacity-50">text </span>
              &quot;{target.text}&quot;
            </div>
          )}
          {r && (
            <div>
              <span className="qa-opacity-50">pos </span>
              {Math.round(r.left)}, {Math.round(r.top)} · {Math.round(r.width)}×
              {Math.round(r.height)}
            </div>
          )}
          {elsewhere ? (
            <>
              <p className="qa-mt-1 qa-mb-1 qa-m-0 qa-text-lo">
                {t('loc_other_page', { path: notePath })}
              </p>
              <button
                onClick={() => walkNavigate(notePath)}
                className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-md qa-px-2 qa-py-1 qa-font-medium qa-tap qa-bg-accent"
                style={{ border: 'none', cursor: 'pointer' }}
              >
                <Icon name="MapPinned" size={12} />
                {t('loc_go_there', { path: notePath })}
              </button>
            </>
          ) : (
            <button
              onClick={() => flashLocate(target)}
              className="qa-mt-1 qa-inline-flex qa-items-center qa-gap-1 qa-rounded-md qa-px-2 qa-py-1 qa-font-medium qa-tap qa-bg-accent"
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Crosshair" size={12} />
              <Icon name="MapPinned" size={12} />
              {t('loc_locate')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
