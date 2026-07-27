/**
 * NoticeHost — the toast stack for qapture's notices (contract §5/§6).
 *
 * Two aria-live regions sit side by side so screen readers get the right
 * urgency: 'polite' carries info/success toasts (announced without
 * interrupting whatever the reader is doing), 'assertive' carries error
 * toasts only — a persist_failed/copy_failed notice is often the ONLY signal
 * something went wrong, so it interrupts.
 *
 * Both regions are always mounted (even with nothing in them) rather than
 * conditionally rendered on `notices.length`, so a screen reader has already
 * registered the live region by the time the first toast lands in it —
 * mounting the region and its first mutation in the same tick is unreliable.
 *
 * pointer-events: the outer viewport is `none` so the toast stack never
 * blocks clicks to the page/panel underneath it. Only a toast's own action
 * button (e.g. "Undo") re-enables pointer-events — the toast surface itself
 * stays click-through, matching the "outer container none / toast buttons
 * auto" split from the contract.
 *
 * Rendered by QaRoot (owned by the components agent); this file only builds
 * the component itself.
 */

import { useQa } from '../context/QaContext';
import type { QaNotice } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/Icon';

/**
 * Tone → (icon, colour class). Only Check/AlertTriangle/X are available per
 * contract §8 — success reads naturally as a checkmark, error as a warning
 * triangle, and the default 'info' tone (used for note_deleted/notes_cleared)
 * takes the remaining X, doubling as a "this went away" glyph.
 */
function toneIcon(tone: QaNotice['tone']): { name: IconName; colorClass: string } {
  switch (tone) {
    case 'success':
      return { name: 'Check', colorClass: 'qa-text-success' };
    case 'error':
      return { name: 'AlertTriangle', colorClass: 'qa-text-danger' };
    default:
      return { name: 'X', colorClass: 'qa-text-accent' };
  }
}

function Toast({ notice }: { notice: QaNotice }) {
  const { dismissNotice } = useQa();
  const icon = toneIcon(notice.tone);

  return (
    <div
      className="qa-toast qa-toast-in qa-bg-2 qa-border qa-border-subtle qa-elev-2 qa-text-hi qa-flex qa-items-center qa-gap-2 qa-rounded-md qa-px-3 qa-py-2"
      style={{ fontSize: 13 }}
    >
      <Icon name={icon.name} size={16} className={`qa-shrink-0 ${icon.colorClass}`} />
      <span className="qa-min-w-0 qa-flex-1">{notice.message}</span>
      {notice.action && (
        <button
          type="button"
          onClick={() => {
            notice.action?.onAction();
            dismissNotice(notice.id);
          }}
          className="qa-tap qa-text-accent qa-focus-ring qa-shrink-0 qa-rounded qa-px-2 qa-py-1 qa-font-semibold"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, pointerEvents: 'auto' }}
        >
          {notice.action.label}
        </button>
      )}
    </div>
  );
}

export default function NoticeHost() {
  const { notices, dir } = useQa();

  const politeNotices = notices.filter((n) => n.tone !== 'error');
  const errorNotices = notices.filter((n) => n.tone === 'error');

  return (
    <div
      data-qa-overlay="true"
      dir={dir}
      className="qa-toast-viewport qa-print-hidden qa-fixed"
      style={{ zIndex: 'var(--qa-z-toast)', pointerEvents: 'none' }}
    >
      <div aria-live="polite" className="qa-flex qa-flex-col qa-items-center qa-gap-2">
        {politeNotices.map((n) => (
          <Toast key={n.id} notice={n} />
        ))}
      </div>
      <div aria-live="assertive" className="qa-flex qa-flex-col qa-items-center qa-gap-2">
        {errorNotices.map((n) => (
          <Toast key={n.id} notice={n} />
        ))}
      </div>
    </div>
  );
}
