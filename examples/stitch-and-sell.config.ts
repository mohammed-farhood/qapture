/**
 * Stitch & Sell — QA Studio config (canonical worked example).
 *
 * This is the complete, graded journey map for the Stitch & Sell Iraqi
 * handmade-goods marketplace. It demonstrates every qa-studio config feature:
 *
 *   - Full 9-token QaTheme override (burgundy / terracotta palette)
 *   - Bilingual (en + ar) role labels, step instructions, and credential hints
 *   - 5 journey lanes: Public, Buyer, Seller, Admin, Super admin
 *   - 32 steps graded: 14 red / 11 amber / 7 green
 *   - riskWhy on every red step
 *   - Filled QaPreamble so the receiving agent already knows the project
 *
 * CREDENTIALS ARE FAKE / SEED PLACEHOLDERS.
 * Replace login and password values with your actual seeded test values.
 * Never commit real production credentials.
 */

import type { QaConfig } from 'qa-studio';

const config: QaConfig = {
  namespace: 'stitch-and-sell',

  // ── Brand palette: burgundy / terracotta / sage / cream / mauve ──────────
  theme: {
    primary:     '#6B2C3E', // burgundy
    primaryDark: '#4D1F2D',
    accent:      '#D4726B', // terracotta
    accentDark:  '#B85E58',
    sage:        '#8B9D83',
    cream:       '#F5EBE0',
    mauve:       '#C9A9B4',
    surface:     '#FFFDFB',
    ink:         '#3A2A2E',
  },

  brand: { label: 'Stitch & Sell QA' },

  // Iraqi marketplace: phone number is the login identifier
  loginField: { en: 'Phone', ar: 'الهاتف' },

  // ── Seed credentials — FAKE PLACEHOLDERS, replace with real seed values ──
  credentials: [
    {
      role:    'Admin',
      roleAr:  'مشرف',
      login:   '07800000001',
      password: 'SEED_ADMIN_PASS',
      seeded:  true,
      hint: { en: 'Full moderation access', ar: 'صلاحيات إشراف كاملة' },
    },
    {
      role:    'Seller · Baghdad Yarn',
      roleAr:  'بائع · غزل بغداد',
      login:   '07800000002',
      password: 'SEED_SELLER_PASS',
      seeded:  true,
    },
    {
      role:    'Buyer',
      roleAr:  'مشترٍ',
      login:   '07800000003',
      password: 'SEED_BUYER_PASS',
      seeded:  true,
    },
    {
      role:    'Super admin',
      roleAr:  'مشرف أعلى',
      login:   '—',
      password: '—',
      seeded:  false,
      hint: { en: 'Not seeded — add via DB', ar: 'غير مُهيأ — أضِفه عبر قاعدة البيانات' },
    },
  ],

  // ── Journey map ───────────────────────────────────────────────────────────
  // 14 red / 11 amber / 7 green across 5 lanes (32 steps total)
  // Coverage is scored on RED steps only. See docs/ARCHITECTURE.md §Graded Risk.
  journey: [

    // ── PUBLIC lane (8 steps: 0 red / 3 amber / 5 green) ───────────────────
    {
      id:    'public',
      color: '#8B9D83',
      role:  { en: 'Public', ar: 'الزائر' },
      steps: [
        {
          path: '/',
          risk: 'green',
          what: {
            en: 'Start on the home page. Scroll all the way down and make sure the hero, the featured products, the active challenge banner, and the workshops strip all load and their links work.',
            ar: 'ابدأ من الصفحة الرئيسية. انزل حتى الأسفل وتأكّد من ظهور الواجهة الرئيسية والمنتجات المميّزة وشريط التحدّي الحالي وقسم الورش، وأنّ روابطها تعمل.',
          },
        },
        {
          path: '/browse',
          risk: 'amber',
          what: {
            en: 'Open Browse. Apply a couple of filters and a sort, confirm the results actually narrow and reorder, then click "Load more" to pull the next page of products.',
            ar: 'افتح صفحة التصفّح. طبّق بعض الفلاتر والترتيب، وتأكّد أنّ النتائج تتقلّص وتُعاد ترتيبها فعليًا، ثم اضغط «تحميل المزيد» لجلب صفحة المنتجات التالية.',
          },
        },
        {
          path: '/product/:id',
          risk: 'amber',
          what: {
            en: 'Open any product. Flip through the image gallery, switch variants (size/color), read the reviews, and check the seller card links to the store.',
            ar: 'افتح أيّ منتج. تنقّل بين صور المعرض، بدّل الخيارات (المقاس/اللون)، اقرأ التقييمات، وتأكّد أنّ بطاقة البائع تُحيل إلى المتجر.',
          },
        },
        {
          path: '/stores',
          risk: 'green',
          what: {
            en: 'Browse the store directory and try the search — confirm stores appear and searching filters them.',
            ar: 'تصفّح دليل المتاجر وجرّب البحث — تأكّد من ظهور المتاجر وأنّ البحث يُصفّيها.',
          },
        },
        {
          path: '/stores/:id',
          risk: 'amber',
          what: {
            en: 'Open a store profile, browse its products, and try the Follow button (it should prompt login if you are signed out).',
            ar: 'افتح ملف متجر، تصفّح منتجاته، وجرّب زر «المتابعة» (يجب أن يطلب تسجيل الدخول إن لم تكن مسجّلًا).',
          },
        },
        {
          path: '/challenges',
          risk: 'green',
          what: {
            en: 'Check the monthly challenges list and open one to see its details and entries.',
            ar: 'تحقّق من قائمة التحدّيات الشهرية وافتح أحدها لرؤية تفاصيله والمشاركات.',
          },
        },
        {
          path: '/workshops',
          risk: 'green',
          what: {
            en: 'Browse the workshops list and open one — confirm the schedule, price, and capacity show.',
            ar: 'تصفّح قائمة الورش وافتح إحداها — تأكّد من ظهور الموعد والسعر والسعة.',
          },
        },
        {
          path: '/about',
          risk: 'green',
          what: {
            en: 'Skim the static pages (About, Contact, FAQ, Terms, Privacy) and confirm none are broken.',
            ar: 'تصفّح الصفحات الثابتة (من نحن، اتصل بنا، الأسئلة الشائعة، الشروط، الخصوصية) وتأكّد أنّها سليمة.',
          },
        },
      ],
    },

    // ── BUYER lane (10 steps: 7 red / 3 amber / 0 green) ───────────────────
    {
      id:    'buyer',
      color: '#D4726B',
      role:  { en: 'Buyer', ar: 'المشتري' },
      steps: [
        {
          path:    '/cart',
          risk:    'red',
          riskWhy: 'Cart totals feed directly into checkout — incorrect calculations cause wrong charges at payment time.',
          what: {
            en: 'Add a few products, then change quantities and remove an item — confirm the totals recalculate correctly.',
            ar: 'أضِف بعض المنتجات، ثم غيّر الكميات واحذف عنصرًا — وتأكّد من إعادة احتساب المجاميع بشكل صحيح.',
          },
        },
        {
          path:    '/checkout',
          risk:    'red',
          riskWhy: 'Order placement is irreversible — incorrect address or total means a fulfilment failure the buyer cannot self-correct.',
          what: {
            en: 'Go through checkout: enter an address, choose cash on delivery, and place the order. Confirm you land on a success/confirmation screen.',
            ar: 'أكمِل عملية الشراء: أدخِل عنوانًا، اختر الدفع عند الاستلام، وأكِّد الطلب. تأكّد من وصولك إلى شاشة نجاح/تأكيد.',
          },
        },
        {
          path:    '/buyer',
          risk:    'red',
          riskWhy: "Order history is the buyer's source of truth — discrepancies erode trust and generate support tickets.",
          what: {
            en: "Open your order history and one order's detail — verify the items, totals, and status match what you ordered.",
            ar: 'افتح سجلّ طلباتك وتفاصيل أحد الطلبات — تحقّق من تطابق العناصر والمجاميع والحالة مع ما طلبته.',
          },
        },
        {
          path:    '/orders/:id/tracking',
          risk:    'red',
          riskWhy: '"Confirm received" moves the order to completed — this is irreversible and gates the seller\'s payout eligibility.',
          what: {
            en: 'Open order tracking, follow the status timeline, and try "Confirm received" to move it to completed.',
            ar: 'افتح تتبّع الطلب، تابع الخطّ الزمني للحالة، وجرّب «تأكيد الاستلام» لنقله إلى مكتمل.',
          },
        },
        {
          path: '/wishlist',
          risk: 'amber',
          what: {
            en: 'Add items to the wishlist and generate a share link — open the link to confirm it works.',
            ar: 'أضِف عناصر إلى المفضّلة وأنشئ رابط مشاركة — افتح الرابط للتأكّد من عمله.',
          },
        },
        {
          path: '/custom-orders',
          risk: 'amber',
          what: {
            en: 'Submit a custom order request and walk through the request → quote flow.',
            ar: 'أرسِل طلب تصميم مخصّص وتابع مسار الطلب ← عرض السعر.',
          },
        },
        {
          path: '/messages',
          risk: 'amber',
          what: {
            en: 'Open messages and send a note to a seller — confirm it appears and the unread state updates.',
            ar: 'افتح الرسائل وأرسِل رسالة إلى بائع — تأكّد من ظهورها وتحديث حالة «غير مقروء».',
          },
        },
        {
          path:    '/wallet',
          risk:    'red',
          riskWhy: 'Wallet balance and transaction history are financial records — any discrepancy represents real monetary loss.',
          what: {
            en: 'Check the wallet balance and the transaction history line up.',
            ar: 'تحقّق من توافق رصيد المحفظة مع سجلّ المعاملات.',
          },
        },
        {
          path:    '/loyalty',
          risk:    'red',
          riskWhy: 'Redeeming loyalty points converts them to wallet credit — this is irreversible and affects the buyer\'s financial balance.',
          what: {
            en: 'Review loyalty points and try redeeming some into wallet credit.',
            ar: 'راجِع نقاط الولاء وجرّب استبدال بعضها برصيد في المحفظة.',
          },
        },
        {
          path:    '/disputes',
          risk:    'red',
          riskWhy: 'Filing a dispute triggers a moderation workflow and may freeze the associated order funds pending resolution.',
          what: {
            en: 'Open a dispute on an order and confirm it shows in the disputes list.',
            ar: 'افتح نزاعًا على طلب وتأكّد من ظهوره في قائمة النزاعات.',
          },
        },
      ],
    },

    // ── SELLER lane (7 steps: 4 red / 2 amber / 1 green) ───────────────────
    {
      id:    'seller',
      color: '#6B2C3E',
      role:  { en: 'Seller', ar: 'البائع' },
      steps: [
        {
          path:    '/seller/onboarding',
          risk:    'red',
          riskWhy: "Completing onboarding is the gate to listing products and receiving payouts — a broken step blocks the seller's entire workflow.",
          what: {
            en: 'Run through seller onboarding as a new seller and confirm each step saves.',
            ar: 'مُرّ بخطوات تسجيل البائع كبائع جديد وتأكّد من حفظ كل خطوة.',
          },
        },
        {
          path: '/seller (Products)',
          risk: 'amber',
          what: {
            en: 'Create a product, edit it, and add variants — confirm images upload and stock saves.',
            ar: 'أنشئ منتجًا، عدّله، وأضِف خيارات — تأكّد من رفع الصور وحفظ المخزون.',
          },
        },
        {
          path:    '/seller (Orders)',
          risk:    'red',
          riskWhy: 'Moving an order through fulfilment/ship statuses is irreversible and immediately triggers buyer notifications and stock deductions.',
          what: {
            en: 'Open incoming orders and move one through its statuses (fulfil / ship).',
            ar: 'افتح الطلبات الواردة وانقل أحدها عبر حالاته (تجهيز / شحن).',
          },
        },
        {
          path:    '/seller (Payouts)',
          risk:    'red',
          riskWhy: 'Payout requests initiate a real money transfer — an incorrect balance display or broken request form causes direct financial loss.',
          what: {
            en: 'Check earnings and request a payout — confirm the balance math is right.',
            ar: 'تحقّق من الأرباح واطلب تحويلًا — تأكّد من صحّة حساب الرصيد.',
          },
        },
        {
          path: '/seller (Analytics)',
          risk: 'green',
          what: {
            en: 'Review the analytics charts and confirm the date ranges change the data.',
            ar: 'راجِع الرسوم التحليلية وتأكّد أنّ تغيير النطاق الزمني يُغيّر البيانات.',
          },
        },
        {
          path: '/seller (Workshops)',
          risk: 'amber',
          what: {
            en: 'Create a workshop and check its bookings list.',
            ar: 'أنشئ ورشة وتحقّق من قائمة الحجوزات الخاصة بها.',
          },
        },
        {
          path:    '/seller (Disputes)',
          risk:    'red',
          riskWhy: "A seller's dispute response is an official record that directly affects the resolution outcome and any refund issued.",
          what: {
            en: 'Respond to a buyer dispute and confirm your response is recorded.',
            ar: 'ردّ على نزاع من مشترٍ وتأكّد من تسجيل ردّك.',
          },
        },
      ],
    },

    // ── ADMIN lane (6 steps: 3 red / 2 amber / 1 green) ────────────────────
    {
      id:    'admin',
      color: '#C9A9B4',
      role:  { en: 'Admin', ar: 'المشرف' },
      steps: [
        {
          path:    '/admin (Sellers)',
          risk:    'red',
          riskWhy: "Approving or rejecting a seller application is an account-level decision that affects the seller's livelihood — it cannot be quietly undone.",
          what: {
            en: 'Review pending sellers and approve or reject one.',
            ar: 'راجِع البائعين المعلّقين ووافِق على أحدهم أو ارفضه.',
          },
        },
        {
          path: '/admin (Products)',
          risk: 'amber',
          what: {
            en: 'Moderate products — approve one and toggle a featured flag.',
            ar: 'راجِع المنتجات — وافِق على أحدها وبدّل وسم «مميّز».',
          },
        },
        {
          path:    '/admin (Disputes)',
          risk:    'red',
          riskWhy: 'Issuing a refund during dispute mediation is irreversible and directly adjusts both wallet balances and product stock.',
          what: {
            en: 'Mediate a dispute and issue a refund — confirm stock and balances adjust.',
            ar: 'توسّط في نزاع وأصدِر استردادًا — تأكّد من تعديل المخزون والأرصدة.',
          },
        },
        {
          path: '/admin (Coupons)',
          risk: 'amber',
          what: {
            en: 'Create a coupon and confirm the rules save.',
            ar: 'أنشئ قسيمة وتأكّد من حفظ شروطها.',
          },
        },
        {
          path:    '/admin (Users)',
          risk:    'red',
          riskWhy: 'Banning or suspending a user immediately revokes their access across all roles — reversal requires explicit admin action.',
          what: {
            en: 'Search users and try banning / suspending one (then undo).',
            ar: 'ابحث عن مستخدمين وجرّب حظر/إيقاف أحدهم (ثم تراجَع).',
          },
        },
        {
          path: '/admin (Analytics)',
          risk: 'green',
          what: {
            en: 'Skim platform-wide analytics and confirm numbers render.',
            ar: 'تصفّح تحليلات المنصّة وتأكّد من ظهور الأرقام.',
          },
        },
      ],
    },

    // ── SUPERADMIN lane (1 step: 0 red / 1 amber / 0 green) ────────────────
    {
      id:    'superadmin',
      color: '#4D1F2D',
      role:  { en: 'Super admin', ar: 'المشرف الأعلى' },
      steps: [
        {
          path: '/admin (Collections)',
          risk: 'amber',
          what: {
            en: 'Open the super-admin-only Collections editor and curated settings — confirm changes save.',
            ar: 'افتح محرّر المجموعات والإعدادات المنسّقة (للمشرف الأعلى فقط) — وتأكّد من حفظ التغييرات.',
          },
        },
      ],
    },

  ],

  // ── AI agent preamble ─────────────────────────────────────────────────────
  // This block is embedded verbatim in the export's notes.md preamble so the
  // receiving coding agent already knows the project before reading any point.
  preamble: {
    projectName: 'Stitch & Sell',
    oneLiner:    'Iraqi handmade-goods marketplace — buyers, multi-seller storefronts, live workshops, and monthly craft challenges.',
    stack:       'Next.js 14 App Router · TypeScript · Prisma · PostgreSQL · Tailwind CSS · NextAuth',
    runCommands: [
      'npm run dev        # start the Next.js dev server on :3000',
      'npm run db:seed    # seed test users, seller stores, products, and orders',
    ],
    conventions: [
      'React Server Components live in app/(routes)/; all client components are in src/components/<Domain>/',
      'API routes use the App Router convention: src/app/api/<resource>/route.ts',
      'Prisma schema is in prisma/schema.prisma — run `npx prisma generate` after any schema change',
      'All monetary values are stored as integers (Iraqi fils); display as IQD by dividing by 1000',
      'Phone numbers are the primary login identifier — Iraqi mobile format 07XXXXXXXXX',
      'RTL is toggled globally via a lang="ar" attribute on <html>; never use direction inline styles',
    ],
    invariants: [
      'All prices and wallet/loyalty balances must always be >= 0 — never allow negative values',
      'Checkout requires a confirmed authentication session — the auth guard must never be bypassed',
      'Order status transitions are strictly one-directional: pending → processing → shipped → delivered → completed',
      '"Confirm received" and payout requests are user-irreversible — always require an explicit confirmation dialog',
      'Admin dispute resolutions must record the admin ID, resolution type, and timestamp in the audit log',
      'Sellers cannot access buyer PII beyond the delivery address of their own fulfilled orders',
    ],
    verifySteps: [
      'Run `npm run dev` and navigate to the page listed in the annotation',
      'Log in with the relevant role credential from the Login Context table',
      'Reproduce the original issue to confirm it existed before your change',
      'Apply your fix and verify the issue is resolved without breaking adjacent flows',
      'For any red-zone change: add a `// QA: red-zone change — reviewed <date>` comment near the changed code',
      'Check the browser console for new errors introduced by the change',
    ],
    additionalContext:
      'The app is fully bilingual (English / Arabic) with RTL layout support. ' +
      'Test any UI change in both language modes by toggling the language switcher. ' +
      'Seller payouts are processed in nightly batches — never test payout processing in production. ' +
      'The Super admin role is not seeded; create it manually via the database if needed.',
  },
};

export default config;
