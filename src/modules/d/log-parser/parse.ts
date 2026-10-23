// محلل سجل الفحص بثلاث طبقات مفصولة (T-5.3، F-D5، AC-D5). دالة نقية: نص السجل (أو غيابه بسببه) والتنبيهات الظاهرة ← تحليل.
//  1. الحرفي: رسائل `##[error]` والأسطر التي طابقت نمطًا، بنصها كما هو، وموضعها (الخطوة وكود الخروج ورقم السطر والأسطر المحيطة).
//  2. السبب الجذري المثبت: لا يُملأ إلا بتطابق نمط من LOG_PATTERNS، ودليله السطر نفسه؛ وإلا عبارة NO_ROOT_CAUSE_TEXT.
//  3. الاحتمالات: كل عنصر موسوم «احتمال يحتاج تحققًا» ومعه ما بُني عليه.
// السجل الطويل يُقتطع من أوله (الخطأ في آخره عادةً) ويُعلَن الاقتطاع بعدد ما قُرئ؛ والسجل غير المتاح يُعلَن بسببه، وتُحلَّل
// حينها التنبيهات الظاهرة وحدها موسومةً بمصدرها (BLK-GH-AUTH-LOGS).
import { LOG_PATTERNS } from './patterns';
import type { LogPattern } from './patterns';

export const NO_ROOT_CAUSE_TEXT = 'لا يوجد سبب جذري مثبت من نص السجل وحده';
export const POSSIBILITY_TAG = 'احتمال يحتاج تحققًا';

export interface StepRef {
  readonly name: string | null;
  readonly number: number | null;
}

export interface AnnotationInput {
  /** نص التنبيه كما يعرضه GitHub («Process completed with exit code 1.»). */
  readonly message: string;
  readonly level: 'failure' | 'warning' | 'notice' | 'unknown';
  /** الخطوة التي ينتمي إليها التنبيه إن ذُكرت. */
  readonly step: StepRef | null;
  /** رقم السطر في سجل الخطوة إن ذُكر (#annotation:<step>:<line>). */
  readonly line: number | null;
}

export type LogSource = 'step-log' | 'job-log' | 'annotations';

export interface LogInput {
  /** نص السجل، أو null حين لا يُتاح (ومعه unavailableReason). */
  readonly text: string | null;
  readonly unavailableReason?: string;
  readonly source: LogSource;
  /** الخطوة التي يخصها السجل إن عُرفت من الصفحة. */
  readonly step?: StepRef | null;
  readonly annotations?: readonly AnnotationInput[];
  /** أقصى عدد أسطر يُحلَّل (الأخيرة). الافتراضي 20000. */
  readonly maxLines?: number;
  /** سبب اقتطاع أعلنه المصدر نفسه (مثل حدّ حجم في الجلب). */
  readonly truncatedBySource?: string | null;
}

export interface ContextLine {
  readonly number: number;
  readonly text: string;
  readonly focus: boolean;
}

export interface LiteralMessage {
  readonly text: string;
  /** رقم السطر في السجل المقروء (من 1)، أو في سجل الخطوة إن جاء من تنبيه. */
  readonly line: number | null;
  readonly origin: 'error-marker' | 'pattern-line' | 'annotation';
  /** الخطوة كما تعرّفها الصفحة، أو عنوان المجموعة «Run …» الذي وقع فيه السطر. */
  readonly step: string | null;
  readonly context: readonly ContextLine[];
}

export interface RootCause {
  readonly patternId: string;
  readonly patternTitle: string;
  readonly cause: string;
  /** السطر الذي طابق النمط، بنصه، دليلًا. */
  readonly evidence: { readonly line: number | null; readonly text: string; readonly origin: 'log' | 'annotation' };
}

export interface Possibility {
  readonly text: string;
  /** ما بُني عليه الاحتمال من السجل. */
  readonly basis: string;
  readonly tag: typeof POSSIBILITY_TAG;
}

export type Availability =
  | { readonly state: 'full'; readonly lines: number }
  | { readonly state: 'truncated'; readonly reason: string; readonly readLines: number; readonly totalLines: number | null }
  | { readonly state: 'unavailable'; readonly reason: string };

export interface LogAnalysis {
  readonly source: LogSource;
  readonly availability: Availability;
  readonly location: { readonly step: StepRef | null; readonly exitCode: number | null; readonly exitLine: number | null };
  readonly messages: readonly LiteralMessage[];
  /** عدد الرسائل التي لم تُعرض بعد الحد. */
  readonly moreMessages: number;
  readonly rootCauses: readonly RootCause[];
  readonly moreRootCauses: number;
  readonly possibilities: readonly Possibility[];
}

const TIMESTAMP = /^﻿?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;
const ERROR_MARKER = /^##\[error\]/;
const GROUP = /^##\[group\](.*)$/;
const END_GROUP = /^##\[endgroup\]/;
const EXIT = /Process completed with exit code (\d+)\./;
const SOURCE_TRUNCATED = /has been truncated due to its large size/i;
const CONTEXT_BEFORE = 5;
const CONTEXT_AFTER = 2;
const MAX_MESSAGES = 12;
const MAX_CAUSES = 8;

