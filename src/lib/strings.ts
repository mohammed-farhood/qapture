/**
 * strings.ts — UI text for qapture in English + Arabic.
 *
 * translate(lang, key, vars?) → resolves a key, falling back to English then
 * the raw key, and interpolates {placeholders}.
 * pick(value, lang) → resolves a bilingual config value ({en,ar}) or a plain string.
 *
 * Ported from qa-overlay/strings.js — all keys preserved, no behaviour change.
 */

import type { QaBilingual } from '../config/schema';

// ---------------------------------------------------------------------------
// String map
// ---------------------------------------------------------------------------

type LangMap = {
  tab_notes: string;
  tab_logins: string;
  tab_guide: string;
  export: string;
  delete_all_q: string;
  yes: string;
  no: string;
  clear_all: string;
  capture_cta: string;
  quick_note: string;
  desc_placeholder: string;
  image_hint: string;
  add_point: string;
  cancel: string;
  save: string;
  edit: string;
  remove_image: string;
  add_image: string;
  no_points: string;
  no_points_hint: string;
  kind_note: string;
  kind_element: string;
  kind_region: string;
  cap_click: string;
  cap_drag: string;
  sel_region: string;
  sel_element: string;
  capturing: string;
  no_shot: string;
  annotate_placeholder: string;
  save_point: string;
  reselect: string;
  save_hint: string;
  login_with: string;
  used_count: string;
  used: string;
  loc_captured: string;
  loc_show: string;
  loc_hide: string;
  loc_locate: string;
  journey_title: string;
  journey_generic: string;
  export_name_title: string;
  export_name_placeholder: string;
  tap_element: string;
  draw_region: string;
  use_this: string;
  adjust: string;
  resize: string;
  confirm_region: string;
  // — v0.3 "Graphite" —
  capture_failed: string;
  retry: string;
  persist_failed: string;
  note_deleted: string;
  notes_cleared: string;
  undo: string;
  export_done: string;
  export_failed: string;
  copied: string;
  copy_failed: string;
  copy_prompt: string;
  severity_label: string;
  sev_bug: string;
  sev_question: string;
  sev_polish: string;
  status_open: string;
  status_verified: string;
  context_attached: string;
  start_walkthrough: string;
  step_of: string;
  next_step: string;
  prev_step: string;
  mark_pass: string;
  mark_fail: string;
  capture_here: string;
  exit_walkthrough: string;
  evidence_n: string;
  no_evidence: string;
  expected_label: string;
  // — v0.4 "Ledger" —
  exact_label: string;
  exact_hint: string;
  exact_on: string;
  exact_off: string;
  exact_declined: string;
  exact_turn_on: string;
  exact_unsupported: string;
  sync_title: string;
  sync_hint: string;
  sync_choose: string;
  sync_folder: string;
  sync_project: string;
  sync_project_ph: string;
  sync_campaign: string;
  sync_campaign_ph: string;
  sync_tester: string;
  sync_tester_ph: string;
  sync_start: string;
  sync_on: string;
  sync_paused: string;
  sync_stop: string;
  sync_reconnect: string;
  sync_forget: string;
  sync_lost_permission: string;
  sync_write_failed: string;
  sync_unsupported: string;
  sync_zip_mode: string;
  sync_zip_start: string;
  sync_zip_save_now: string;
  sync_zip_saved: string;
  sync_zip_failed: string;
  sync_zip_where: string;
  sync_writing_to: string;
  storage_title: string;
  storage_used: string;
  storage_warn: string;
  storage_critical: string;
  storage_explain: string;
  persist_keep: string;
  persist_granted: string;
  persist_denied: string;
  persist_on: string;
  drop_shots: string;
  screenshots_dropped: string;
  filter_all: string;
  filter_search: string;
  filter_this_page: string;
  filter_none: string;
  filter_clear: string;
  simple_mode: string;
  full_mode: string;
  compact_mode: string;
  expand_card: string;
  collapse_card: string;
  settings: string;
  done: string;
  // — v0.5 "Loop" —
  status_fixed: string;
  retest_queue: string;
  autosave_label: string;
  autosave_hint: string;
  autosave_done: string;
  steps_recorded: string;
  draw_label: string;
  draw_hint: string;
  draw_pen: string;
  draw_arrow: string;
  draw_box: string;
  draw_undo: string;
  draw_clear: string;
  capture_shortcut: string;
  // — v0.5.1 —
  issue_spotted: string;
  issue_capture: string;
  issue_prefill: string;
  error_catcher_label: string;
  error_catcher_hint: string;
  share: string;
  share_now: string;
  share_ready: string;
  share_failed: string;
  retest_now: string;
  retest_done: string;
  retest_failed: string;
  retest_not_found: string;
  before_label: string;
  after_label: string;
  welcome_title: string;
  welcome_capture: string;
  welcome_say: string;
  welcome_safe: string;
  welcome_got_it: string;
  // — v0.6 —
  select_mode: string;
  selected_n: string;
  select_all: string;
  select_clear: string;
  bulk_delete: string;
  bulk_updated: string;
  bulk_deleted: string;
  view_compact: string;
  view_comfortable: string;
  dock_move: string;
  panel_collapse: string;
  panel_expand: string;
  capture_screen: string;
  // — v0.7 "Walk" —
  walk_title: string;
  walk_take_me: string;
  walk_reload_hint: string;
  walk_note_title: string;
  walk_still_broken: string;
  walk_finish: string;
  walk_notes: string;
  mark_na: string;
  mark_na_hint: string;
  severity_keys: string;
};

