// قراءة رد المزوّد للعرض (T-11.6، AC-E9 (٥)): فصل المثبت من المصدر عن الاحتمال. كل ما يقترحه النموذج «احتمال يحتاج تحققًا»؛ والمثبت من المصدر
// هو الاقتباس الذي ورد حرفيًا فيما أُرسل فعلًا (يُتحقق منه هنا لا من قول النموذج)، والاقتباس الذي لم يرد فيه يُعلن أنه لم يرد ولا يُعدّ دليلًا.
// وما نقص: ما يعلنه النموذج، مع ما أعلنته الطبقة نفسها قبل الإرسال (يعرضه القسم). الرد نصٌّ يُعرض فقط: لا يُنفَّذ منه شيء ولا يُفسَّر HTML.

export interface EvidenceQuote {
  readonly text: string;
  /** ورد حرفيًا (بعد توحيد المسافات) فيما أُرسل إلى المزوّد. */
  readonly found: boolean;
}

export interface Finding {
  readonly text: string;
  readonly evidence: readonly EvidenceQuote[];
}

export interface ParsedAnalysis {
  /** الرد بالبنية المطلوبة؛ وإلا يُعرض نصّه كما هو احتمالًا واحدًا. */
  readonly structured: boolean;
  readonly summary: string | null;
  readonly findings: readonly Finding[];
  readonly steps: readonly string[];
  readonly missing: readonly string[];
  /** نص الرد حين لم يُقرأ بالبنية المطلوبة. */
  readonly raw: string | null;
  /** توقف التوليد عند حد الطول قبل اكتمال الرد. */
  readonly cut: boolean;
}

/** حدود العرض (لا علاقة لها بما يُرسل). */
const MAX_ITEMS = 12;
const MAX_EVIDENCE = 6;
const MIN_QUOTE = 4;

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();
const unquote = (text: string): string => text.trim().replace(/^[«"'`“]+|[»"'`”]+$/g, '').trim();

const strings = (value: unknown, max = MAX_ITEMS): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

/** أول كائن JSON في النص (ولو داخل سياج ```json)، أو null. */
function jsonOf(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseAnalysis(text: string, sent: string, stopReason: string | null = null): ParsedAnalysis {
  const cut = stopReason === 'max_tokens';
  const body = normalize(sent);
  const evidenceOf = (raw: string): EvidenceQuote => {
    const clean = unquote(raw);
    return { text: clean, found: clean.length >= MIN_QUOTE && body.includes(normalize(clean)) };
  };
  const parsed = jsonOf(text) as { summary?: unknown; findings?: unknown; next_steps?: unknown; missing?: unknown } | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings)) {
    return { structured: false, summary: null, findings: [], steps: [], missing: [], raw: text.trim() || null, cut };
  }
  const findings: Finding[] = parsed.findings
    .map((f: unknown): Finding | null => {
      const item = f as { text?: unknown; evidence?: unknown } | null;
      const t = typeof item?.text === 'string' ? item.text.trim() : '';
      return t ? { text: t, evidence: strings(item?.evidence, MAX_EVIDENCE).map(evidenceOf) } : null;
    })
    .filter((f): f is Finding => f !== null)
    .slice(0, MAX_ITEMS);
  return {
    structured: true,
    summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null,
    findings,
    steps: strings(parsed.next_steps),
    missing: strings(parsed.missing),
    raw: null,
    cut,
  };
}
