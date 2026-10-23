// بيانات يعلنها صاحب الحساب (F-H6): تُقرأ من الصفحة وتُعرض حرفيًا كما كتبها صاحبها، ولا يُشتق منها شيء.
// هذا الملف و(profile-dom.ts) الموضعان الوحيدان في الوحدة اللذان يمسّان حقول الحساب (الاسم واسم المستخدم والموقع والنبذة)،
// وليس فيهما ما يحسب لغة أو جنسية أو هوية. الوصف العربي للمشاريع يُحسب من نصوصها في content.ts دون أي حقل حساب.
import { isArabicContent } from './content';
import { ARABIC_CONTENT_NOTICE, ARABIC_CONTENT_TITLE, DECLARED_NOTICE, DECLARED_TITLE } from './notices';

export type DeclaredField = 'name' | 'location' | 'bio';

export interface AccountFields {
  readonly login: string;
  readonly name: string | null;
  readonly location: string | null;
  readonly bio: string | null;
}

export interface DeclaredEntry {
  readonly field: DeclaredField;
  readonly label: string;
  /** النص كما كتبه صاحب الحساب، بلا أي تعديل. */
  readonly text: string;
}

const LABELS: Readonly<Record<DeclaredField, string>> = { name: 'الاسم المعروض', location: 'الموقع', bio: 'النبذة' };
const ORDER: readonly DeclaredField[] = ['name', 'location', 'bio'];

/** الحقول المعلنة غير الفارغة، حرفيًا. اسم المستخدم لا يدخل: ليس بيانًا معلنًا للعرض هنا. */
export function declaredEntries(account: AccountFields): DeclaredEntry[] {
  const entries: DeclaredEntry[] = [];
  for (const field of ORDER) {
    const text = account[field];
    if (typeof text === 'string' && text.trim() !== '') entries.push({ field, label: LABELS[field], text });
  }
  return entries;
}

export interface ProjectText {
  /** مسار المشروع owner/repo. */
  readonly repo: string;
  readonly description: string;
}

export interface ContentFinding {
  readonly repo: string;
  readonly label: typeof ARABIC_CONTENT_TITLE;
}

export interface AccountView {
  /** «محتوى عربي»: من نصوص المشاريع وحدها. */
  readonly content: { readonly title: string; readonly notice: string; readonly findings: readonly ContentFinding[] };
  /** «بيانات يعلنها صاحب الحساب»: حرفيًا. */
  readonly declared: { readonly title: string; readonly notice: string; readonly entries: readonly DeclaredEntry[] };
}

/** يبني العرضين المنفصلين. `findings` لا تتأثر بحقول الحساب مطلقًا (يثبته الاختبار بتبديل الحقول). */
export function buildAccountView(account: AccountFields, projects: readonly ProjectText[]): AccountView {
  return {
    content: {
      title: ARABIC_CONTENT_TITLE,
      notice: ARABIC_CONTENT_NOTICE,
      findings: projects.filter((p) => isArabicContent(p.description)).map((p) => ({ repo: p.repo, label: ARABIC_CONTENT_TITLE })),
    },
    declared: { title: DECLARED_TITLE, notice: DECLARED_NOTICE, entries: declaredEntries(account) },
  };
}
