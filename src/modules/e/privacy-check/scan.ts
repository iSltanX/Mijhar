// فاحص الأنماط التحذيري المحلي (T-6.3، F-E5): يبحث في نص المعاينة عن أنماط أسرار معروفة (ghp_ وBearer وAKIA…) ويعيد مواضعها لتُظلَّل.
// تحذيري غير جازم: لا يضمن كشف كل الأسرار (فالقائمة قصيرة ومعلنة، والأسرار بلا نمط معروف لا تُرصد)، ولا يغيّر النص ولا يحذف منه شيئًا ولا يدّعي
// ذلك؛ ونتيجته «لم يُرصد» لا تعني خلو النص من الأسرار. دالة نقية بلا شبكة ولا حالة؛ والقائمة تقبل أنماطًا إضافية (للاختبار).

export interface SecretPattern {
  readonly id: string;
  /** اسمه في الواجهة. */
  readonly label: string;
  /** نمط عام (g)؛ يُنسخ عند كل فحص فلا تتسرب حالة lastIndex. */
  readonly regex: RegExp;
}

/** القائمة المعرّفة. الحدود بنظرة خلفية لا \b ليُرصد الرمز بعد «_» كما في GH_TOKEN=ghp_…؛ والأطوال دنيا تحذيرية (لا طول التحقق الكامل). */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { id: 'github-token', label: 'رمز GitHub (ghp_ وgho_ وghu_ وghs_ وghr_)', regex: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{16,}/g },
  { id: 'github-fine-grained', label: 'رمز GitHub دقيق الحبيبات (github_pat_)', regex: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{16,}/g },
  { id: 'bearer', label: 'ترويسة Bearer', regex: /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9\-._~+/]{16,}=*/g },
  { id: 'aws-access-key', label: 'معرّف مفتاح AWS (AKIA أو ASIA)', regex: /(?<![A-Za-z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9])/g },
  { id: 'private-key', label: 'ترويسة مفتاح خاص (PRIVATE KEY)', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'slack-token', label: 'رمز Slack (xox…)', regex: /(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}/g },
  // AD-30 (H-5): صيغة مفتاح مزوّد التحليل المعتمد في DEC-09، فيحجبه المنقّح المشترك من كل محتوى قبل أي إرسال ويرصده تنبيه الحزمة.
  { id: 'anthropic-key', label: 'مفتاح Anthropic API (sk-ant-)', regex: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{16,}/g },
  // MJ25 (T-11.12): صيغتا مفتاح Google Gemini: AIza… المعتادة وAQ.… التي يصدرها AI Studio الآن؛ الطول الأدنى تحذيري كغيره.
  { id: 'gemini-key', label: 'مفتاح Google Gemini API (AIza أو AQ.)', regex: /(?<![A-Za-z0-9])(?:AIza[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9_-]{30,})/g },
];

export interface Finding {
  readonly patternId: string;
  readonly label: string;
  /** إزاحة البداية والنهاية (حصرية) في النص المفحوص. */
  readonly start: number;
  readonly end: number;
  /** رقم السطر (يبدأ من 1) وعمود البداية (يبدأ من 1). */
  readonly line: number;
  readonly column: number;
}

/** أبعد ما يُعرض من النص حول الموضع المرصود في قائمة الأنماط. */
const CONTEXT = 60;
const MATCH_SHOWN = 120;

/** يفحص النص ويعيد المواضع مرتبة بالبداية. لا يعدّل النص. */
export function scanText(text: string, extra: readonly SecretPattern[] = []): Finding[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const found: Finding[] = [];
  for (const pattern of [...SECRET_PATTERNS, ...extra]) {
    const flags = pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`;
    for (const m of text.matchAll(new RegExp(pattern.regex.source, flags))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (end === start) continue;
      const lineIndex = lineOf(start);
      found.push({ patternId: pattern.id, label: pattern.label, start, end, line: lineIndex + 1, column: start - (lineStarts[lineIndex] as number) + 1 });
    }
  }
  return found.sort((a, b) => a.start - b.start || a.end - b.end);
}

export interface FindingView {
  /** النص قبل الموضع وبعده على السطر نفسه (مقصوصان)، والموضع نفسه (مقصوص الطول). */
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** مقتطف السطر حول الموضع للتظليل في القائمة: السطر الذي فيه الموضع فقط، لا النص كله. */
export function findingView(text: string, finding: Finding): FindingView {
  const lineStart = text.lastIndexOf('\n', finding.start - 1) + 1;
  const nl = text.indexOf('\n', finding.end);
  const lineEnd = nl === -1 ? text.length : nl;
  const before = text.slice(lineStart, finding.start);
  const matched = text.slice(finding.start, finding.end);
  const after = text.slice(finding.end, lineEnd);
  return {
    before: before.length > CONTEXT ? `…${before.slice(-CONTEXT)}` : before,
    match: matched.length > MATCH_SHOWN ? `${matched.slice(0, MATCH_SHOWN)}…` : matched,
    after: after.length > CONTEXT ? `${after.slice(0, CONTEXT)}…` : after,
  };
}
