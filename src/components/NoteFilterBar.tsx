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
  const { filter, setFilter, noteCounts, notes, t } = useQa();

  // Nothing to sort through yet — don't spend panel height on chrome.
  if (notes.length < 3) return null;

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
      key: 'question',
      label: t('sev_question'),
      count: noteCounts.question,
      active: filter.severity === 'question',
      icon: 'AlertTriangle',
      tone: 'warn',
      onClick: sev('question'),
    },
    {
      key: 'polish',
      label: t('sev_polish'),
      count: noteCounts.polish,
      active: filter.severity === 'polish',
      icon: 'Pencil',
      tone: 'accent',
      onClick: sev('polish'),
    },
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
    </div>
  );
}
