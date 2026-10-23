// ما تعرضه بطاقة الشرح من حقول المدخل (F-B2 وF-B4): مستويات الشرح الثلاثة، وبطاقة بيانات القرار بحقولها الخمسة:
// متى تُستخدم، الأثر، الحساسية، الصلاحية، إمكانية التراجع وحدودها. لا حقل فارغ ولا قيمة خارج المجموعة المعتمدة (schema.mjs):
// ما لا يثبته المصدر يُكتب «غير محدد في المصدر» بدل التخمين. «الأثر» = brief المدخل: المخطط (T-3.1) لا يحمل حقلًا باسم الأثر،
// وbrief يصف ما يفعله الإجراء (ملخصه)؛ فهو أقرب حقول المدخل إلى «ما أثرها الفعلي» (المتن السابق: قرار تنفيذي مسجَّل في MJ8).
import { PERMISSION_LEVELS, REVERSIBILITY, SAFETY_LEVELS } from '../../../data/glossary/schema.mjs';
import type { GlossaryEntry, PermissionLevel } from '../../../data/glossary/types';

export const NOT_SPECIFIED = 'غير محدد في المصدر';

export const LEVELS = ['brief', 'medium', 'detailed'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Readonly<Record<Level, string>> = { brief: 'مختصر', medium: 'متوسط', detailed: 'مفصّل' };
export const DEFAULT_LEVEL: Level = 'medium';

export const PERMISSION_LABELS: Readonly<Record<PermissionLevel, string>> = {
  None: 'لا صلاحية على مستودع',
  Read: 'قراءة (Read)',
  Triage: 'فرز (Triage)',
  Write: 'كتابة (Write)',
  Maintain: 'صيانة (Maintain)',
  Admin: 'إدارة (Admin)',
  Owner: 'مالك الحساب أو المنظمة (Owner)',
};

export type DecisionFieldId = 'whenToUse' | 'impact' | 'safety' | 'permission' | 'reversal';

export interface DecisionField {
  readonly id: DecisionFieldId;
  readonly label: string;
  readonly value: string;
  /** false: القيمة «غير محدد في المصدر». */
  readonly specified: boolean;
  /** توضيح إضافي للقيمة (تفصيل الصلاحية). */
  readonly detail?: string;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const oneOf = <T extends string>(value: unknown, set: readonly T[]): T | null => (typeof value === 'string' && (set as readonly string[]).includes(value) ? (value as T) : null);

/** الحقول الخمسة بترتيبها المعتمد. كل حقل ذو قيمة نصية غير فارغة دائمًا. */
export function decisionFields(entry: GlossaryEntry): DecisionField[] {
  const field = (id: DecisionFieldId, label: string, value: string | null, detail?: string | null): DecisionField => ({
    id,
    label,
    value: value ?? NOT_SPECIFIED,
    specified: value !== null,
    ...(value !== null && detail ? { detail } : {}),
  });
  const safety = oneOf(entry.safety, SAFETY_LEVELS);
  const permission = oneOf(entry.permission, PERMISSION_LEVELS);
  const reversible = oneOf(entry.reversible, REVERSIBILITY);
  const limits = text(entry.reversalLimits);
  const reversal = reversible || limits ? `${reversible ?? NOT_SPECIFIED} — ${limits ?? NOT_SPECIFIED}` : null;
  return [
    field('whenToUse', 'متى تُستخدم', text(entry.whenToUse)),
    field('impact', 'الأثر', text(entry.brief)),
    field('safety', 'الحساسية', safety),
    field('permission', 'الصلاحية', permission ? PERMISSION_LABELS[permission] : null, text(entry.permissionNote)),
    field('reversal', 'إمكانية التراجع وحدوده', reversal),
  ];
}

/** هل تحتاج صلاحية المدخل وحدود تراجعه تنبيه «لم تُطابَق على الوثائق». */
export const isUnverified = (entry: GlossaryEntry): boolean => entry.verification?.status !== 'verified';

/** رابط الوثيقة الرسمية إن كان من docs.github.com، وإلا null (لا يُعرض رابط خارجه). */
export function docsLink(entry: GlossaryEntry): string | null {
  const url = text(entry.docsUrl);
  return url && url.startsWith('https://docs.github.com/') ? url : null;
}
