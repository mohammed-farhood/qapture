/**
 * NoteFilterBar — make a long session readable.
 *
 * Before v0.4 the Notes tab was one flat, ever-growing list: forty points into
 * a real session there was no way to answer "show me just the red flags" or
 * "what did I file on the checkout page" without scrolling the whole thing.
 * This is the smallest structure that fixes that — severity and status chips
 * with live counts, a text search, and a "this page" toggle — rather than a
 * folder tree the tester would have to maintain by hand.
 *
 * Every chip is a filter over the SAME list, so nothing is ever hidden
 * permanently and there is no second place a note can hide in.
 */

import { useState } from 'react';
import { useQa } from '../context/QaContext';
import type { QaSeverityFilter, QaStatusFilter } from '../context/QaContext';
import { Icon, type IconName } from '../icons/Icon';

type Chip = {
  key: string;
  label: string;
  count: number;
  active: boolean;
  icon?: IconName;
  tone?: 'danger' | 'warn' | 'accent' | 'success';
  onClick: () => void;
};

const TONE_CLASS: Record<string, string> = {
  danger: 'qa-bg-danger-tint qa-text-danger',
  warn: 'qa-bg-warn-tint qa-text-warn',
  accent: 'qa-bg-accent-tint qa-text-accent',
  success: 'qa-bg-success-tint qa-text-success',
};

