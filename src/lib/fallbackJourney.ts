/**
 * fallbackJourney.ts — the test plan shown when the project didn't supply one.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * `journey` is optional config. When a project is set up without one — which
 * is the common case, because whoever installed the widget was focused on
 * getting it to render — the Guide tab rendered a single centred word: its own
 * title, over empty space. A tester opening it learned nothing: not what the
 * tab was for, not that anything was missing, not what to do instead. The tool
 * silently asked them to invent a test plan and gave them a blank page to do
 * it on.
 *
 * A generic plan is strictly better than nothing, because the great majority
 * of real bugs are not domain-specific. Nobody needs to know what the app
 * sells to check that a form rejects bad input, that the back button works, or
 * that the layout survives a narrow window — and those are exactly the checks
 * an untrained beta tester skips.
 *
 * So the Guide is never empty. If a project defines a journey, that is used
 * unchanged. Otherwise this one appears, labelled as generic so nobody mistakes
 * it for something written for their project, with a pointer to how to replace
 * it.
 *
 * ON `path: '*'`
 * --------------
 * A step's path normally names the page to test. These steps apply wherever
 * the tester happens to be, so they use '*' — treated as "this page" by the
 * Walk, which then offers no "take me there" button rather than trying to
 * navigate somewhere that doesn't exist.
 */

import type { QaJourneyLane } from '../config/schema';

/** A step path meaning "wherever the tester currently is". */
export const ANY_PAGE = '*';

/**
 * Ordered roughly by how a real session goes: does it load, can you move
 * around, does the main thing work, does it survive being used badly, does it
 * survive being reloaded, does it work small.
 */
export const FALLBACK_JOURNEY: QaJourneyLane[] = [
  {
    id: 'first-run',
    role: { en: 'First look', ar: 'النظرة الأولى' },
    steps: [
      {
        path: ANY_PAGE,
        what: { en: 'Open the app fresh and let it finish loading', ar: 'افتح التطبيق من جديد واتركه يكمل التحميل' },
        expect: {
          en: 'Content appears, nothing flashes or jumps, no error in the corner',
          ar: 'يظهر المحتوى دون وميض أو قفز، وبدون رسالة خطأ',
        },
        risk: 'red',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Read the first screen as a new user would', ar: 'اقرأ الشاشة الأولى بعين مستخدم جديد' },
        expect: {
          en: 'It is obvious what this is and what to do next',
          ar: 'واضح ما هذا وما الخطوة التالية',
        },
        risk: 'amber',
      },
    ],
  },
  {
    id: 'moving-around',
    role: { en: 'Moving around', ar: 'التنقل' },
    steps: [
      {
        path: ANY_PAGE,
        what: { en: 'Visit every item in the main menu', ar: 'افتح كل عنصر في القائمة الرئيسية' },
        expect: { en: 'Each one opens the page it names — no blank screens', ar: 'كل عنصر يفتح صفحته — بدون شاشات فارغة' },
        risk: 'red',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Press the browser Back button after moving', ar: 'اضغط زر الرجوع في المتصفح بعد التنقل' },
        expect: { en: 'You land where you were, with your place kept', ar: 'تعود إلى حيث كنت مع بقاء موضعك' },
        risk: 'amber',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Reload the page you are on', ar: 'أعد تحميل الصفحة الحالية' },
        expect: { en: 'The same page comes back, still signed in', ar: 'تعود الصفحة نفسها ويبقى تسجيل الدخول' },
        risk: 'red',
      },
    ],
  },
  {
    id: 'the-main-thing',
    role: { en: 'The main thing', ar: 'المهمة الأساسية' },
    steps: [
      {
        path: ANY_PAGE,
        what: {
          en: 'Do what this app is for, start to finish, without shortcuts',
          ar: 'نفّذ الغرض الأساسي من التطبيق من البداية للنهاية دون اختصارات',
        },
        expect: { en: 'It completes, and you are told clearly that it did', ar: 'تكتمل المهمة ويصلك تأكيد واضح' },
        risk: 'red',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Do it a second time with different choices', ar: 'كررها مرة ثانية بخيارات مختلفة' },
        expect: { en: 'Same result, nothing left over from the first run', ar: 'النتيجة نفسها، دون بقايا من المحاولة الأولى' },
        risk: 'amber',
      },
    ],
  },
  {
    id: 'when-it-goes-wrong',
    role: { en: 'When it goes wrong', ar: 'عند الخطأ' },
    steps: [
      {
        path: ANY_PAGE,
        what: { en: 'Submit a form empty, then with obviously wrong values', ar: 'أرسل النموذج فارغًا ثم بقيم خاطئة بوضوح' },
        expect: {
          en: 'It refuses politely and says which field and why — it does not crash or save',
          ar: 'يرفض بلطف ويوضح الحقل والسبب — دون تعطل أو حفظ',
        },
        risk: 'red',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Press the main button twice, quickly', ar: 'اضغط الزر الرئيسي مرتين بسرعة' },
        expect: { en: 'One result, not two', ar: 'نتيجة واحدة لا اثنتان' },
        risk: 'amber',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Open a page you should not be allowed to see', ar: 'افتح صفحة لا يُفترض أن تصل إليها' },
        expect: { en: 'You are turned away, not shown someone else’s data', ar: 'يتم منعك، ولا تظهر بيانات شخص آخر' },
        risk: 'red',
      },
    ],
  },
  {
    id: 'on-a-phone',
    role: { en: 'On a phone', ar: 'على الهاتف' },
    steps: [
      {
        path: ANY_PAGE,
        what: { en: 'Make the window narrow, or open it on a phone', ar: 'صغّر النافذة أو افتحه على الهاتف' },
        expect: {
          en: 'Nothing is cut off, nothing overlaps, no sideways scrolling',
          ar: 'لا شيء مقصوص أو متداخل، وبدون تمرير جانبي',
        },
        risk: 'amber',
      },
      {
        path: ANY_PAGE,
        what: { en: 'Tap the small controls with a thumb', ar: 'اضغط العناصر الصغيرة بإبهامك' },
        expect: { en: 'They are big enough to hit first time', ar: 'كبيرة بما يكفي للضغط من أول مرة' },
        risk: 'green',
      },
    ],
  },
];
