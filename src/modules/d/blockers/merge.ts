// دمج قراءة API العامة في ملخص DOM بقواعد evidence/T-0.3 («مواصفة محلل الحالة المدمج»):
//  0. هوية الالتزام (VR-03): لا دمج إلا إن كان رأس API هو رأس الصفحة الظاهر؛ وإلا يبقى ملخص DOM كما هو، ورأس مجهول ليس تطابقًا.
//  1. الهوية: check run بمعرّفه، وcommit status بسياقه؛ ولا تُجمع أعداد DOM مع أعداد API.
//  2. الأولوية لقيمة API (تميّز neutral وتشمل المخفي)، ثم DOM؛ ولكل عنصر مصدره. وشارة Required من DOM تُنقل إلى عنصر API المطابق.
//  3. التعارض من صندوق الدمج، وإلا mergeable_state = dirty، وإلا mergeable = true يعني لا تعارض، وإلا غير متاح؛ ولا استنتاج من الغياب.
//  5. «لا فحوص»: check-runs = 0 وcommit status = 0 معًا.
import { countCategories } from '../pr-status/categories';
import type { CheckItem, PrSummary } from '../pr-status/summary';
import { have } from '../pr-status/value';
import type { ApiPrData } from './api-read';

/**
 * اسم صف DOM بلا اسم سير العمل قبله ولا الحدث بعده («ci / build (pull_request)» ← «build»): check run في API يحمل اسم المهمة وحده. يُستعمل
 * لصف DOM بلا معرّف (لا رابط مهمة فيه)، وحين يطابق صفًا واحدًا وفحصًا واحدًا في API فقط، فلا يُدمج فحصان مختلفان (GEMINI-003).
 */
const bareName = (name: string): string => (name.replace(/\s*\([\w-]+\)\s*$/, '').split(' / ').at(-1) ?? name).trim();

function mergeItems(dom: readonly CheckItem[], api: readonly CheckItem[]): CheckItem[] {
  const used = new Set<CheckItem>();
  const merged = api.map((item) => {
    const loose = (): CheckItem | undefined => {
      if (api.filter((a) => a.name === item.name).length !== 1) return undefined;
      const candidates = dom.filter((d) => !used.has(d) && d.id === null && d.name !== item.name && bareName(d.name) === item.name);
      return candidates.length === 1 ? candidates[0] : undefined;
    };
    const twin = dom.find((d) => !used.has(d) && ((item.id !== null && d.id === item.id) || d.name === item.name)) ?? loose();
    if (!twin) return item;
    used.add(twin);
    return twin.required === true && item.required !== true ? { ...item, required: true } : item;
  });
  // ما يعرضه DOM ولا تعيده API (صفوف «Expected» للمسجَّل مثلًا) يبقى بمصدره.
  for (const item of dom) if (!used.has(item)) merged.push(item);
  return merged;
}

// قاعدة sameSha في الوحدة (ز): معرّفا التزام متطابقان ولو اختُصر أحدهما، بسبعة أحرف فأكثر.
function sameHead(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return Math.min(x.length, y.length) >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** هل قراءة API لالتزام الرأس الظاهر في الصفحة. رأس مجهول في أحدهما ليس تطابقًا؛ والعودة إلى رأس سابق تطابق. */
export function apiMatchesHead(summary: PrSummary, api: ApiPrData | null): boolean {
  return Boolean(api?.pull.available && summary.headSha && sameHead(summary.headSha, api.pull.value.headSha));
}

export function mergeApi(summary: PrSummary, api: ApiPrData | null): PrSummary {
  if (!api || !apiMatchesHead(summary, api)) return summary;
  let { conflicts, checks } = summary;
  if (!conflicts.available && api.pull.available) {
    const pull = api.pull.value;
    if (pull.mergeableState === 'dirty') conflicts = have(true);
    else if (pull.mergeable === true) conflicts = have(false);
  }
  if (api.checks.available) {
    const fromApi = api.checks.value;
    const items = mergeItems(checks.items, fromApi.items);
    checks = {
      ...checks,
      items,
      counts: countCategories(items.map((i) => i.classification)),
      source: items.length ? 'api' : checks.source,
      noneReported: fromApi.noneReported && !checks.items.length,
      detailsUrl: null,
      error: null,
    };
  }
  return { ...summary, conflicts, checks };
}
