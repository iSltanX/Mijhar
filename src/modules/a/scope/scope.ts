// نطاق كل إعداد في الوحدة (أ) (F-A7، AC-A7 بند ١): (1) كل GitHub، أو (2) مستودعات محددة owner/repo، أو (3) الصفحة الحالية مؤقتًا.
// النطاقان الأولان إعداد محفوظ (modules.a.<الميزة>)؛ والثالث تجاوز في الذاكرة لصفحة واحدة لا يُحفظ ويسقط بالتنقل عنها، ويعمل
// تشغيلًا أو إيقافًا فوق المحفوظ. القرار دالة نقية من الإعداد والصفحة والتجاوز.
import type { PageState } from '../../../core';

export type ScopeKind = 'all' | 'repos';

export interface FeatureSetting {
  readonly enabled: boolean;
  readonly scope: ScopeKind;
  /** owner/repo بحروف صغيرة؛ يُعتبر حين scope = 'repos'. */
  readonly repos: readonly string[];
}

export const MODULE_A_ID = 'a';
export const featureSettingKey = (featureId: string): string => `modules.${MODULE_A_ID}.${featureId}`;

// أسماء GitHub: المالك حروف وأرقام وشرطات، والمستودع يضيف النقطة والشرطة السفلية.
const REPO = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9._-]{1,100}$/;

/** owner/repo موحَّدًا بحروف صغيرة (أسماء GitHub لا تفرّق بين الحالتين)، أو null إن لم يصلح. */
export function normalizeRepo(value: string): string | null {
  const repo = value.trim().toLowerCase();
  return REPO.test(repo) ? repo : null;
}

export function isFeatureSetting(value: unknown): value is FeatureSetting {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => key !== 'enabled' && key !== 'scope' && key !== 'repos')) return false;
  if (typeof v.enabled !== 'boolean' || (v.scope !== 'all' && v.scope !== 'repos') || !Array.isArray(v.repos)) return false;
  return v.repos.every((repo) => typeof repo === 'string' && normalizeRepo(repo) === repo);
}

export type ScopeReason =
  | 'page-on'
  | 'page-off'
  | 'disabled'
  | 'all'
  | 'repo'
  | 'other-repo'
  | 'not-a-repo-page';

export interface ScopeDecision {
  readonly active: boolean;
  readonly reason: ScopeReason;
}

/** هل تعمل الميزة في هذه الصفحة؟ التجاوز المؤقت للصفحة يسبق المحفوظ. */
export function resolveScope(setting: FeatureSetting, page: Pick<PageState, 'owner' | 'repo'>, override?: boolean): ScopeDecision {
  if (override !== undefined) return { active: override, reason: override ? 'page-on' : 'page-off' };
  if (!setting.enabled) return { active: false, reason: 'disabled' };
  if (setting.scope === 'all') return { active: true, reason: 'all' };
  if (!page.owner || !page.repo) return { active: false, reason: 'not-a-repo-page' };
  const current = `${page.owner}/${page.repo}`.toLowerCase();
  return setting.repos.includes(current) ? { active: true, reason: 'repo' } : { active: false, reason: 'other-repo' };
}

/** هوية الصفحة للتجاوز المؤقت: الأصل والمسار (بلا استعلام ولا مرساة). */
export function pageIdentity(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return href;
  }
}

/** تجاوزات «الصفحة الحالية مؤقتًا»: في الذاكرة فقط، لصفحة واحدة، وتسقط بالتنقل عنها (prune). */
export class PageOverrides {
  private page: string | null = null;
  private readonly values = new Map<string, boolean>();
  private readonly listeners = new Set<(featureId: string) => void>();

  /** يشغّل الميزة (true) أو يوقفها (false) في هذه الصفحة وحدها، أو يزيل التجاوز (null). */
  set(featureId: string, href: string, value: boolean | null): void {
    this.prune(href);
    const before = this.values.get(featureId);
    if (value === null) this.values.delete(featureId);
    else this.values.set(featureId, value);
    if (before !== (value ?? undefined)) for (const listener of [...this.listeners]) listener(featureId);
  }

  get(featureId: string, href: string): boolean | undefined {
    return this.page === pageIdentity(href) ? this.values.get(featureId) : undefined;
  }

  /** يُسقط تجاوزات أي صفحة غير هذه. */
  prune(href: string): void {
    const identity = pageIdentity(href);
    if (this.page === identity) return;
    this.page = identity;
    this.values.clear();
  }

  subscribe(listener: (featureId: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
