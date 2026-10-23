// محرك البحث في القاموس (F-B6 / AC-B6): فهرس موحَّد يُبنى مرة واحدة من المداخل، واستعلام فوري بالعربية والإنجليزية والمرادفات مع
// تصفية بالتصنيف. بلا شبكة ولا تخزين: دالة نقية على بيانات مضمَّنة. الميزانية PB-03: أقل من 10ms من إدخال الحرف حتى ظهور النتائج؛
// الاستعلام نفسه بضع عشرات من الميكروثواني على القاموس كاملًا، والباقي رسم القائمة (يقيسه e2e في المتصفح).
//
// الدرجات (الأعلى أولًا؛ يُؤخذ لكل كلمة استعلام أفضل ما طابقته، وتُجمع الدرجات، وكل الكلمات شرط):
//   100 تطابق تام لاسم المصطلح أو لإحدى كلمات اسمه (عربيًا أو إنجليزيًا)، أو لمرادف معرَّف بتمامه (والاسم أولى عند التساوي)
//    80 بداية الاسم أو بداية إحدى كلماته        70 بداية مرادف أو إحدى كلماته
//    60 احتواء في الاسم                          50 احتواء في مرادف
//    30 ورود في الملخص أو «متى تُستخدم»          15 ورود في الشرح المتوسط أو المفصّل أو المعرّف
import type { Category, GlossaryEntry } from '../../../data/glossary/types';
import { normalizeText, queryWords, tokens } from './normalize';
import { synonymsFor } from './synonyms';
import type { SynonymSources } from './synonyms';

export const CATEGORY_IDS: readonly Category[] = ['repo', 'git', 'collab', 'deploy', 'security', 'account', 'settings'];

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  repo: 'المستودع والملفات',
  git: 'Git: الالتزامات والفروع والدمج',
  collab: 'التعاون: المشكلات وطلبات السحب',
  deploy: 'الإصدارات والأتمتة والنشر',
  security: 'الأمان والخصوصية والصلاحيات',
  account: 'الحساب والملف الشخصي',
  settings: 'الإعدادات والفوترة',
};

interface Indexed {
  readonly entry: GlossaryEntry;
  /** الاسمان العربي والإنجليزي موحَّدين. */
  readonly names: readonly string[];
  readonly synonyms: readonly string[];
  readonly nameTokens: readonly string[];
  readonly synonymTokens: readonly string[];
  readonly summary: string;
  readonly body: string;
}

export interface SearchIndex {
  readonly items: readonly Indexed[];
  readonly size: number;
}

export interface SearchOptions {
  readonly category?: Category | 'all' | undefined;
  /** أقصى عدد من النتائج. الافتراضي كلها. */
  readonly limit?: number;
}

export interface SearchHit {
  readonly entry: GlossaryEntry;
  readonly score: number;
  /** ما طابق أولًا: اسم أو مرادف أو ملخص أو شرح. */
  readonly via: 'name' | 'synonym' | 'summary' | 'body';
}

export function buildSearchIndex(entries: readonly GlossaryEntry[], sources: SynonymSources = {}): SearchIndex {
  const items = entries.map((entry): Indexed => {
    const names = [normalizeText(entry.ar), normalizeText(entry.en)].filter(Boolean);
    const synonyms = [...new Set(synonymsFor(entry, sources).map(normalizeText).filter(Boolean))].filter((s) => !names.includes(s));
    return {
      entry,
      names,
      synonyms,
      nameTokens: [...new Set(names.flatMap((n) => tokens(n)))],
      synonymTokens: [...new Set(synonyms.flatMap((n) => tokens(n)))],
      summary: normalizeText(`${entry.brief} ${entry.whenToUse}`),
      body: normalizeText(`${entry.medium} ${entry.detailed} ${entry.id.replace(/[_-]/g, ' ')}`),
    };
  });
  return { items, size: items.length };
}

const RANK: Record<SearchHit['via'], number> = { name: 0, synonym: 1, summary: 2, body: 3 };

/** أفضل درجة لكلمة (بصيغها) في مدخل، أو null إن لم تطابق. */
function scoreWord(item: Indexed, forms: readonly string[]): { score: number; via: SearchHit['via'] } | null {
  let best = null as { score: number; via: SearchHit['via'] } | null;
  // عند تساوي الدرجة يُفضَّل الاسم على المرادف على الملخص: «فرع» اسم المدخل نفسه لا «مطابقة بمرادف».
  const offer = (score: number, via: SearchHit['via']): void => {
    if (!best || score > best.score || (score === best.score && RANK[via] < RANK[best.via])) best = { score, via };
  };
  for (const form of forms) {
    if (item.names.includes(form)) offer(100, 'name');
    else if (item.nameTokens.some((t) => t === form)) offer(100, 'name');
    else if (item.names.some((n) => n.startsWith(form)) || item.nameTokens.some((t) => t.startsWith(form))) offer(80, 'name');
    else if (item.names.some((n) => n.includes(form))) offer(60, 'name');
    if (item.synonyms.includes(form)) offer(100, 'synonym');
    else if (item.synonymTokens.some((t) => t === form)) offer(75, 'synonym');
    else if (item.synonyms.some((s) => s.startsWith(form)) || item.synonymTokens.some((t) => t.startsWith(form))) offer(70, 'synonym');
    else if (item.synonyms.some((s) => s.includes(form))) offer(50, 'synonym');
    if (item.summary.includes(form)) offer(30, 'summary');
    if (item.body.includes(form)) offer(15, 'body');
  }
  return best;
}

/**
 * يبحث ويعيد المطابقات مرتبة بالدرجة ثم بنوع المطابقة ثم بترتيب القاموس. استعلام فارغ يعيد كل المداخل (في تصنيفها المصفّى) بترتيب القاموس:
 * تصفح القاموس بلا كتابة.
 */
export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchHit[] {
  const words = queryWords(query);
  const category = options.category && options.category !== 'all' ? options.category : null;
  const hits: SearchHit[] = [];
  for (const item of index.items) {
    if (category && item.entry.category !== category) continue;
    if (!words.length) {
      hits.push({ entry: item.entry, score: 0, via: 'name' });
      continue;
    }
    let total = 0;
    let via: SearchHit['via'] = 'body';
    let ok = true;
    for (const forms of words) {
      const hit = scoreWord(item, forms);
      if (!hit) {
        ok = false;
        break;
      }
      total += hit.score;
      if (RANK[hit.via] < RANK[via]) via = hit.via;
    }
    if (ok) hits.push({ entry: item.entry, score: total, via });
  }
  if (words.length) {
    const order = new Map(index.items.map((item, i) => [item.entry.id, i]));
    hits.sort((a, b) => b.score - a.score || RANK[a.via] - RANK[b.via] || (order.get(a.entry.id) ?? 0) - (order.get(b.entry.id) ?? 0));
  }
  return options.limit === undefined ? hits : hits.slice(0, options.limit);
}

/** عدد المداخل في كل تصنيف لاستعلام ما (بلا تصفية بالتصنيف)، فتظهر على أزرار التصفية. */
export function categoryCounts(index: SearchIndex, query: string): Record<Category | 'all', number> {
  const counts = { all: 0, repo: 0, git: 0, collab: 0, deploy: 0, security: 0, account: 0, settings: 0 } as Record<Category | 'all', number>;
  for (const hit of search(index, query)) {
    counts.all += 1;
    counts[hit.entry.category] += 1;
  }
  return counts;
}
