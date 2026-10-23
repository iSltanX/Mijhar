// صيغة الرمز على السلك (T-4.3): عقد الطبقة مع الواجهة رموز ⟦TYPE_N⟧ (T-4.2)، لكن المحرك الحقيقي يحرّفها؛ قاس T-0.2 (`raw/token-formats.json`)
// أن ⟦CODE_0⟧ سلم منها 0 من 29 في Translator API، و{0} و[[0]] سلم كلٌّ منهما 29 من 29. فيحوّل مهايئ المحرك كل رمز إلى صيغة يحفظها قبل الإرسال
// ويعيده بعد الاستقبال، ثم يجري الفاحص الرباعي على النص المُعاد كما هو. لا تخمين هنا:
//  - الصيغة لا تُختار إن ظهر شكلها في النص المرسل نفسه، فلا يلتبس نص أصيل برمز؛ وإن لم تخلُ أي صيغة أُرسل النص بصيغة الخطة ويحكم الفاحص.
//  - المُعاد حرفيًا بشكل الصيغة وحده يُفك؛ والمحرَّف يبقى نصًا فيسقط في فحص الهوية، وفهرس غير مرسل يصير رمزًا غريبًا فيسقط في فحص الاختلاق.

export interface WireFormat {
  readonly name: string;
  readonly make: (index: string) => string;
  /** شكل الرمز على السلك، والمجموعة الأولى فهرسه. */
  readonly pattern: RegExp;
}

/** بترتيب التفضيل؛ كلتاهما سليمة 29 من 29 في Translator API (T-0.2). */
export const TRANSLATOR_WIRE_FORMATS: readonly WireFormat[] = [
  { name: 'brace', make: (i) => `{${i}}`, pattern: /\{(\d+)\}/g },
  { name: 'double-bracket', make: (i) => `[[${i}]]`, pattern: /\[\[(\d+)\]\]/g },
];

export interface WireCodec {
  /** الصيغة المستعملة، أو null حين يُرسل النص كما هو. */
  readonly format: string | null;
  /** النص المرسل إلى المحرك. */
  readonly wire: string;
  /** يعيد رموز ⟦TYPE_N⟧ في مخرجات المحرك. */
  decode(output: string): string;
}

const PLAN_TOKEN = /⟦([A-Z]+)_(\d+)⟧/g;
const ANY_TOKEN = /⟦[^⟦⟧]*⟧/g;

const identity = (masked: string): WireCodec => ({ format: null, wire: masked, decode: (output) => output });

export function encodeTokens(masked: string, formats: readonly WireFormat[] = TRANSLATOR_WIRE_FORMATS): WireCodec {
  const tokens = [...masked.matchAll(PLAN_TOKEN)];
  if (tokens.length === 0) return identity(masked);
  // رمز بغير شكل ⟦TYPE_N⟧ أو فهرس مكرر لا يُعرف مقابله على السلك: يُرسل النص كما هو.
  if (tokens.length !== (masked.match(ANY_TOKEN) ?? []).length) return identity(masked);
  const byIndex = new Map<string, string>();
  for (const [token, , index] of tokens) {
    if (byIndex.has(index as string)) return identity(masked);
    byIndex.set(index as string, token);
  }
  const format = formats.find((f) => !new RegExp(f.pattern.source).test(masked));
  if (!format) return identity(masked);
  return {
    format: format.name,
    wire: masked.replace(PLAN_TOKEN, (_token, _type, index: string) => format.make(index)),
    decode: (output) => output.replace(format.pattern, (_match, index: string) => byIndex.get(index) ?? `⟦?_${index}⟧`),
  };
}
