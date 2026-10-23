// المرادفات المعرَّفة للبحث (F-B6 / AC-B6). ثلاثة مصادر، وكلها محلية بلا شبكة:
//  1. معجم القاموس (src/data/glossary/lexicon.json): الصيغ العربية غير المعتمدة التي وُجدت في المصدر (variants) والأسماء البديلة (aliases)
//     لكل مصطلح، تُربط بالمدخل الذي يطابق اسمه الإنجليزي اسم المصطلح تمامًا (المخزن ← المستودع، PR ← طلب السحب).
//  2. جدول EXTRA أدناه: كتابة المصطلحات الإنجليزية بحروف عربية (كوميت وفورك وبرانش…) وأسماء شائعة بديلة (مخزن وبول ريكويست…).
//     كل مفتاح معرّف مدخل موجود، ويتحقق اختبار البحث من ذلك فلا يبقى مرادف يتيم إن تغيّر القاموس.
//  3. تسمية العنصر كما تعرضها واجهة GitHub (signature.labels)، فيُعثر على «Settings» بنصها كما يراه المستخدم على الصفحة.
import lexicon from '../../../data/glossary/lexicon.json';
import type { GlossaryEntry, Lexicon } from '../../../data/glossary/types';

export const EXTRA_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  repository: ['ريبو', 'ريبوزيتوري', 'مخزن', 'repo'],
  commit: ['كوميت', 'تعديل محفوظ', 'تثبيت'],
  branch: ['برانش', 'فرع'],
  pull_request: ['بول ريكويست', 'طلب دمج', 'طلب جذب', 'PR', 'MR'],
  issue: ['ايشو', 'قضية', 'بلاغ', 'مشكلة'],
  release: ['ريليز', 'اصدار', 'نسخة'],
  tag: ['تاج', 'وسم', 'علامة اصدار'],
  fork: ['فورك', 'تفريع', 'نسخة متفرعة', 'نسخ مستودع'],
  star: ['ستار', 'نجمة', 'تفضيل', 'اعجاب'],
  watch: ['ووتش', 'متابعة', 'مراقبة', 'اشعارات المستودع'],
  workflow: ['ووركفلو', 'سير عمل', 'مسار عمل'],
  action: ['اكشن', 'اجراء الي'],
  merge_conflict: ['تعارض', 'كونفلكت', 'تعارض دمج'],
  force_push: ['فورس بوش', 'دفع قسري', 'دفع اجباري', 'push -f', 'force'],
  squash_merge: ['سكواش', 'دمج مضغوط', 'دمج مع ضغط'],
  rebase_merge: ['ريبيس', 'دمج باعادة التأسيس'],
  rebase: ['ريبيس', 'اعادة تاسيس'],
  merge_commit: ['ميرج', 'التزام دمج'],
  readme: ['ريدمي', 'اقرأني', 'ملف التعريف بالمشروع'],
  license: ['رخصة', 'ترخيص', 'لايسنس'],
  webhook: ['ويب هوك', 'خطاف ويب', 'ربط ويب'],
  two_factor: ['2fa', 'تحقق بخطوتين', 'مصادقة ثنائية', 'التحقق الثنائي'],
  ssh_key: ['مفتاح ssh', 'مفتاح اس اس اتش'],
  personal_access_token: ['pat', 'توكن', 'رمز وصول', 'رمز وصول شخصي'],
  fine_grained_token: ['توكن دقيق', 'رمز وصول دقيق'],
  clone_https: ['استنساخ', 'كلون', 'نسخ المستودع الى جهازي'],
  clone_ssh: ['استنساخ ssh', 'كلون ssh'],
  download_zip: ['تنزيل', 'تحميل', 'ملف مضغوط', 'zip'],
  delete_repo: ['حذف مستودع', 'مسح مستودع', 'ازالة مستودع'],
  archive_repo: ['ارشفة', 'تجميد مستودع'],
  transfer_ownership: ['نقل ملكية', 'تحويل ملكية'],
  branch_protection: ['حماية الفرع', 'قواعد حماية'],
  codespaces: ['كودسبيس', 'بيئة سحابية للتطوير'],
  pages_deploy: ['بيدجز', 'استضافة موقع', 'نشر موقع'],
  secrets_var: ['اسرار', 'متغيرات سرية', 'سيكريت'],
  dependabot_alerts: ['ديبندابوت', 'تنبيهات الاعتماديات'],
  collaborator: ['متعاون', 'مشارك', 'كولابوريتور'],
  close_issue: ['اغلاق مشكلة', 'اقفال ايشو'],
  draft_pull_request: ['مسودة طلب سحب', 'درافت'],
  pr_review: ['مراجعة', 'ريفيو', 'مراجعة الكود'],
  'repo-tab-settings': ['اعدادات المستودع', 'الاعدادات'],
  'repo-tab-code': ['الشيفرة', 'الكود', 'الملفات'],
  'repo-tab-pulls': ['طلبات السحب', 'طلبات الدمج'],
  'repo-tab-issues': ['المشكلات', 'البلاغات'],
  'repo-tab-actions': ['الاتمتة', 'سير العمل'],
  'nav-search': ['بحث', 'سيرش', 'ابحث'],
  'nav-notifications': ['اشعارات', 'تنبيهات'],
};

export interface SynonymSources {
  readonly lexicon?: Lexicon;
  readonly extra?: Readonly<Record<string, readonly string[]>>;
}

const lowerEn = (entry: GlossaryEntry): string => entry.en.trim().toLowerCase();

/** كل مرادفات المدخل من المصادر الثلاثة بلا تكرار (النص خامًا؛ التوحيد في الفهرس). */
export function synonymsFor(entry: GlossaryEntry, sources: SynonymSources = {}): string[] {
  const lex = sources.lexicon ?? (lexicon as unknown as Lexicon);
  const extra = sources.extra ?? EXTRA_SYNONYMS;
  const out = new Set<string>();
  for (const term of lex.terms) {
    if (term.en.trim().toLowerCase() !== lowerEn(entry)) continue;
    out.add(term.ar);
    for (const variant of term.variants) out.add(variant);
    for (const alias of term.aliases ?? []) out.add(alias);
  }
  for (const synonym of extra[entry.id] ?? []) out.add(synonym);
  for (const label of entry.signature?.labels ?? []) out.add(label);
  return [...out];
}