/** نص السطر بلا الطابع الزمني الذي يسبق كل سطر في سجلات Actions. */
export const stripTimestamp = (line: string): string => line.replace(TIMESTAMP, '').replace(/\r$/, '');

interface Line {
  readonly number: number;
  readonly text: string;
  readonly group: string | null;
}

function toLines(text: string, maxLines: number): { lines: Line[]; total: number; cut: boolean } {
  const raw = text.split('\n');
  if (raw.length && raw[raw.length - 1] === '') raw.pop();
  const total = raw.length;
  const start = Math.max(0, total - maxLines);
  const lines: Line[] = [];
  let group: string | null = null;
  // عنوان المجموعة يُتتبَّع من أول السجل حتى إن اقتُطع، فلا يضيع اسم الخطوة؛ ويبقى بعد ##[endgroup] حتى تبدأ مجموعة أخرى
  // (مخرجات أمر «Run …» تأتي بعد نهاية مجموعة عرضه).
  for (let i = 0; i < total; i += 1) {
    const content = stripTimestamp(raw[i] ?? '');
    const g = GROUP.exec(content);
    if (g) group = g[1]?.trim() || null;
    if (i >= start) lines.push({ number: i + 1, text: content, group });
  }
  return { lines, total, cut: start > 0 };
}

