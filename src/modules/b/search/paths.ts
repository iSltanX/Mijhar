// أين يوجد العنصر في واجهة GitHub (F-B6): مسار التبويب أو الصفحة لكل «نوع صفحة» في توقيع المدخل (PAGE_KINDS في schema.mjs). يُعرض حين لا يُعثر
// على العنصر في الصفحة الحالية. النص وصف بالتنقل لا رابط: المسار الفعلي يحتاج اسم المستودع أو المستخدم ولا يخمّنه مِجهَر.
import type { GlossaryEntry, PageKind } from '../../../data/glossary/types';

export const PAGE_KIND_PATHS: Readonly<Record<PageKind, string>> = {
  any: 'الشريط العلوي أو عناصر تتكرر في أغلب صفحات GitHub',
  dashboard: 'الصفحة الرئيسية بعد تسجيل الدخول (Dashboard)',
  profile: 'صفحة الملف الشخصي لمستخدم أو منظمة (Profile)',
  'repo-home': 'صفحة المستودع الرئيسية — تبويب Code',
  'repo-files': 'تبويب Code داخل المستودع — شجرة الملفات أو عرض ملف',
  issues: 'تبويب Issues في المستودع',
  issue: 'داخل مشكلة (Issue) مفتوحة',
  'pull-requests': 'تبويب Pull requests في المستودع',
  'pull-request': 'داخل طلب سحب (Pull request) مفتوح',
  actions: 'تبويب Actions في المستودع',
  releases: 'صفحة Releases في المستودع',
  security: 'تبويب Security في المستودع',
  insights: 'تبويب Insights في المستودع',
  'settings-repo': 'تبويب Settings في المستودع (إعدادات المستودع)',
  'settings-account': 'إعدادات الحساب — Settings من قائمة صورتك الشخصية',
  search: 'صفحة نتائج البحث',
  notifications: 'صفحة الإشعارات (Notifications)',
  'new-repo': 'صفحة إنشاء مستودع جديد (New repository)',
};

export interface Where {
  /** عنصر بتوقيع في الواجهة، أو مفهوم عام لا يقابله عنصر محدد. */
  readonly kind: 'element' | 'concept';
  readonly paths: readonly string[];
}

/** مسارات وجود المدخل بترتيب توقيعه؛ المفهوم العام بلا مسارات. */
export function whereIs(entry: GlossaryEntry): Where {
  if (entry.kind !== 'element' || !entry.signature) return { kind: 'concept', paths: [] };
  return { kind: 'element', paths: [...new Set(entry.signature.pages.map((kind) => PAGE_KIND_PATHS[kind]))] };
}
