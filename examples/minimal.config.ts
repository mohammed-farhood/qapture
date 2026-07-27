/**
 * Minimal Qapture config — smallest useful example.
 *
 * Three journey steps across one lane: one green (informational),
 * one amber (important but recoverable), one red (irreversible / financial).
 *
 * Everything not specified here uses built-in defaults:
 *   namespace      → 'qapture'
 *   loginField     → 'Username'
 *   credentials    → []
 *   preamble       → null
 *   hotkey         → Shift+Alt+Q
 *   visible        → dev-only (hidden in production)
 *   captureContext → true (records recent console/network events into each
 *                    note — see SECURITY.md; set to `false` to disable)
 *
 * NOTE (v0.3.0 "Graphite"): custom themes were removed in this release — the
 * widget now ships one fixed, self-contained dark design. There is no more
 * `theme` key to set here; a leftover one is ignored with a console warning.
 *
 * Drop in near your app root to get started immediately:
 *
 *   import { Qapture } from 'qapture2';
 *   import config from './qa.config';
 *
 *   <Qapture config={config} />
 */

import type { QaConfig } from 'qapture2';

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
