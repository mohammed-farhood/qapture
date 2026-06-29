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
  export_name_title: string;
  export_name_placeholder: string;
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
    export_name_title:     'Name your export',
    export_name_placeholder: 'file name',
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
    export_name_title:     'سمِّ ملف التصدير',
    export_name_placeholder: 'اسم الملف',
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