const display = (text: string): string => text.replace(ERROR_MARKER, '').replace(/^##\[(?:warning|notice|debug)\]/, '');

function contextOf(lines: readonly Line[], index: number): ContextLine[] {
  const from = Math.max(0, index - CONTEXT_BEFORE);
  const to = Math.min(lines.length - 1, index + CONTEXT_AFTER);
  const out: ContextLine[] = [];
  for (let i = from; i <= to; i += 1) {
    const line = lines[i];
    if (!line || GROUP.test(line.text) || END_GROUP.test(line.text)) continue;
    out.push({ number: line.number, text: display(line.text), focus: i === index });
  }
  return out;
}

function firstMatch(text: string, patterns: readonly LogPattern[]): { pattern: LogPattern; hit: NonNullable<ReturnType<LogPattern['match']>> } | null {
  for (const p of patterns) {
    const hit = p.match(text);
    if (hit) return { pattern: p, hit };
  }
  return null;
}

const stepLabel = (step: StepRef | null | undefined): string | null => {
  if (!step) return null;
  if (step.name && step.number !== null) return `${step.number}. ${step.name}`;
  return step.name ?? (step.number !== null ? `الخطوة ${step.number}` : null);
};

export function analyzeLog(input: LogInput, patterns: readonly LogPattern[] = LOG_PATTERNS): LogAnalysis {
  const maxLines = input.maxLines ?? 20_000;
  const annotations = input.annotations ?? [];
  const messages: LiteralMessage[] = [];
  const causes: RootCause[] = [];
  const seen = new Set<string>();
  let exitCode: number | null = null;
  let exitLine: number | null = null;
  let availability: Availability;
  let lines: Line[] = [];
  const pageStep = input.step ?? null;

  const addCause = (pattern: LogPattern, hit: { key: string; cause: string }, evidence: RootCause['evidence']): void => {
    const id = `${pattern.id}|${hit.key}`;
    if (seen.has(id)) return;
    seen.add(id);
    causes.push({ patternId: pattern.id, patternTitle: pattern.title, cause: hit.cause, evidence });
  };

  if (input.text === null) {
    availability = { state: 'unavailable', reason: input.unavailableReason ?? 'نص السجل غير متاح' };
  } else {
    const parsed = toLines(input.text, maxLines);
    lines = parsed.lines;
    if (parsed.cut) {
      availability = { state: 'truncated', reason: `السجل أطول من ${maxLines.toLocaleString('en-US')} سطر، فحُلِّل آخره وحده`, readLines: lines.length, totalLines: parsed.total };
    } else if (input.truncatedBySource || lines.some((l) => SOURCE_TRUNCATED.test(l.text))) {
      availability = { state: 'truncated', reason: input.truncatedBySource ?? 'يعلن السجل نفسه أنه مقتطع لكبر حجمه', readLines: lines.length, totalLines: null };
    } else {
      availability = { state: 'full', lines: lines.length };
    }

    lines.forEach((line, index) => {
      const exit = EXIT.exec(line.text);
      if (exit) {
        exitCode = Number(exit[1]);
        exitLine = line.number;
      }
      const isError = ERROR_MARKER.test(line.text);
      const content = display(line.text);
      const matched = firstMatch(content, patterns);
      if (matched) addCause(matched.pattern, matched.hit, { line: line.number, text: content, origin: 'log' });
      if (isError || matched) {
        messages.push({
          text: content,
          line: line.number,
          origin: isError ? 'error-marker' : 'pattern-line',
          step: stepLabel(pageStep) ?? line.group,
          context: contextOf(lines, index),
        });
      }
    });
  }

  // التنبيهات الظاهرة: رسائل حرفية من مصدر آخر (موسومة)، وتُطابق عليها الأنماط نفسها.
  for (const note of annotations) {
    if (note.level !== 'failure' && input.text !== null) continue;
    const text = note.message.trim();
    if (!text) continue;
    const exit = EXIT.exec(text);
    if (exit && exitCode === null) exitCode = Number(exit[1]);
    const duplicate = messages.some((m) => m.text.trim() === text);
    if (!duplicate) messages.push({ text, line: note.line, origin: 'annotation', step: stepLabel(note.step), context: [] });
    for (const part of text.split('\n')) {
      const matched = firstMatch(part.trim(), patterns);
      if (matched) addCause(matched.pattern, matched.hit, { line: note.line, text: part.trim(), origin: 'annotation' });
    }
  }

  const step = pageStep ?? annotations.find((a) => a.level === 'failure' && a.step)?.step ?? null;
  const possibilities = suggestPossibilities(lines, { exitCode, rootCauses: causes, available: input.text !== null });
  return {
    source: input.source,
    availability,
    location: { step, exitCode, exitLine },
    messages: messages.slice(0, MAX_MESSAGES),
    moreMessages: Math.max(0, messages.length - MAX_MESSAGES),
    rootCauses: causes.slice(0, MAX_CAUSES),
    moreRootCauses: Math.max(0, causes.length - MAX_CAUSES),
    possibilities,
  };
}

// ---- الطبقة الثالثة ----

const NETWORK = /\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b|socket hang up|Could not resolve host|Connection timed out|\b50[234] (?:Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i;
const WARNING = /^##\[warning\](.+)$/;
const ERRORISH = /\b(?:error|failed|failure|exception|fatal)\b/i;

const possibility = (text: string, basis: string): Possibility => ({ text, basis, tag: POSSIBILITY_TAG });

function suggestPossibilities(lines: readonly Line[], facts: { exitCode: number | null; rootCauses: readonly RootCause[]; available: boolean }): Possibility[] {
  const out: Possibility[] = [];
  const { exitCode } = facts;
  if (exitCode === 137) out.push(possibility('قد تكون العملية أُنهيت قسرًا (SIGKILL)، كنفاد ذاكرة المشغّل أو إيقاف من الخارج.', 'كود الخروج 137 = 128 + 9'));
  if (exitCode === 143) out.push(possibility('قد تكون العملية أُنهيت بإشارة SIGTERM، كإلغاء أو مهلة.', 'كود الخروج 143 = 128 + 15'));
  if (exitCode === 127 && !facts.rootCauses.some((c) => c.patternId === 'command-not-found')) {
    out.push(possibility('قد يكون أمرٌ في الخطوة غير مثبت أو غير موجود في المسار.', 'كود الخروج 127 يعيده الطرفيّ عادةً لأمر غير موجود'));
  }
  const network = lines.find((l) => NETWORK.test(l.text));
  if (network) out.push(possibility('قد يكون الفشل عطلًا شبكيًا عابرًا؛ إعادة تشغيل المهمة تكشف ذلك.', `السطر ${network.number}: ${display(network.text)}`));
  if (facts.rootCauses.some((c) => c.patternId === 'typescript-error')) {
    out.push(possibility('قد يكون الخطأ من تغيير في هذا الالتزام، أو من اختلاف إصدار TypeScript أو الاعتماديات بين CI والجهاز المحلي.', 'خطأ مترجم TypeScript في الطبقة الثانية'));
  }
  if (facts.rootCauses.some((c) => c.patternId === 'test-failures' || c.patternId === 'go-test-fail')) {
    out.push(possibility('قد يكون الاختبار متقلبًا (flaky) إن نجح في تشغيل سابق للالتزام نفسه.', 'ملخص أداة الاختبار في الطبقة الثانية'));
  }
  const exitAt = lines.findIndex((l) => EXIT.test(l.text));
  const before = (exitAt === -1 ? lines : lines.slice(0, exitAt)).slice(-60);
  const warning = [...before].reverse().find((l) => WARNING.test(l.text));
  if (warning) out.push(possibility('تحذير سبق الفشل قد يكون ذا صلة به.', `السطر ${warning.number}: ${display(warning.text)}`));
  if (!facts.rootCauses.length && facts.available) {
    const hints = [...before].reverse().filter((l) => ERRORISH.test(l.text) && !ERROR_MARKER.test(l.text) && !EXIT.test(l.text)).slice(0, 3);
    for (const hint of hints.reverse()) out.push(possibility('قد يحمل هذا السطر سبب الفشل؛ لم يطابق نمطًا معرّفًا.', `السطر ${hint.number}: ${display(hint.text)}`));
  }
  if (!facts.available) out.push(possibility('قد يكون السبب في نص السجل الذي لم يُقرأ؛ التنبيهات الظاهرة لا تغني عنه.', 'نص السجل غير متاح'));
  return out;
}
