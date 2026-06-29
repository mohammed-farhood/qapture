import { QaStudio } from 'qa-studio';

// A demo config the Phase 1 runtime will consume. Kept here so the playground
// doubles as the manual test harness (theme + graded journey + dev logins).
const demoConfig = {
  namespace: 'playground',
  brand: { label: 'QA Studio' },
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
      <h1>QA Studio — Playground</h1>
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

      <QaStudio config={demoConfig} />
    </div>
  );
}
