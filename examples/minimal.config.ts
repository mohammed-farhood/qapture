/**
 * Minimal Qapture config — smallest useful example.
 *
 * Three journey steps across one lane: one green (informational),
 * one amber (important but recoverable), one red (irreversible / financial).
 *
 * Everything not specified here uses built-in defaults:
 *   namespace  → 'qapture'
 *   theme      → indigo/violet palette
 *   loginField → 'Username'
 *   credentials → []
 *   preamble   → null
 *   hotkey     → Shift+Alt+Q
 *   visible    → dev-only (hidden in production)
 *
 * Drop in near your app root to get started immediately:
 *
 *   import { Qapture } from 'qapture';
 *   import config from './qa.config';
 *
 *   <Qapture config={config} />
 */

import type { QaConfig } from 'qapture';

const config: QaConfig = {
  namespace: 'my-app',
  brand:     { label: 'My App QA' },

  journey: [
    {
      id:   'user',
      role: 'Logged-in user',
      steps: [
        {
          path: '/',
          risk: 'green',
          what: 'Home page loads without errors and all navigation links work.',
        },
        {
          path: '/dashboard',
          risk: 'amber',
          what: 'Dashboard shows the correct user data; no loading spinners are stuck; counts are accurate.',
        },
        {
          path:    '/billing',
          risk:    'red',
          riskWhy: 'Payment processing — charges are irreversible once submitted.',
          what:    'Billing page shows the correct outstanding amount and the payment button completes without error.',
        },
      ],
    },
  ],
};

export default config;
