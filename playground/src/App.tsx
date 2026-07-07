import { Qapture, deleteQaDatabase } from 'qapture2';
// Bug #1 test hook: exposes the real public `deleteQaDatabase` export (per
// idb.ts's doc comment: `import('qapture2').then(m => m.deleteQaDatabase(...))`)
// on `window` so scripts/browser-test.mjs can drive the actual fix (close
// cached connection → onblocked/onerror/onsuccess → Promise) end to end.

if (typeof window !== 'undefined') {
  (window as unknown as { __qaDeleteDatabase?: typeof deleteQaDatabase }).__qaDeleteDatabase =
    deleteQaDatabase;
}

// A demo config the Phase 1 runtime will consume. Kept here so the playground
// doubles as the manual test harness (theme + graded journey + dev logins).
const demoConfig = {
  namespace: 'playground',
  brand: { label: 'Qapture' },
  rtl: false,
  alwaysVisible: true,
  loginField: { en: 'Email', ar: 'البريد' },
  theme: {
    primary: '#6B2C3E',
    primaryDark: '#4D1F2D',
    accent: '#D4726B',
    accentDark: '#B85E58',
    sage: '#8B9D83',
    cream: '#F5EBE0',
    mauve: '#C9A9B4',
    surface: '#FFFDFB',
    ink: '#3A2A2E',
  },
  credentials: [
    { role: 'Admin', login: 'admin@demo.test', password: 'Admin@123', seeded: true },
    // Duplicate `role` on purpose (test fixture for Bug #28): CredentialsSection
    // used to key rows by `role` alone, silently collapsing duplicates. The fix
    // keys by `${role}-${index}` instead, so this pair must still render as two
    // distinct DOM rows.
    { role: 'Admin', login: 'admin2@demo.test', password: 'Admin2@456', seeded: true },
    { role: 'Buyer', login: 'buyer@demo.test', password: 'Buyer@123', seeded: true },
  ],
  journey: [
    {
      id: 'public',
      color: '#8B9D83',
      role: { en: 'Public', ar: 'الزائر' },
      steps: [
        { path: '/', risk: 'green', what: { en: 'Load the home page and scroll.' } },
        { path: '/checkout', risk: 'red', riskWhy: 'money flow', what: { en: 'Place a test order.' } },
      ],
    },
  ],
};

export function App() {
  return (
    <div className="wrap">
      {/* Test fixture (Bug #11): a real animated scroll so scrollIntoView's
          browser-native smooth-scroll actually runs over multiple frames
          (rather than settling instantly), letting the browser-test harness
          distinguish "paint one rAF after scrollIntoView" (old, wrong —
          would paint mid-animation) from settleThenPaint's poll-until-stable
          behaviour (new, correct — paints the true final rect). This is the
          `html` scrolling box (the page has no other scroll container), so
          this is the CSS property that actually governs it. Scoped test
          setup scrolls in scripts/browser-test.mjs explicitly opt back into
          `behavior: 'instant'` so this doesn't affect their own timing.  */}
      <style>{'html { scroll-behavior: smooth; }'}</style>
      <h1>Qapture — Playground</h1>
      <p>
        This page intentionally uses <strong>no Tailwind</strong> and plain CSS, to prove
        the widget is fully self-contained and style-isolated. Open the launcher
        (bottom-left), capture an element or a dragged region, and export.
      </p>

      <div className="card">
        <h2 id="checkout-card">Checkout</h2>
        <p>A fake checkout block to capture against.</p>
        <input className="demo" aria-label="Address line" placeholder="Address" />
        <p style={{ marginTop: 12 }}>
          <button className="demo" aria-label="Place order">Place order</button>
        </p>
      </div>

      <div className="card">
        <h2>Long content</h2>
        {Array.from({ length: 20 }).map((_, i) => (
          <p key={i}>Paragraph {i + 1} — scroll target for region capture and locate-flash.</p>
        ))}
      </div>

      {/* Test fixture (Bugs #10/#11): a tall filler section so the page has
          plenty of scroll room for the browser-test harness's region-capture
          scroll-drift and scrollIntoView-settle assertions. */}
      <div className="card" style={{ minHeight: 2600 }} id="scroll-filler">
        <h2>Scroll filler</h2>
        <p>Tall filler content — pure scroll real estate, no interaction needed.</p>
      </div>

      <Qapture config={demoConfig} />
    </div>
  );
}
