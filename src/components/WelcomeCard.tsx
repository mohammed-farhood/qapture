/**
 * WelcomeCard — ONE line, once, for someone who was handed a link.
 *
 * The person testing a beta usually did not install this, did not configure
 * it, and has no idea what the floating button is. They need one sentence:
 * click Capture, then click whatever looks wrong.
 *
 * It used to be a three-bullet card with a "Got it" button. The owner — who
 * meets it in every fresh browser profile, having written the thing — called
 * it annoying, and was right: a wall of instructions is how a tester decides
 * the tool is someone else's problem, and how an owner decides it is in the
 * way. So it is now one line with a dismiss cross, and it takes itself away
 * as soon as the first note exists, because by then it has either worked or
 * been ignored.
 *
 * Deliberately still says nothing about tags, journeys, folders or export.
 * Those are discoverable, and this is not the place.
 *
 * Lives inside the panel rather than over the page, so it can never block the
 * app the tester came to look at.
 */

import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

export default function WelcomeCard() {
  const { t, dismissWelcome } = useQa();

  return (
    <div
      className="qa-flex qa-items-center qa-gap-2 qa-rounded-xl qa-border qa-border-subtle qa-bg-1 qa-px-3 qa-py-2"
      role="note"
    >
      <Icon name="Crosshair" size={13} className="qa-shrink-0 qa-text-accent" />
      <span className="qa-flex-1 qa-text-xs qa-text-mid">{t('welcome_capture')}</span>
      <button
        type="button"
        onClick={dismissWelcome}
        aria-label={t('welcome_got_it')}
        title={t('welcome_got_it')}
        className="qa-tap-icon qa-shrink-0 qa-rounded-full qa-text-mid qa-focus-ring"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
      >
        <Icon name="X" size={13} />
      </button>
    </div>
  );
}
