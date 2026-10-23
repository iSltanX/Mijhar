// أنواع تقنيع العناصر المحمية قبل الترجمة وفحص سلامتها بعدها (T-4.2 / F-C2). دوال خالصة بلا DOM ولا محرك.

/** أنواع الرموز؛ تظهر في اسم الرمز ⟦TYPE_INDEX⟧ وتُحفظ في سجله. */
export const TOKEN_TYPES = ['CODE', 'PATH', 'LINK', 'CMD', 'REF', 'USER', 'TERM'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

/** مقطع جاهز للتقنيع: نص يُكتشف فيه المحمي تلقائيًا، أو عنصر محمي حدّده المستدعي (مثل محتوى <code>) ويُقنَّع حرفيًا. */
export type MaskSegment = string | { readonly type: TokenType; readonly value: string };

/** سجل رمز واحد في خريطة التحقق expectedTokens. */
export interface ProtectedTokenRecord {
  /** الرمز بكامل أقواسه، مثل ⟦CODE_0⟧؛ وهو مفتاح الخريطة. */
  readonly token: string;
  readonly type: TokenType;
  /** الفهرس من 0 إلى N-1 بترتيب الظهور في النص المقنَّع، مشترك بين الأنواع كلها. */
  readonly index: number;
  /** النص الأصلي الذي يُعاد حرفيًا عند فك التقنيع. */
  readonly original: string;
  /** true لرمز مقطع صريح حدده المستدعي (عنصر <code> أو رابط…)، لا لما اكتشفه المقنِّع في النص؛ به تُربط الرموز بعناصرها بالموضع. */
  readonly explicit?: true;
}

export type ExpectedTokens = ReadonlyMap<string, ProtectedTokenRecord>;

export interface MaskResult {
  /** النص المرسل إلى المحرك، وكل عنصر محمي فيه مستبدل برمزه. */
  readonly masked: string;
  readonly expectedTokens: ExpectedTokens;
}

export interface MaskOptions {
  /** قائمة «لا تُترجم»؛ الافتراضي DO_NOT_TRANSLATE_TERMS. مصفوفة فارغة تعطّل اكتشاف المصطلحات. */
  readonly terms?: readonly string[];
}

/** اسم الفحص الذي سقط. */
export type IntegrityCheck = 'count' | 'identity' | 'duplication' | 'hallucination';

export interface IntegrityFailure {
  readonly check: IntegrityCheck;
  /** الرموز المعنية بالفشل (المفقودة أو المكررة أو الغريبة) أو ما بقي من أقواس يتيمة. */
  readonly tokens: readonly string[];
  readonly detail: string;
}

export type IntegrityReport =
  | { readonly ok: true; readonly failures: readonly [] }
  | { readonly ok: false; readonly failures: readonly IntegrityFailure[] };

/** جزء من النص بعد فك التقنيع؛ الجزء المحمي يُعرض معزولًا dir="ltr". */
export type UnmaskedPart =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'protected'; readonly type: TokenType; readonly value: string; readonly dir: 'ltr' };
