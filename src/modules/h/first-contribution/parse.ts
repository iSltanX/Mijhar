// تلخيص ملفات توجيه المشروع (T-9.3، F-H3): ما ورد في CONTRIBUTING وREADME وقالب طلب الدمج وCODE_OF_CONDUCT «كما ورد».
// لا تأويل ولا توليد خطوات: تُستخرج عناوين الأقسام وبنود القوائم (مرقّمة ونقطية) نصًّا، والجمل التي تعلن سياسات معروفة (مشكلة قبل
// الطلب، اتفاقية مساهم، توقيع DCO، منصة ترجمة خارجية) تُقتبس بنصها. ما لم يرد لا يُذكر كأنه وارد.
export interface Section {
  readonly heading: string;
  readonly level: number;
  readonly body: readonly string[];
}

export interface StepGroup {
  readonly heading: string;
  readonly steps: readonly string[];
}

export interface PolicyNote {
  readonly id: 'issue-first' | 'cla' | 'dco' | 'external-translation' | 'tests-required' | 'style';
  readonly label: string;
  /** الجملة كما وردت. */
  readonly quote: string;
}

export interface ContributingSummary {
  readonly groups: readonly StepGroup[];
  readonly notes: readonly PolicyNote[];
  /** أول فقرة تمهيدية حين لا خطوات. */
  readonly intro: string | null;
  readonly empty: boolean;
}

export const MAX_STEPS_PER_GROUP = 8;
export const MAX_GROUPS = 8;
const MAX_STEP_LENGTH = 220;

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const ORDERED = /^\s*\d+[.)]\s+(.*\S)\s*$/;
const BULLET = /^\s*[-*+]\s+(?!\[[ xX]\]\s)(.*\S)\s*$/;
const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/;

/** ينظّف نص بند: روابط وتأكيد وشيفرة مضمّنة وعلامات HTML. */
export function plain(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const clip = (text: string, max = MAX_STEP_LENGTH): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** أقسام المستند بعناوين ATX، متخطيًا الكتل المسيّجة. نص ما قبل أول عنوان في قسم بعنوان فارغ. */
export function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: { heading: string; level: number; body: string[] } = { heading: '', level: 0, body: [] };
  let fenced = false;
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      sections.push(current);
      current = { heading: plain(heading[2] as string), level: (heading[1] as string).length, body: [] };
    } else current.body.push(line);
  }
  sections.push(current);
  return sections.filter((s) => s.heading !== '' || s.body.some((l) => l.trim() !== ''));
}

const RELEVANT =
  /(contribut|setup|set up|install|getting started|get started|development|develop|build|test|pull request|\bpr\b|submit|issue|bug|report|style|lint|commit|branch|workflow|how to|guideline|sign|cla|dco|fork|clone|ساهم|مساهمة|إعداد|تثبيت|اختبار|طلب سحب|طلب دمج|بلاغ)/i;

function stepsOf(body: readonly string[]): string[] {
  const steps: string[] = [];
  for (const line of body) {
    const match = ORDERED.exec(line) ?? BULLET.exec(line);
    if (!match) continue;
    const text = plain(match[1] as string);
    if (text.length >= 3) steps.push(clip(text));
  }
  return steps;
}

function firstParagraph(sections: readonly Section[]): string | null {
  for (const section of sections) {
    const lines: string[] = [];
    for (const line of section.body) {
      if (line.trim() === '') {
        if (lines.length) break;
        continue;
      }
      if (ORDERED.test(line) || BULLET.test(line) || CHECKBOX.test(line) || /^\s*[|>]/.test(line)) {
        if (lines.length) break;
        continue;
      }
      lines.push(line.trim());
    }
    const text = plain(lines.join(' '));
    if (text.length >= 20) return clip(text, 300);
  }
  return null;
}

