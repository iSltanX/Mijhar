// توليد حزمة بقالب (T-6.2، F-E3): دالة نقية بلا شبكة ولا حالة، تستهلك أجزاء المنشئ (buildParts) نفسها فيطابق اختيارها وحدودها واقتطاعها
// الحزمة العامة، وتضع الأقسام المعرّفة للقالب بترتيبها. القسم الذي لم يُختر أو لم يتوفر يبقى بعنوانه ويقول ذلك صراحة، فلا يُختلق محتوى.
// قسم «ما تعذّر جمعه أو اقتُطع لطوله» الإلزامي يُلحق بكل قالب بالبنود نفسها.
import { DEFAULT_LIMITS, GAPS_HEADING, allGaps, buildParts, footerLines, gapsSection, partHeading, sectionLines } from '../builder/build';
import type { BuiltBundle, BundleParts, Limits, Snippet } from '../builder/build';
import type { ContextSource } from '../builder/collect';
import { EMPTY_SECTION_LINE, templateOf } from './definitions';
import type { PageKey, SectionSpec, TemplateDef, TemplateId } from './definitions';

/** عناوين الأقسام كما تظهر في الحزمة الناتجة، بترتيبها (للاختبار والواجهة). القسم الإلزامي في آخرها. */
export const templateHeadings = (id: TemplateId): string[] => [...templateOf(id).sections.map((s) => s.heading), GAPS_HEADING];

function pageBody(key: PageKey, parts: BundleParts): { body: readonly string[]; detail: string | null } {
  switch (key) {
    case 'source':
      return { body: [...parts.repo, ...parts.branch], detail: null };
    case 'description':
      return { body: parts.description?.body ?? [], detail: null };
    case 'comments':
      return { body: parts.comments?.body ?? [], detail: parts.comments?.detail ?? null };
    case 'checks':
      return { body: parts.checks?.body ?? [], detail: parts.checks?.detail ?? null };
    case 'error':
      return { body: parts.error?.body ?? [], detail: null };
    case 'snippets':
      return { body: parts.snippets?.body ?? [], detail: parts.snippets?.detail ?? null };
  }
}

function sectionOf(spec: SectionSpec, parts: BundleParts): string[] {
  switch (spec.kind) {
    case 'fixed':
      return sectionLines(spec.heading, spec.lines);
    case 'fill':
      return sectionLines(spec.heading, [`(${spec.hint}: اكتب هنا قبل النسخ.)`]);
    case 'page': {
      const { body, detail } = pageBody(spec.key, parts);
      const heading = detail ? partHeading({ heading: spec.heading, detail, body }) : spec.heading;
      return sectionLines(heading, body.length ? body : [EMPTY_SECTION_LINE]);
    }
  }
}

export function renderTemplate(
  def: TemplateDef | TemplateId,
  source: ContextSource,
  snippets: readonly Snippet[],
  selected: ReadonlySet<string>,
  limits: Limits = DEFAULT_LIMITS,
  collectedAt?: number,
): BuiltBundle {
  const template = typeof def === 'string' ? templateOf(def) : def;
  const parts = buildParts(source, snippets, selected, limits);
  const lines: string[] = [`# ${template.titlePrefix}: ${parts.subject}`, '', `قالب: ${template.label} (${template.english})`, ''];
  for (const spec of template.sections) lines.push(...sectionOf(spec, parts));
  const gaps = allGaps(source, parts);
  lines.push(...gapsSection(gaps), ...footerLines(collectedAt));
  return { text: lines.join('\n'), gaps };
}

/** اسم ملف التنزيل `.md`: صفحة المصدر ورقمها وقالبها، بحروف آمنة لاسم ملف. */
export function bundleFileName(source: ContextSource, template: TemplateId | null): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = ['mijhar', source.kind, source.repo ? safe(source.repo) : '', source.number !== null ? String(source.number) : '', template ?? 'context'].filter(Boolean);
  return `${parts.join('-')}.md`;
}
