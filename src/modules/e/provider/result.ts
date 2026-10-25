// قراءة رد المزوّد للعرض (T-11.6، AC-E9 (٥)): فصل المثبت من المصدر عن الاحتمال. كل ما يقترحه النموذج «احتمال يحتاج تحققًا»؛ والمثبت من المصدر
// هو الاقتباس الذي ورد حرفيًا في نص الصفحة المرسل (يُتحقق منه هنا لا من قول النموذج)، والاقتباس الذي لم يرد فيه يُعلن أنه لم يرد ولا يُعدّ دليلًا.
// نص الصفحة المرسل (F-04) قيمٌ نُقلت من الصفحة كما هي (sources من القالب) ووردت داخل كتلة منقولة؛ فلا يُعدّ مصدرًا ما كتبه مِجهَر خارج الكتل
// (التعليمات و«المعلومات الناقصة» وسطر الختام) ولا ما كتبه داخلها (العناوين والتسميات والتصنيف ووقت الجمع والقيم البديلة وعلامات الحجب).
// وما نقص: ما يعلنه النموذج، مع ما أعلنته الطبقة نفسها قبل الإرسال (يعرضه القسم). الرد نصٌّ يُعرض فقط: لا يُنفَّذ منه شيء ولا يُفسَّر HTML.

import { transported } from '../../../core/guardrails/boundaries';
import { maskOf } from '../context';

export interface EvidenceQuote {
  readonly text: string;
  /**
   * ورد حرفيًا (بعد توحيد المسافات وإسقاط علامة الاقتباس «> » أول السطر) في قيمة واحدة من قيم الصفحة المرسلة، وفي كتلة منقولة من البرومبت كما أُرسل.
   * الاقتباس الذي يمتد عبر قيمتين يصلهما تنسيق مِجهَر، أو يشمل علامة حجب، لا يُعدّ دليلًا.
   */
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
  /** L-2 (MJ26): قطع المزوّد الرد بمرشّح المحتوى أو رفض المودل بعد نص جزئي؛ فما يُعرض جزء منه. */
  readonly filtered: boolean;
}

/** أسباب توقف تعني أن المزوّد قطع الرد أو رفضه بعد نص جزئي: content_filter في OpenAI، وrefusal في Anthropic. */
const FILTERED = new Set(['content_filter', 'refusal']);

/** حدود العرض (لا علاقة لها بما يُرسل). */
const MAX_ITEMS = 12;
const MAX_EVIDENCE = 6;
const MIN_QUOTE = 4;

const normalize = (text: string): string => text.replace(/^[ \t]*> ?/gm, '').replace(/\s+/g, ' ').trim();
/** علامة الحجب نص كتبه مِجهَر مكان السر: تقسم القيمة فلا يعبرها اقتباس. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const [MASK_OPEN = '', MASK_CLOSE = ''] = maskOf('\u0000').split('\u0000');
const MASK = new RegExp(`${escaped(MASK_OPEN)}[^${escaped(MASK_CLOSE)}]*${escaped(MASK_CLOSE)}`, 'g');
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

/** ما أُرسل: البرومبت وقيم الصفحة المنقولة فيه (PreparedAnalysis). */
export interface SentAnalysis {
  readonly prompt: string;
  readonly sources: readonly string[];
}

/** يُقبل الاقتباس دليلًا إن ورد في قيمة واحدة من قيم الصفحة وفي كتلة منقولة واحدة مما أُرسل فعلًا، كلٌّ على حدة. */
export function parseAnalysis(text: string, sent: SentAnalysis, stopReason: string | null = null): ParsedAnalysis {
  const cut = stopReason === 'max_tokens';
  const filtered = stopReason !== null && FILTERED.has(stopReason);
  const blocks = transported(sent.prompt).map(normalize);
  const values = sent.sources.flatMap((v) => v.split(MASK)).map(normalize).filter((v) => v.length >= MIN_QUOTE);
  const evidenceOf = (raw: string): EvidenceQuote => {
    const clean = unquote(raw);
    const wanted = normalize(clean);
    const found = wanted.length >= MIN_QUOTE && values.some((v) => v.includes(wanted)) && blocks.some((block) => block.includes(wanted));
    return { text: clean, found };
  };
  const parsed = jsonOf(text) as { summary?: unknown; findings?: unknown; next_steps?: unknown; missing?: unknown } | null;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings)) {
    return { structured: false, summary: null, findings: [], steps: [], missing: [], raw: text.trim() || null, cut, filtered };
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
    filtered,
  };
}