function FilterChip({ chip }: { chip: Chip }) {
  const activeClass = chip.tone ? TONE_CLASS[chip.tone] : 'qa-bg-accent-tint qa-text-accent';
  return (
    <button
      type="button"
      onClick={chip.onClick}
      aria-pressed={chip.active}
      disabled={chip.count === 0 && !chip.active}
      className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-border qa-px-2 qa-py-0.5 qa-text-10 qa-font-medium qa-transition qa-focus-ring ${
        chip.active ? activeClass : 'qa-bg-2 qa-text-mid'
      }`}
      style={{
        borderColor: chip.active ? 'transparent' : 'var(--qa-border-subtle)',
        cursor: chip.count === 0 && !chip.active ? 'default' : 'pointer',
        opacity: chip.count === 0 && !chip.active ? 0.45 : 1,
      }}
    >
      {chip.icon && <Icon name={chip.icon} size={10} />}
      {chip.label}
      <span className="qa-opacity-80">{chip.count}</span>
    </button>
  );
}

export default function NoteFilterBar() {
  const { filter, setFilter, noteCounts, notes, deleteNotes, startWalk, t } = useQa();
  const [confirmPrune, setConfirmPrune] = useState(false);

  // Nothing to sort through yet — don't spend panel height on chrome.
  if (notes.length < 3) return null;

  // "Keep only these" (v0.7.8). A campaign ends with twenty notes of which
  // five came back wrong; what gets sent round again should be those five and
  // nothing else, or the agent re-reads fifteen findings that are already
  // done. Offered only while the tester is actually LOOKING at the re-test
  // list, where "these" has an unambiguous referent and the count on screen
  // is the count that survives. Deletion goes through deleteNotes(), so it
  // lands in the same undo toast as any other bulk delete.
  const others = notes.filter((n) => (n.status ?? 'open') !== 'fixed');
  const showPrune = filter.status === 'fixed' && noteCounts.fixed > 0 && others.length > 0;

  const sev = (key: QaSeverityFilter) => () =>
    setFilter({ severity: filter.severity === key ? 'all' : key });
  const stat = (key: QaStatusFilter) => () =>
    setFilter({ status: filter.status === key ? 'all' : key });

  const chips: Chip[] = [
    {
      key: 'all',
      label: t('filter_all'),
      count: noteCounts.all,
      active: filter.severity === 'all' && filter.status === 'all' && !filter.thisPageOnly,
      onClick: () => setFilter({ severity: 'all', status: 'all', thisPageOnly: false }),
    },
    {
      key: 'bug',
      label: t('sev_bug'),
      count: noteCounts.bug,
      active: filter.severity === 'bug',
      icon: 'Bug',
      tone: 'danger',
      onClick: sev('bug'),
    },
    {
      key: 'enhance',
      label: t('sev_enhance'),
      count: noteCounts.enhance,
      active: filter.severity === 'enhance',
      icon: 'Plus',
      tone: 'warn',
      onClick: sev('enhance'),
    },
    {
      key: 'design',
      label: t('sev_design'),
      count: noteCounts.design,
      active: filter.severity === 'design',
      icon: 'Pencil',
      tone: 'accent',
      onClick: sev('design'),
    },
    // Only ever shown once something has actually been sent. A chip reading
    // "Sent 0" on a first run is noise; the same chip reading "Sent 6" the
    // morning after an export is the one thing the tester came back for.
    ...(noteCounts.sent > 0 ? [{
      key: 'sent',
      label: t('status_sent'),
      count: noteCounts.sent,
      active: filter.status === 'sent',
      icon: 'Camera' as const,
      tone: 'accent' as const,
      onClick: () => setFilter({ status: 'sent', severity: 'all', thisPageOnly: false }),
    }] : []),
    {
      key: 'open',
      label: t('status_open'),
      count: noteCounts.open,
      active: filter.status === 'open',
      icon: 'Circle',
      onClick: stat('open'),
    },
    {
      key: 'fixed',
      label: t('status_fixed'),
      count: noteCounts.fixed,
      active: filter.status === 'fixed',
      icon: 'RotateCcw',
      tone: 'warn',
      onClick: stat('fixed'),
    },
    {
      key: 'verified',
      label: t('status_verified'),
      count: noteCounts.verified,
      active: filter.status === 'verified',
      icon: 'CheckCircle2',
      tone: 'success',
      onClick: stat('verified'),
    },
    {
      key: 'page',
      label: t('filter_this_page'),
      count: noteCounts.thisPage,
      active: filter.thisPageOnly,
      icon: 'MapPin',
      onClick: () => setFilter({ thisPageOnly: !filter.thisPageOnly }),
    },
  ];

  return (
    <div className="qa-space-y-2">
      <div
        className="qa-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-border qa-border-subtle qa-bg-2 qa-px-2"
      >
        <Icon name="Search" size={13} className="qa-shrink-0 qa-text-lo" />
        <input
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder={t('filter_search')}
          aria-label={t('filter_search')}
          className="qa-min-w-0 qa-flex-1 qa-py-1.5 qa-text-xs qa-border-0"
          style={{ outline: 'none', background: 'transparent', color: 'inherit' }}
        />
        {filter.query && (
          <button
            type="button"
            onClick={() => setFilter({ query: '' })}
            aria-label={t('filter_clear')}
            className="qa-tap-icon qa-text-lo qa-hover-text-slate-600"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="X" size={12} />
          </button>
        )}
      </div>

      <div className="qa-flex qa-flex-wrap qa-gap-1">
        {chips.map((chip) => (
          <FilterChip key={chip.key} chip={chip} />
        ))}
      </div>

      {/* The return trip. Exporting put these points on test; this is the
          button that collects the answers -- it filters to exactly what was
          sent and starts the walk, which takes the tester to each spot in
          turn and asks whether it is now what they wanted. Without it the
          checklist in the export has no counterpart on this side. */}
      {noteCounts.sent > 0 && (
        <button
          type="button"
          data-qa-verify-walk="true"
          onClick={() => {
            setFilter({ status: 'sent', severity: 'all', thisPageOnly: false });
            startWalk('notes', 0);
          }}
          title={t('check_fixes_hint')}
          className="qa-tap qa-inline-flex qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-md qa-border qa-border-subtle qa-px-2 qa-py-1.5 qa-text-xs qa-text-hi qa-focus-ring"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          <Icon name="Check" size={13} />
          {t('check_fixes', { n: noteCounts.sent })}
        </button>
      )}

      {showPrune && (
        <div className="qa-text-11" data-qa-prune="true">
          {confirmPrune ? (
            <span className="qa-text-mid">
              {t('keep_only_retest_q', { n: others.length })}{' '}
              <button
                type="button"
                onClick={() => {
                  void deleteNotes(others.map((n) => n.id));
                  setConfirmPrune(false);
                }}
                className="qa-font-semibold qa-text-danger qa-tap"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {t('yes')}
              </button>
              {' / '}
              <button
                type="button"
                onClick={() => setConfirmPrune(false)}
                className="qa-text-accent qa-tap"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {t('no')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmPrune(true)}
              title={t('keep_only_retest_hint')}
              className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-text-lo"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Trash" size={11} />
              {t('keep_only_retest', { n: noteCounts.fixed })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
