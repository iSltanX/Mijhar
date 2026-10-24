// توليد برومبت بقالب (T-11.4، F-E8): دالة نقية بلا شبكة ولا حالة ولا مفتاح، تعرض بنية السياق المشتركة (T-11.2) وحدها. كل قسم من الصفحة يحمل
// جزء البنية بعينه أو سطر «لم يصل» إن غاب؛ و«المعلومات الناقصة» آخر كل برومبت: فجوات الجمع وما اقتُطع بعدد أسطره، ثم كل قسم لم يصل جزؤه
// بسببه من جرد البنية، ثم ما حُجب من الأسرار المحتملة. لا يحوي البرومبت نص الصفحة كاملًا بلا تمييز ولا بيانًا لم يصل إلى البنية؛ ولا يُبنى
// إلا من بنية منقّحة بالحجب (mask)، فلا يبقى فيه سرّ مطابق للقائمة المعرّفة (AC-E8).
// MJ22 (T-11.9، AC-F7 (٣)): كل ما نُقل من الصفحة (الموضوع وأجزاء البنية) بين حدّين صريحين يفصلانه عن تعليمات مِجهَر، ويسبقه سطر يقول إن ما بينهما
// بيانات لا تعليمات (src/core/guardrails/boundaries.ts)؛ وما كتبه مِجهَر («المطلوب» و«المعلومات الناقصة» وسطر الختام) خارجهما.
import { BOUNDARY_RULE, bounded, neutralize } from '../../../core/guardrails/boundaries';
import { PAGE_TEXT, buildContext, gapLine, maskOf, partHeading, sectionLines, utcStamp } from '../context';
import type { ContextOptions, ContextSource, ContextStructure, Part, PartState } from '../context';
import { CLOSING_LINE, MISSING_HEADING, NOT_RECEIVED_LINE, PART_INVENTORY, promptOf, sectionsFor } from './definitions';
import type { PromptDef, PromptId, PromptPart, PromptSection } from './definitions';

export interface BuiltPrompt {
  readonly text: string;
  /** بنود «المعلومات الناقصة» كما في البرومبت (للواجهة وللتنبيه المختصر). */
  readonly missing: readonly string[];
  /**
   * قيم الصفحة التي نُقلت فعلًا في الكتل المنقولة، كلٌّ بنصه كما في البرومبت (F-04): ما يُقبل منه اقتباس النموذج دليلًا. لا تدخلها صياغة
   * مِجهَر داخل الكتل (العناوين والتسميات والتصنيف وسطر وقت الجمع والقيم البديلة)، ولا جزء غير مختار أو لم يُعرض في هذا القالب.
   */
  readonly sources: readonly string[];
}

function partOf(ctx: ContextStructure, part: PromptPart): Part | null {
  const { parts } = ctx;
  if (part === 'source' || part === 'repo' || part === 'branch') {
    const body = part === 'branch' ? parts.branch : part === 'repo' ? parts.repo : [...parts.repo, ...parts.branch];
    if (!body.length) return null;
    const source = part === 'branch' ? parts.verbatim.branch : part === 'repo' ? parts.verbatim.repo : [...parts.verbatim.repo, ...parts.verbatim.branch];
    // وقت الجمع مع المستودع والرابط (لا مع الفرع وحده).
    return { heading: 'المصدر', detail: null, body: ctx.collectedAt !== null && part !== 'branch' ? [...body, `- جُمع: ${utcStamp(ctx.collectedAt)} من الصفحة المفتوحة`] : body, source };
  }
  return parts[part];
}

const reasonOf = (state: PartState): string => (state.state === 'collected' ? 'لم يصل إلى بنية السياق' : state.reason);

/** عناوين الأقسام كما تظهر في البرومبت لنوع صفحة، بترتيبها، و«المعلومات الناقصة» آخرها. */
export const promptHeadings = (id: PromptId, kind: ContextStructure['kind']): string[] => [...sectionsFor(promptOf(id), kind).map((s) => s.heading), MISSING_HEADING];

export function renderPrompt(def: PromptDef | PromptId, ctx: ContextStructure): BuiltPrompt {
  if (ctx.secrets.policy !== 'mask') throw new Error('البرومبت يُبنى من بنية سياق منقّحة بحجب الأسرار (secrets: mask)');
  const prompt = typeof def === 'string' ? promptOf(def) : def;
  const lines: string[] = [`# ${prompt.label}`, '', `قالب البرومبت: ${prompt.label} (${prompt.english}) · ${PAGE_TEXT[ctx.kind]}`, BOUNDARY_RULE, '', ...bounded([`الموضوع: ${ctx.subject}`]), ''];
  // الأقسام التي لم يصل جزؤها، مجمّعة بجرد الجزء (السجل وما استخرجه محلله سببهما واحد).
  const notReceived = new Map<string, { headings: string[]; reason: string }>();
  const sources: string[] = [...ctx.parts.verbatim.subject];
  const sectionOf = (spec: PromptSection): string[] => {
    if (spec.kind === 'fixed') return sectionLines(spec.heading, spec.lines);
    const part = partOf(ctx, spec.part);
    if (part && part.body.length) {
      sources.push(...(part.source ?? []));
      return sectionLines(part.detail ? partHeading(part, spec.heading) : spec.heading, bounded(part.body));
    }
    const key = PART_INVENTORY[spec.part];
    const entry = notReceived.get(key) ?? { headings: [], reason: reasonOf(ctx.inventory[key]) };
    entry.headings.push(spec.heading);
    notReceived.set(key, entry);
    return sectionLines(spec.heading, [NOT_RECEIVED_LINE]);
  };
  for (const spec of sectionsFor(prompt, ctx.kind)) lines.push(...sectionOf(spec));

  const missing = [...ctx.gaps.map(gapLine), ...[...notReceived.values()].map((e) => `- **${e.headings.join(' · ')}**: ${e.reason}`)];
  if (ctx.secrets.total) {
    const where = ctx.secrets.hits.map((h) => `${h.part}: ${h.label} ×${h.count}`).join('؛ ');
    missing.push(`- **أسرار محتملة** (حُجبت): ${ctx.secrets.total} موضعًا مطابقًا لقائمة الأنماط المعرّفة استُبدل بـ«${maskOf('…')}» — ${where}. لا تطلب قيمها.`);
  }
  lines.push(...sectionLines(MISSING_HEADING, missing.length ? missing : ['- لا شيء معلن: جُمع كل ما يحتاجه هذا القالب من الصفحة.']), '---', CLOSING_LINE);
  return { text: lines.join('\n'), missing, sources: [...new Set(sources.map(neutralize))] };
}

/** البرومبت من مجموع الجامع مباشرة: الطبقة بحجب الأسرار دائمًا، ثم القالب. */
export function promptFor(def: PromptDef | PromptId, source: ContextSource, options: Omit<ContextOptions, 'secrets'> = {}): BuiltPrompt {
  return renderPrompt(def, buildContext(source, { ...options, secrets: 'mask' }));
}
