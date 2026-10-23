// مولّد استعلامات الاكتشاف (T-9.4، F-H4): نص الاستعلام الكامل يظهر للمستخدم ويعدّله قبل أي فتح، والرابط يُبنى منه وحده.
// لا يُفتح بحث ولا يُرسل شيء من هنا: الدوال نقية تعيد نصًّا ورابطًا، والفتح بنقر المستخدم في الواجهة.
import { validateQuery } from './validate';
import type { SearchType } from './validate';

export const SEARCH_ORIGIN = 'https://github.com/search';
export const TRENDING_ORIGIN = 'https://github.com/trending';

/** وسوم المستودعات العربية في الخطة (3.ح — المتطلب 4). */
export const ARABIC_TOPICS = ['arabic', 'rtl', 'arabic-nlp', 'arabic-fonts'] as const;

/** رابط بحث GitHub لاستعلام نصي كما هو. */
export function searchUrl(query: string, type: SearchType): string {
  const url = new URL(SEARCH_ORIGIN);
  url.searchParams.set('q', query);
  url.searchParams.set('type', type);
  return url.href;
}

/** يحيط القيمة بعلامتي اقتباس إن احتوت فراغًا أو ما لا يصلح كلمة واحدة؛ وتُحذف علامات الاقتباس الداخلية. */
export function quoteValue(value: string): string {
  const clean = value.replace(/["\\]/g, '').trim();
  return /^[A-Za-z0-9._-]+$/.test(clean) ? clean : `"${clean}"`;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const isoDate = (date: Date): string => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export interface ProjectQueryOptions {
  /** وسوم لهذا الاستعلام (الافتراضي كل وسوم الخطة). */
  readonly topics?: readonly string[];
  /** لغة البرمجة (language:). */
  readonly language?: string;
  readonly minStars?: number;
  /** نشط خلال آخر N يومًا (pushed:>=). */
  readonly pushedWithinDays?: number;
  readonly now?: Date;
}

export interface GeneratedQuery {
  readonly type: SearchType;
  /** نص الاستعلام الكامل الذي يراه المستخدم ويعدّله. */
  readonly query: string;
}

function withQualifiers(core: string, grouped: boolean, options: ProjectQueryOptions): string {
  const extra: string[] = [];
  if (options.language?.trim()) extra.push(`language:${quoteValue(options.language)}`);
  if (options.minStars && options.minStars > 0) extra.push(`stars:>=${Math.floor(options.minStars)}`);
  if (options.pushedWithinDays && options.pushedWithinDays > 0) {
    const since = new Date((options.now ?? new Date()).getTime() - options.pushedWithinDays * 86_400_000);
    extra.push(`pushed:>=${isoDate(since)}`);
  }
  if (!extra.length) return core;
  return `${grouped ? `(${core})` : core} ${extra.join(' ')}`;
}

/** مشاريع بوسوم عربية: topic:arabic OR topic:rtl … */
export function arabicTopicsQuery(options: ProjectQueryOptions = {}): GeneratedQuery {
  const topics = options.topics?.length ? options.topics : ARABIC_TOPICS;
  const core = topics.map((t) => `topic:${quoteValue(t)}`).join(' OR ');
  return { type: 'repositories', query: withQualifiers(core, topics.length > 1, options) };
}

/** مستودعات يرد في وصفها أو README كلمات عربية. */
export function arabicDescriptionQuery(options: ProjectQueryOptions = {}): GeneratedQuery {
  const core = '(العربية OR عربي OR arabic) in:description,readme';
  return { type: 'repositories', query: withQualifiers(core, false, options) };
}

export type TrendingSince = 'daily' | 'weekly' | 'monthly';
export const TRENDING_SINCE: readonly TrendingSince[] = ['daily', 'weekly', 'monthly'];

export interface TrendingOptions {
  readonly language?: string;
  readonly since: TrendingSince;
  /** لغة المستودع المكتوبة (spoken_language_code): خاصية للمحتوى لا لصاحب الحساب. */
  readonly spokenLanguage?: string;
}

/** رابط Trending: لغة البرمجة اختيارية، والفترة، ولغة المحتوى المنطوقة. */
export function trendingUrl(options: TrendingOptions): string {
  const slug = options.language?.trim().toLowerCase();
  const url = new URL(slug ? `${TRENDING_ORIGIN}/${encodeURIComponent(slug)}` : TRENDING_ORIGIN);
  url.searchParams.set('since', options.since);
  if (options.spokenLanguage) url.searchParams.set('spoken_language_code', options.spokenLanguage);
  return url.href;
}

/** قيمة location تُقتبس دائمًا كما في مثال الخطة (3.ح): location:"Riyadh". */
const quoteAlways = (value: string): string => `"${value.replace(/["\\]/g, '').trim()}"`;

/** استعلام مستخدمين بحقل location من صيغ مكتوبة: location:"A" OR location:"B" … */
export function locationQuery(variants: readonly string[], extra: { readonly language?: string } = {}): GeneratedQuery {
  const terms = variants.map((v) => `location:${quoteAlways(v)}`);
  const core = terms.join(' OR ');
  const language = extra.language?.trim();
  return { type: 'users', query: language ? `${terms.length > 1 ? `(${core})` : core} language:${quoteValue(language)}` : core };
}

/** كل استعلام مولَّد يجب أن يمر بالمدقق قبل عرضه؛ يعيد قائمة المشكلات (فارغة = سليم). */
export function generatedProblems(query: GeneratedQuery): string[] {
  return validateQuery(query.query, query.type).issues.filter((i) => i.severity === 'error').map((i) => i.message);
}