const POLICIES: ReadonlyArray<{ id: PolicyNote['id']; label: string; pattern: RegExp }> = [
  { id: 'issue-first', label: 'قد يشترط المشروع فتح مشكلة أو نقاشًا قبل طلب الدمج', pattern: /(open|file|create|raise|start)[^.\n]{0,40}\b(an? )?(issue|discussion)\b[^.\n]{0,50}\b(first|before|prior)\b|discuss[^.\n]{0,60}\bbefore\b[^.\n]{0,40}\b(pull request|pr|submitting|contributing)|issue first/i },
  { id: 'cla', label: 'ذُكرت اتفاقية ترخيص للمساهمين (CLA)', pattern: /\bCLA\b|contributor license agreement/i },
  { id: 'dco', label: 'ذُكر توقيع DCO (Signed-off-by)', pattern: /\bDCO\b|developer certificate of origin|signed-off-by|--signoff|git commit -s\b/i },
  { id: 'external-translation', label: 'ذُكرت منصة ترجمة خارجية', pattern: /\b(crowdin|weblate|transifex|lokalise)\b/i },
  { id: 'tests-required', label: 'ذُكر اشتراط الاختبارات', pattern: /(add|write|include|update|include)[^.\n]{0,30}\btests?\b|tests? (are )?(required|must)|must (pass|include)[^.\n]{0,20}tests?/i },
  { id: 'style', label: 'ذُكر أسلوب الشيفرة أو الفحص الآلي (lint)', pattern: /\b(lint|linter|prettier|eslint|code style|style guide|formatting)\b/i },
];

/** الجمل (بلا الكتل المسيّجة) التي تطابق سياسة معروفة، مقتبسة كما وردت. */
function policyNotes(sections: readonly Section[]): PolicyNote[] {
  const text = sections.map((s) => [s.heading, ...s.body].join('\n')).join('\n');
  const sentences = text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => plain(s))
    .filter((s) => s.length >= 12);
  const notes: PolicyNote[] = [];
  for (const policy of POLICIES) {
    const sentence = sentences.find((s) => policy.pattern.test(s));
    if (sentence) notes.push({ id: policy.id, label: policy.label, quote: clip(sentence, 260) });
  }
  return notes;
}

export function summarizeContributing(markdown: string): ContributingSummary {
  const sections = parseSections(markdown);
  const groups: StepGroup[] = [];
  for (const section of sections) {
    if (!section.heading || !RELEVANT.test(section.heading)) continue;
    const steps = stepsOf(section.body).slice(0, MAX_STEPS_PER_GROUP);
    if (steps.length) groups.push({ heading: section.heading, steps });
    if (groups.length >= MAX_GROUPS) break;
  }
  const notes = policyNotes(sections);
  const intro = groups.length ? null : firstParagraph(sections);
  return { groups, notes, intro, empty: groups.length === 0 && notes.length === 0 && intro === null };
}

/** قسم المساهمة داخل README (عنوان فيه contribut أو ساهم) بخطواته. */
export function summarizeReadme(markdown: string): ContributingSummary {
  const sections = parseSections(markdown);
  const groups: StepGroup[] = [];
  for (const section of sections) {
    if (!/contribut|ساهم|مساهمة/i.test(section.heading)) continue;
    const steps = stepsOf(section.body).slice(0, MAX_STEPS_PER_GROUP);
    if (steps.length) groups.push({ heading: section.heading, steps });
  }
  const contributing = sections.filter((s) => /contribut|ساهم|مساهمة/i.test(s.heading));
  const intro = groups.length ? null : firstParagraph(contributing);
  return { groups, notes: policyNotes(contributing), intro, empty: groups.length === 0 && intro === null };
}

export interface TemplateSummary {
  readonly title: string | null;
  readonly checklist: readonly string[];
  readonly headings: readonly string[];
}

/** قالب طلب الدمج: بنود قائمة التحقق وعناوين الأقسام كما وردت. */
export function summarizeTemplate(markdown: string): TemplateSummary {
  const sections = parseSections(markdown);
  const checklist: string[] = [];
  for (const section of sections) {
    for (const line of section.body) {
      const match = CHECKBOX.exec(line);
      if (match) checklist.push(clip(plain(match[2] as string)));
    }
  }
  return { title: sections.find((s) => s.heading)?.heading ?? null, checklist: checklist.slice(0, 12), headings: sections.map((s) => s.heading).filter(Boolean).slice(0, 10) };
}

/** عنوان مدونة قواعد السلوك (أول عنوان) إن وُجد. */
export const firstHeading = (markdown: string): string | null => parseSections(markdown).find((s) => s.heading)?.heading ?? null;
