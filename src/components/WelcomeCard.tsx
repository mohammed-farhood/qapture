/**
 * WelcomeCard — three lines, once, for someone who was handed a link.
 *
 * The person testing a beta usually did not install this, did not configure
 * it, and has no idea what the floating button is. Everything they need fits
 * in three lines: what this is, how to report something, and the reassurance
 * that they cannot lose their work. Anything longer gets skipped, which is
 * why this deliberately does not explain severity, journeys, folders or
 * export — those are discoverable, and a wall of instructions is how a tester
 * decides the tool is someone else's problem.
 *
 * Shown once per browser (a localStorage flag), inside the panel rather than
 * over the page, so it can never block the app the tester came to look at.
 */

import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

export default function WelcomeCard() {
  const { t, brand, dismissWelcome } = useQa();

  return (
    <div
      className="qa-rounded-xl qa-border qa-border-subtle qa-bg-1 qa-p-3 qa-space-y-2"
      role="note"
    >
      <p className="qa-m-0 qa-flex qa-items-center qa-gap-1.5 qa-text-sm qa-font-semibold qa-text-hi">
        <span
          aria-hidden="true"
          className="qa-shrink-0"
          style={{ width: 6, height: 6, background: 'var(--qa-accent)' }}
        />
        {t('welcome_title', { brand: brand.label })}
      </p>

      <ul className="qa-m-0 qa-space-y-1 qa-text-xs qa-text-mid">
        <li className="qa-flex qa-items-start qa-gap-1.5">
          <Icon name="Crosshair" size={12} className="qa-shrink-0 qa-mt-1" />
          <span>{t('welcome_capture')}</span>
        </li>
        <li className="qa-flex qa-items-start qa-gap-1.5">
          <Icon name="Pencil" size={12} className="qa-shrink-0 qa-mt-1" />
          <span>{t('welcome_say')}</span>
        </li>
        <li className="qa-flex qa-items-start qa-gap-1.5">
          <Icon name="CheckCircle2" size={12} className="qa-shrink-0 qa-mt-1" />
          <span>{t('welcome_safe')}</span>
        </li>
      </ul>

      <button
        type="button"
        onClick={dismissWelcome}
        className="qa-tap qa-w-full qa-rounded-lg qa-bg-accent qa-px-3 qa-py-1.5 qa-text-xs qa-font-semibold"
        style={{ border: 'none', cursor: 'pointer' }}
      >
        {t('welcome_got_it')}
      </button>
    </div>
  );
}
