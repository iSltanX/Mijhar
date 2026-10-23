// دمج قراءة API العامة في ملخص DOM بقواعد evidence/T-0.3 («مواصفة محلل الحالة المدمج»):
//  1. الهوية: check run بمعرّفه، وcommit status بسياقه؛ ولا تُجمع أعداد DOM مع أعداد API.
//  2. الأولوية لقيمة API (تميّز neutral وتشمل المخفي)، ثم DOM؛ ولكل عنصر مصدره. وشارة Required من DOM تُنقل إلى عنصر API المطابق.
//  3. التعارض من صندوق الدمج، وإلا mergeable_state = dirty، وإلا mergeable = true يعني لا تعارض، وإلا غير متاح؛ ولا استنتاج من الغياب.
//  5. «لا فحوص»: check-runs = 0 وcommit status = 0 معًا.
import { countCategories } from '../pr-status/categories';
import type { CheckItem, PrSummary } from '../pr-status/summary';
import { have } from '../pr-status/value';
import type { ApiPrData } from './api-read';

function mergeItems(dom: readonly CheckItem[], api: readonly CheckItem[]): CheckItem[] {
  const used = new Set<CheckItem>();
  const merged = api.map((item) => {
    const twin = dom.find((d) => !used.has(d) && ((item.id !== null && d.id === item.id) || d.name === item.name));
    if (!twin) return item;
    used.add(twin);
    return twin.required === true && item.required !== true ? { ...item, required: true } : item;
  });
  // ما يعرضه DOM ولا تعيده API (صفوف «Expected» للمسجَّل مثلًا) يبقى بمصدره.
  for (const item of dom) if (!used.has(item)) merged.push(item);
  return merged;
}

export function mergeApi(summary: PrSummary, api: ApiPrData | null): PrSummary {
  if (!api) return summary;
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