export type StrKey = keyof LangMap;

export const STR: Record<'en' | 'ar', LangMap> = {
  en: {
    tab_notes:             'Notes',
    tab_logins:            'Logins',
    tab_guide:             'Guide',
    export:                'Export',
    delete_all_q:          'Delete all {n}?',
    yes:                   'Yes',
    no:                    'No',
    clear_all:             'Clear all points',
    capture_cta:           'Capture from page',
    quick_note:            'quick note (no selection)',
    desc_placeholder:      'Describe the change / bug / idea…',
    image_hint:            'paste, drag, or click to add an image',
    add_point:             'Add point',
    cancel:                'Cancel',
    save:                  'Save',
    edit:                  'Edit',
    remove_image:          'Remove image',
    add_image:             'Add image',
    no_points:             'No points yet.',
    no_points_hint:        'Hit "{cta}" to start.',
    kind_note:             'note',
    kind_element:          'element',
    kind_region:           'region',
    cap_click:             'Click an element',
    cap_drag:              'Drag to draw a region',
    sel_region:            'Region selected',
    sel_element:           'Element selected',
    capturing:             'capturing screenshot…',
    no_shot:               'no screenshot (location saved)',
    annotate_placeholder:  'What do you want to do here? (add / remove / change…)',
    save_point:            'Save point',
    reselect:              'Reselect',
    save_hint:             '⌘/Ctrl + Enter to save',
    login_with:            'Log in with {field} + password.',
    used_count:            '{n}/{m} used',
    used:                  'used',
    loc_captured:          'Place captured',
    loc_show:              'Show captured location',
    loc_hide:              'Hide location',
    loc_locate:            'Locate on page',
    journey_title:         'Testing journey',
    journey_generic:       'No test plan was set up for this project, so this is a general one that fits any app. Work through it, or ask whoever set up Qapture to add the real journey to qa.config.',
    export_name_title:     'Name your export',
    export_name_placeholder: 'file name',
    tap_element:           'Tap an element',
    draw_region:           'Draw region',
    use_this:              'Use this',
    adjust:                'Adjust',
    resize:                'Resize',
    confirm_region:        'Confirm region',
    capture_failed:        'Screenshot failed',
    retry:                 'Retry',
    persist_failed:        'Storage full — this note may not survive a reload',
    note_deleted:          'Note deleted',
    notes_cleared:         'All notes cleared',
    undo:                  'Undo',
    export_done:           'Export downloaded',
    export_failed:         'Export failed',
    copied:                'Copied',
    copy_failed:           'Copy failed',
    copy_prompt:           'Copy as agent prompt',
    severity_label:        'Severity',
    sev_bug:               'Bug',
    sev_question:          'Question',
    sev_polish:            'Polish',
    status_open:           'Open',
    status_verified:       'Verified',
    context_attached:      '{n} runtime events attached',
    start_walkthrough:     'Start walkthrough',
    step_of:               'Step {n} of {m}',
    next_step:             'Next',
    prev_step:             'Back',
    mark_pass:             'Pass',
    mark_fail:             'Fail',
    capture_here:          'Capture here',
    exit_walkthrough:      'Exit',
    evidence_n:            '{n} attached',
    no_evidence:           'ticked, no capture',
    expected_label:        'Expected',
    exact_label:           'Pixel-exact shots',
    exact_hint:            'Screenshots become a real photo of the tab instead of a redraw. Asks once to share this tab; nothing leaves your device.',
    exact_on:              'Pixel-exact screenshots on',
    exact_off:            'Back to redrawn screenshots',
    exact_declined:        'Staying on redrawn screenshots',
    exact_turn_on:         'Turn on',
    exact_unsupported:     'Needs Chrome, Edge or Brave on desktop',
    sync_title:            'Save to a folder',
    sync_hint:             'Every note is written to your disk the moment you save it — nothing is lost if this browser dies.',
    sync_choose:           'Choose folder',
    sync_folder:           'Folder',
    sync_project:          'Project',
    sync_project_ph:       'e.g. Project X',
    sync_campaign:         'Campaign',
    sync_campaign_ph:      'e.g. checkout smoke test',
    sync_tester:           'Tester (optional)',
    sync_tester_ph:        'your name',
    sync_start:            'Start saving here',
    sync_on:               'Saving to {path}',
    sync_paused:           'Stopped saving to the folder',
    sync_stop:             'Stop',
    sync_reconnect:        'Reconnect folder',
    sync_forget:           'Forget folder',
    sync_lost_permission:  'Folder access expired — click Reconnect to keep saving',
    sync_write_failed:     "Couldn't write to the folder — notes are still saved in this browser",
    sync_unsupported:      'Folder saving needs Chrome, Edge or Brave on desktop. Use Export here.',
    sync_zip_mode:         'This browser cannot write into a folder directly, so Qapture builds the folder for you: name the project and campaign, and you get a zip that unzips into exactly that structure. It refreshes itself every few points.',
    sync_zip_start:        'Start saving',
    sync_zip_save_now:     'Save folder now',
    sync_zip_saved:        'Saved {name} to your downloads',
    sync_zip_failed:       "Couldn't build the folder — your notes are still safe in this browser",
    sync_zip_where:        'Unzip into your QA folder:',
    sync_writing_to:       'Writing to',
    storage_title:         'Storage',
    storage_used:          '{used} of {quota} used',
    storage_warn:          'This browser is running low on space for saved notes. Export now, or turn on folder saving.',
    storage_critical:      'Almost out of browser storage — new notes may not survive a reload. Export now.',
    storage_explain:       'Notes live in YOUR browser, not on the server. Each browser caps how much a site may store.',
    persist_keep:          'Ask browser to keep my notes',
    persist_granted:       'Browser will keep your notes',
    persist_denied:        "Browser wouldn't promise to keep them — use folder saving or export often",
    persist_on:            'Protected from auto-cleanup',
    drop_shots:            'Free space: drop screenshots, keep notes',
    screenshots_dropped:   '{n} screenshot(s) removed — notes kept',
    filter_all:            'All',
    filter_search:         'Search notes…',
    filter_this_page:      'This page',
    filter_none:           'No notes match this filter.',
    filter_clear:          'Clear filter',
    simple_mode:           'Simple mode',
    full_mode:             'Full mode',
    compact_mode:          'Small capture box',
    expand_card:           'Show full card',
    collapse_card:         'Shrink',
    settings:              'Settings',
    done:                  'Done',
    status_fixed:          'Re-test',
    retest_queue:          '{n} waiting to be re-tested',
    autosave_label:        'Auto-save a backup',
    autosave_hint:         'Downloads a backup every {n} notes, so a closed tab costs you nothing. Pauses on its own while folder saving is running.',
    autosave_done:         'Backup saved ({n} notes)',
    steps_recorded:        '{n} steps recorded',
    draw_label:            'Draw on it',
    draw_hint:             'Drag to mark the screenshot',
    draw_pen:              'Pen',
    draw_arrow:            'Arrow',
    draw_box:              'Box',
    draw_undo:             'Undo',
    draw_clear:            'Clear',
    capture_shortcut:      'Shortcut: {keys}',
    issue_spotted:         'Something just broke on this page',
    issue_capture:         'Capture it',
    issue_prefill:         'Error seen',
    error_catcher_label:   'Tell me when something breaks',
    error_catcher_hint:    'Offers a one-tap capture when the page throws an error or a request fails — including the ones you did not notice.',
    share:                 'Share',
    share_now:             'Share now',
    share_ready:           'Your notes are packed and ready to send',
    share_failed:          "Couldn't share — downloaded instead",
    retest_now:            'Re-test now',
    retest_done:           'Re-shot — compare below',
    retest_failed:         "Couldn't re-shoot this one",
    retest_not_found:      "Can't find that spot on this page — open the right page first",
    before_label:          'Before',
    after_label:           'After',
    welcome_title:         'Testing {brand}',
    welcome_capture:       'Click "Capture from page", then click whatever looks wrong.',
    welcome_say:           'Say what you expected in your own words. A screenshot is taken for you.',
    welcome_safe:          'Everything saves as you go — you cannot lose it.',
    welcome_got_it:        'Got it',
    select_mode:           'Select',
    selected_n:            '{n} selected',
    select_all:            'Select all',
    select_clear:          'Clear',
    bulk_delete:           'Delete',
    bulk_updated:          '{n} notes updated',
    bulk_deleted:          '{n} notes deleted',
    view_compact:          'Compact list',
    view_comfortable:      'Full cards',
    dock_move:             'Move to the other side',
    panel_collapse:        'Collapse',
    panel_expand:          'Expand',
    capture_screen:        'Whole screen',
    walk_title:            'Walkthrough',
    walk_take_me:          'Take me to {path}',
    walk_reload_hint:      "Reload the page instead (use this if the app didn't move)",
    walk_note_title:       'Point {n}',
    walk_still_broken:     'Still broken',
    walk_finish:           'Finish',
    walk_notes:            'Walk these',
    mark_na:               'N/A',
    mark_na_hint:          "Doesn't apply to this build",
    severity_keys:         'Alt+1/2/3 for severity',
  },
  ar: {
    tab_notes:             'الملاحظات',
    tab_logins:            'الدخول',
    tab_guide:             'الدليل',
    export:                'تصدير',
    delete_all_q:          'حذف كل {n}؟',
    yes:                   'نعم',
    no:                    'لا',
    clear_all:             'مسح كل النقاط',
    capture_cta:           'التقاط من الصفحة',
    quick_note:            'ملاحظة سريعة (بدون تحديد)',
    desc_placeholder:      'صِف التغيير / الخلل / الفكرة…',
    image_hint:            'الصق أو اسحب أو انقر لإضافة صورة',
    add_point:             'إضافة نقطة',
    cancel:                'إلغاء',
    save:                  'حفظ',
    edit:                  'تعديل',
    remove_image:          'حذف الصورة',
    add_image:             'إضافة صورة',
    no_points:             'لا توجد نقاط بعد.',
    no_points_hint:        'اضغط «{cta}» للبدء.',
    kind_note:             'ملاحظة',
    kind_element:          'عنصر',
    kind_region:           'منطقة',
    cap_click:             'انقر على عنصر',
    cap_drag:              'اسحب لرسم منطقة',
    sel_region:            'تم تحديد منطقة',
    sel_element:           'تم تحديد عنصر',
    capturing:             'يتم التقاط الصورة…',
    no_shot:               'بدون صورة (تم حفظ الموقع)',
    annotate_placeholder:  'ماذا تريد أن تفعل هنا؟ (إضافة / حذف / تغيير…)',
    save_point:            'حفظ النقطة',
    reselect:              'إعادة التحديد',
    save_hint:             '⌘/Ctrl + Enter للحفظ',
    login_with:            'سجّل الدخول بـ {field} + كلمة المرور.',
    used_count:            '{n}/{m} مُستخدَم',
    used:                  'مُستخدَم',
    loc_captured:          'تم التقاط الموقع',
    loc_show:              'إظهار الموقع المُلتقَط',
    loc_hide:              'إخفاء الموقع',
    loc_locate:            'إظهار على الصفحة',
    journey_title:         'رحلة الاختبار',
    journey_generic:       'لم يتم إعداد خطة اختبار لهذا المشروع، لذلك هذه خطة عامة تصلح لأي تطبيق. اعمل بها، أو اطلب ممن ثبّت Qapture أن يضيف رحلة المشروع في qa.config.',
    export_name_title:     'سمِّ ملف التصدير',
    export_name_placeholder: 'اسم الملف',
    tap_element:           'انقر على عنصر',
    draw_region:           'ارسم منطقة',
    use_this:              'استخدم هذا',
    adjust:                'تعديل',
    resize:                'تغيير الحجم',
    confirm_region:        'تأكيد المنطقة',
    capture_failed:        'فشل التقاط الصورة',
    retry:                 'إعادة المحاولة',
    persist_failed:        'مساحة التخزين ممتلئة — قد لا تبقى هذه الملاحظة بعد إعادة التحميل',
    note_deleted:          'تم حذف الملاحظة',
    notes_cleared:         'تم مسح جميع الملاحظات',
    undo:                  'تراجع',
    export_done:           'تم تنزيل الملف',
    export_failed:         'فشل التصدير',
    copied:                'تم النسخ',
    copy_failed:           'فشل النسخ',
    copy_prompt:           'نسخ كموجّه للوكيل',
    severity_label:        'الأهمية',
    sev_bug:               'خلل',
    sev_question:          'سؤال',
    sev_polish:            'تحسين',
    status_open:           'مفتوح',
    status_verified:       'تم التحقق',
    context_attached:      '{n} من أحداث التشغيل مرفقة',
    start_walkthrough:     'ابدأ الجولة',
    step_of:               'الخطوة {n} من {m}',
    next_step:             'التالي',
    prev_step:             'السابق',
    mark_pass:             'نجاح',
    mark_fail:             'فشل',
    capture_here:          'التقط هنا',
    exit_walkthrough:      'خروج',
    evidence_n:            '{n} مرفق',
    no_evidence:           'مُعلّم بدون التقاط',
    expected_label:        'المتوقع',
    exact_label:           'لقطات مطابقة تمامًا',
    exact_hint:            'تصبح اللقطة صورة حقيقية للتبويب بدل إعادة رسمه. يُطلب الإذن مرة واحدة، ولا شيء يغادر جهازك.',
    exact_on:              'تم تفعيل اللقطات المطابقة',
    exact_off:             'العودة إلى اللقطات المُعاد رسمها',
    exact_declined:        'سنبقى على اللقطات المُعاد رسمها',
    exact_turn_on:         'تفعيل',
    exact_unsupported:     'يتطلب Chrome أو Edge أو Brave على سطح المكتب',
    sync_title:            'الحفظ في مجلد',
    sync_hint:             'تُكتب كل ملاحظة على القرص لحظة حفظها — لا شيء يضيع إذا تعطّل المتصفح.',
    sync_choose:           'اختر المجلد',
    sync_folder:           'المجلد',
    sync_project:          'المشروع',
    sync_project_ph:       'مثال: مشروع س',
    sync_campaign:         'الحملة',
    sync_campaign_ph:      'مثال: اختبار الدفع',
    sync_tester:           'المُختبِر (اختياري)',
    sync_tester_ph:        'اسمك',
    sync_start:            'ابدأ الحفظ هنا',
    sync_on:               'يتم الحفظ في {path}',
    sync_paused:           'تم إيقاف الحفظ في المجلد',
    sync_stop:             'إيقاف',
    sync_reconnect:        'إعادة ربط المجلد',
    sync_forget:           'نسيان المجلد',
    sync_lost_permission:  'انتهت صلاحية الوصول للمجلد — اضغط إعادة الربط للمتابعة',
    sync_write_failed:     'تعذّرت الكتابة في المجلد — الملاحظات محفوظة في المتصفح',
    sync_unsupported:      'الحفظ في مجلد يتطلب Chrome أو Edge أو Brave على سطح المكتب. استخدم التصدير هنا.',
    sync_zip_mode:         'هذا المتصفح لا يستطيع الكتابة داخل مجلد مباشرة، لذلك يبني Qapture المجلد نيابةً عنك: اكتب اسم المشروع والحملة، وستحصل على ملف مضغوط يُفَك إلى البنية نفسها تمامًا. ويتحدّث تلقائيًا كل بضع نقاط.',
    sync_zip_start:        'ابدأ الحفظ',
    sync_zip_save_now:     'احفظ المجلد الآن',
    sync_zip_saved:        'تم حفظ {name} في التنزيلات',
    sync_zip_failed:       'تعذّر بناء المجلد — ملاحظاتك ما زالت محفوظة في هذا المتصفح',
    sync_zip_where:        'فُكّ الضغط داخل مجلد QA لديك:',
    sync_writing_to:       'الكتابة إلى',
    storage_title:         'التخزين',
    storage_used:          '{used} من {quota} مستخدَمة',
    storage_warn:          'مساحة المتصفح للملاحظات على وشك النفاد. صدِّر الآن أو فعِّل الحفظ في مجلد.',
    storage_critical:      'المساحة شبه ممتلئة — قد لا تبقى الملاحظات الجديدة بعد إعادة التحميل. صدِّر الآن.',
    storage_explain:       'الملاحظات تُحفظ في متصفحك أنت، لا على الخادم. كل متصفح يحدّد سقفًا لما يخزّنه الموقع.',
    persist_keep:          'اطلب من المتصفح الاحتفاظ بالملاحظات',
    persist_granted:       'سيحتفظ المتصفح بملاحظاتك',
    persist_denied:        'لم يضمن المتصفح الاحتفاظ بها — استخدم الحفظ في مجلد أو صدِّر كثيرًا',
    persist_on:            'محمية من التنظيف التلقائي',
    drop_shots:            'توفير مساحة: حذف الصور مع الإبقاء على الملاحظات',
    screenshots_dropped:   'تم حذف {n} صورة — والملاحظات باقية',
    filter_all:            'الكل',
    filter_search:         'ابحث في الملاحظات…',
    filter_this_page:      'هذه الصفحة',
    filter_none:           'لا ملاحظات تطابق هذا التصفية.',
    filter_clear:          'مسح التصفية',
    simple_mode:           'الوضع المبسّط',
    full_mode:             'الوضع الكامل',
    compact_mode:          'صندوق التقاط صغير',
    expand_card:           'إظهار البطاقة الكاملة',
    collapse_card:         'تصغير',
    settings:              'الإعدادات',
    done:                  'تم',
    status_fixed:          'إعادة اختبار',
    retest_queue:          '{n} بانتظار إعادة الاختبار',
    autosave_label:        'حفظ نسخة احتياطية تلقائيًا',
    autosave_hint:         'ينزّل نسخة احتياطية كل {n} ملاحظات، فلا يكلّفك إغلاق التبويب شيئًا. يتوقف تلقائيًا أثناء الحفظ في مجلد.',
    autosave_done:         'تم حفظ نسخة احتياطية ({n} ملاحظة)',
    steps_recorded:        'تم تسجيل {n} خطوة',
    draw_label:            'ارسم عليها',
    draw_hint:             'اسحب للتعليم على الصورة',
    draw_pen:              'قلم',
    draw_arrow:            'سهم',
    draw_box:              'مربع',
    draw_undo:             'تراجع',
    draw_clear:            'مسح',
    capture_shortcut:      'الاختصار: {keys}',
    issue_spotted:         'حدث خلل للتو في هذه الصفحة',
    issue_capture:         'التقطه',
    issue_prefill:         'خطأ ظهر',
    error_catcher_label:   'أخبرني عند حدوث خلل',
    error_catcher_hint:    'يعرض التقاطًا بضغطة واحدة عند حدوث خطأ أو فشل طلب — حتى ما لم تلاحظه.',
    share:                 'مشاركة',
    share_now:             'شارك الآن',
    share_ready:           'ملاحظاتك جاهزة للإرسال',
    share_failed:          'تعذّرت المشاركة — تم التنزيل بدلًا من ذلك',
    retest_now:            'أعد الاختبار الآن',
    retest_done:           'تم التقاط صورة جديدة — قارن بالأسفل',
    retest_failed:         'تعذّر التقاط صورة جديدة',
    retest_not_found:      'تعذّر إيجاد ذلك الموضع في هذه الصفحة — افتح الصفحة الصحيحة أولًا',
    before_label:          'قبل',
    after_label:           'بعد',
    welcome_title:         'اختبار {brand}',
    welcome_capture:       'اضغط «التقاط من الصفحة» ثم اضغط على ما يبدو خاطئًا.',
    welcome_say:           'اكتب ما كنت تتوقعه بكلماتك. تُلتقط الصورة تلقائيًا.',
    welcome_safe:          'كل شيء يُحفظ أولًا بأول — لن تفقد شيئًا.',
    welcome_got_it:        'فهمت',
    select_mode:           'تحديد',
    selected_n:            'تم تحديد {n}',
    select_all:            'تحديد الكل',
    select_clear:          'إلغاء التحديد',
    bulk_delete:           'حذف',
    bulk_updated:          'تم تحديث {n} ملاحظة',
    bulk_deleted:          'تم حذف {n} ملاحظة',
    view_compact:          'قائمة مختصرة',
    view_comfortable:      'بطاقات كاملة',
    dock_move:             'انقل إلى الجهة الأخرى',
    panel_collapse:        'طيّ',
    panel_expand:          'توسيع',
    capture_screen:        'الشاشة كاملة',
    walk_title:            'الجولة',
    walk_take_me:          'خذني إلى {path}',
    walk_reload_hint:      'أعد تحميل الصفحة بدلًا من ذلك (استخدمه إذا لم ينتقل التطبيق)',
    walk_note_title:       'النقطة {n}',
    walk_still_broken:     'ما زال معطلًا',
    walk_finish:           'إنهاء',
    walk_notes:            'تجوّل فيها',
    mark_na:               'لا ينطبق',
    mark_na_hint:          'لا ينطبق على هذه النسخة',
    severity_keys:         'Alt+1/2/3 لتحديد الأهمية',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a string key in the given language (falls back to EN then raw key),
 * then interpolate `{placeholder}` variables from the optional vars map.
 */
export function translate(
  lang: string,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const map = STR[lang as 'en' | 'ar'] ?? STR.en;
  const s: string = (map as Record<string, string>)[key] ?? (STR.en as Record<string, string>)[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

/**
 * Resolve a bilingual config value `({en, ar})` or a plain string.
 * Returns '' for null/undefined.
 */
export function pick(value: QaBilingual | null | undefined, lang: string): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang as 'ar'] ?? value.en ?? '';
}
