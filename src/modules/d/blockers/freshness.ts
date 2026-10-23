// شارة المصدر ووقت آخر قراءة وتنبيهات النقص والتقادم (T-5.2، F-D4، AC-D4). دوال نقية تأخذ الوقت مُدخلًا، فتُختبر بساعة متحكَّم بها.
//  - المصدر: «DOM» أو «DOM + API» بحسب ما قُرئ فعلًا.
//  - قائمة الفحوص المطوية جزئيًا: عدد الصفوف المقروءة أقل مما يعلنه الرمز المجمَّع لالتزام الرأس، أو check-runs أكثر من حد الصفحات.
//  - التقادم: مضت عتبة PP-01 (5 دقائق افتراضًا، قابلة للضبط) على آخر قراءة دون تحديث حي.
//  - التحديث الحي: تغيّرت قيمة كانت مقروءة بعد تعديل أجرته الصفحة نفسها؛ فتُعاد القراءة ويتجدد وقتها، وتُعلَن بيانات API الأقدم منه.
import type { PrSummary } from '../pr-status/summary';
import type { ApiPrData } from './api-read';

export interface CollapsedInfo {
  readonly read: number;
  readonly expected: number;
  readonly basis: string;
}

export type FreshnessAlert =
  | { readonly kind: 'collapsed'; readonly info: CollapsedInfo }
  | { readonly kind: 'stale'; readonly minutes: number }
  | { readonly kind: 'live-update'; readonly at: number; readonly apiOutdated: boolean }
  | { readonly kind: 'api-stale'; readonly minutes: number };

export interface FreshnessState {
  readonly now: number;
  /** وقت آخر قراءة لـDOM (أول قراءة، أو تحديث حي، أو إعادة قراءة صريحة). */
  readonly domReadAt: number;
  readonly apiReadAt: number | null;
  readonly liveUpdateAt: number | null;
  readonly staleMs: number;
}

export function collapsedInfo(summary: PrSummary, api: ApiPrData | null): CollapsedInfo | null {
  if (api?.checks.available && api.checks.value.partial) {
    const total = api.checks.value.checkRunsTotal;
    return { read: api.checks.value.items.length, expected: total ?? api.checks.value.items.length, basis: 'check-runs في API أكثر من حد الصفحات المقروءة' };
  }
  // قائمة API كاملة: لا تُقارن صفوف DOM بالرمز المجمَّع (أعداد المصدرين لا تُجمع، T-0.3).
  if (api?.checks.available) return null;
  const { checks } = summary;
  if (!checks.rollup.available || checks.rollup.value.total === null || !checks.items.length) return null;
  const total = checks.rollup.value.total;
  if (checks.items.length >= total) return null;
  return { read: checks.items.length, expected: total, basis: `الرمز المجمَّع لالتزام الرأس يعلن «${checks.rollup.value.label}»` };
}

export function freshnessAlerts(state: FreshnessState, collapsed: CollapsedInfo | null): FreshnessAlert[] {
  const alerts: FreshnessAlert[] = [];
  if (collapsed) alerts.push({ kind: 'collapsed', info: collapsed });
  if (state.liveUpdateAt !== null && state.liveUpdateAt >= state.domReadAt) {
    alerts.push({ kind: 'live-update', at: state.liveUpdateAt, apiOutdated: state.apiReadAt !== null && state.apiReadAt < state.liveUpdateAt });
  }
  const age = state.now - state.domReadAt;
  if (age >= state.staleMs) alerts.push({ kind: 'stale', minutes: Math.floor(age / 60_000) });
  if (state.apiReadAt !== null && state.now - state.apiReadAt >= state.staleMs) alerts.push({ kind: 'api-stale', minutes: Math.floor((state.now - state.apiReadAt) / 60_000) });
  return alerts;
}

/**
 * القيم المقروءة فعلًا (المتاحة) في الملخص، مفتاحًا بقيمة. التحديث الحي = قيمة مقروءة في القراءتين تغيّرت، أو تغيّرت أسماء الفحوص
 * وكلتاهما فيها صفوف؛ أما ظهور قيمة كانت غير متاحة فاكتمال رسم لا تحديث.
 */
export function readFacts(summary: PrSummary): Map<string, string> {
  const facts = new Map<string, string>();
  const put = (key: string, v: { available: boolean; value?: unknown }): void => {
    if (v.available) facts.set(key, JSON.stringify(v.value));
  };
  put('state', summary.state);
  put('commits', summary.commits);
  put('files', summary.files);
  put('additions', summary.additions);
  put('deletions', summary.deletions);
  put('reviews', summary.reviews.available ? { available: true, value: summary.reviews.value.state } : summary.reviews);
  put('conflicts', summary.conflicts);
  put('behind', summary.behind);
  put('rollup', summary.checks.rollup.available ? { available: true, value: summary.checks.rollup.value.label } : summary.checks.rollup);
  if (summary.headSha) facts.set('head', summary.headSha);
  if (summary.checks.items.length) {
    facts.set('checks', JSON.stringify(summary.checks.items.map((i) => `${i.name}=${i.classification.category}`).sort()));
  }
  return facts;
}

export function isLiveChange(before: Map<string, string>, after: Map<string, string>): boolean {
  for (const [key, value] of before) {
    const next = after.get(key);
    if (next !== undefined && next !== value) return true;
  }
  return false;
}
