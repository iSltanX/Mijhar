// مدخل حزمة اختبار (لا تُشحن) لـe2e الوحدة (د) في المتصفحات: يحقن window.MijharD بدوال يستدعيها run.mjs على الشيفرة التي تُشحن
// (createPrStatusModule وcreateCompareModule)، بتخطيط حقيقي. جزء status-details يخدمه خادم الاختبار المحلي بنفس الأصل، فيمرّ
// بـfetch حقيقي وDOMParser حقيقي في كل متصفح؛ ولا طلب إلى github.com ولا api.github.com.
import { createCompareModule } from '../../../../src/modules/d/compare';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import { mountInPage } from '../../browser-context';
import type { MountedModule } from '../../browser-context';

let mounted: MountedModule | null = null;
let pristine = '';
const requests: string[] = [];
const settle = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hosts = (id: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${id}"]`)];
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function fetchLocal(url: string, signal: AbortSignal): Promise<string> {
  requests.push(url);
  const response = await fetch(new URL(url, location.origin).href, { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function sameDocument(): { identical: boolean; firstDifference?: unknown } {
  const now = document.documentElement.outerHTML;
  if (now === pristine) return { identical: true };
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return { identical: false, firstDifference: { at, before: pristine.slice(Math.max(0, at - 60), at + 100), after: now.slice(Math.max(0, at - 60), at + 100) } };
}

async function mountPr(arg: { href: string; failFetch?: boolean }): Promise<unknown> {
  pristine = document.documentElement.outerHTML;
  requests.length = 0;
  mounted = mountInPage(
    createPrStatusModule({
      debounceMs: 20,
      fetchDetails: arg.failFetch
        ? async (url) => {
            requests.push(url);
            throw new Error('HTTP 503');
          }
        : fetchLocal,
    }),
    arg.href,
  );
  await settle(300);
  const [host] = hosts('d.pr-status');
  const root = host?.shadowRoot;
  const card = root?.querySelector<HTMLElement>('[data-card="pr-status"]');
  const field = (name: string) => ({ text: text(root?.querySelector(`[data-field="${name}"] dd`)), unavailable: root?.querySelector(`[data-field="${name}"] [data-available="false"]`) !== null });
  const chips = Object.fromEntries([...(root?.querySelectorAll('.d-chip') ?? [])].map((c, i) => [`${c.getAttribute('data-category')}#${Math.floor(i / 7)}`, Number(text(c.querySelector('.n')))]));
  const rect = card?.getBoundingClientRect();
  const header = document.querySelector('[data-component="PageHeader"], #partial-discussion-header, .gh-header');
  return {
    hosts: hosts('d.pr-status').length,
    afterHeader: host?.previousElementSibling === header,
    hasCard: card !== null,
    title: text(root?.querySelector('h2')),
    state: text(root?.querySelector('.d-state')),
    branches: field('branches'),
    behind: field('behind'),
    commits: field('commits'),
    files: field('files'),
    lines: field('lines'),
    reviews: field('reviews'),
    conflicts: field('conflicts'),
    groups: [...(root?.querySelectorAll('div[data-group]') ?? [])].map((g) => g.getAttribute('data-group')),
    chips,
    chipLabels: [...(root?.querySelectorAll('.d-chip span:first-child') ?? [])].slice(0, 7).map((s) => text(s)),
    checksState: root?.querySelector('[data-checks-state]')?.getAttribute('data-checks-state') ?? null,
    requiredUnavailable: root?.querySelector('[data-required="unavailable"]') !== null,
    checksText: text(root?.querySelector('[data-section="checks"]')).slice(0, 400),
    claimsReady: /جاهز للدمج|ready to merge/i.test(text(root?.querySelector('.d-card'))),
    requests: [...requests],
    layout: rect ? { width: Math.round(rect.width), height: Math.round(rect.height), vw: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 } : null,
    font: card ? getComputedStyle(card).fontFamily.slice(0, 60) : null,
  };
}

async function mountCompare(arg: { href: string }): Promise<unknown> {
  pristine = document.documentElement.outerHTML;
  mounted = mountInPage(createCompareModule({ debounceMs: 20 }), arg.href);
  await settle(300);
  const [factsHost, impactHost] = hosts('d.compare');
  const facts = factsHost?.shadowRoot?.querySelector<HTMLElement>('[data-section="facts"]') ?? null;
  const impact = impactHost?.shadowRoot?.querySelector<HTMLElement>('[data-section="impact"]') ?? null;
  const rows = Object.fromEntries([...(facts?.querySelectorAll('tbody tr, tfoot tr') ?? [])].map((r) => [r.getAttribute('data-kind'), [...r.querySelectorAll('td')].map((td) => text(td))]));
  const page = (name: string) => text(facts?.querySelector(`[data-field="${name}"] dd`));
  return {
    hosts: hosts('d.compare').length,
    siblings: factsHost?.parentNode === impactHost?.parentNode,
    nested: Boolean(factsHost && impactHost && (factsHost.contains(impactHost) || impactHost.contains(factsHost))),
    factsInImpact: Boolean(facts && impact && (facts.contains(impact) || impact.contains(facts))),
    kind: facts?.querySelector('.d-state')?.getAttribute('data-kind') ?? null,
    kindLabel: text(facts?.querySelector('.d-state')),
    pageFiles: page('page-files'),
    pageLines: page('page-lines'),
    read: page('read'),
    agreement: facts?.querySelector('[data-field="read"] dd')?.getAttribute('data-agreement') ?? null,
    completeness: facts?.querySelector('[data-completeness]')?.getAttribute('data-completeness') ?? null,
    rows,
    impactTag: text(impact?.querySelector('[data-review="human"]')),
    impactNotes: [...(impact?.querySelectorAll('[data-note]') ?? [])].map((n) => n.getAttribute('data-note')),
    impactHasTable: impact?.querySelector('table') !== null,
    factsHasImpactList: facts?.querySelector('[data-list="impact"]') !== null,
    border: { facts: facts ? getComputedStyle(facts).borderTopStyle : null, impact: impact ? getComputedStyle(impact).borderTopStyle : null },
    background: { facts: facts ? getComputedStyle(facts).backgroundColor : null, impact: impact ? getComputedStyle(impact).backgroundColor : null },
    factsRect: facts ? Math.round(facts.getBoundingClientRect().width) : null,
    vw: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
}

async function stop(): Promise<unknown> {
  const report = mounted?.stop();
  mounted = null;
  await settle(30);
  return { hosts: document.querySelectorAll('mijhar-host').length, restored: report?.restored ?? 0, skipped: report?.skipped.length ?? 0, ...sameDocument() };
}

const api: Record<string, (arg?: never) => unknown> = { mountPr, mountCompare, stop } as never;

// يخزّن نتيجة الوعد نصًّا في window.__mjResult (Firefox/Marionette لا يحلّ وعدًا من عالم الصفحة عبر حدود الأغلفة).
function call(name: string, argJson: string): boolean {
  const w = window as unknown as { __mjDone: boolean; __mjResult: string | null };
  w.__mjDone = false;
  w.__mjResult = null;
  const arg = argJson ? JSON.parse(argJson) : undefined;
  Promise.resolve()
    .then(() => (api[name] as (a?: unknown) => unknown)(arg))
    .then(
      (value) => void ((w.__mjResult = JSON.stringify(value ?? null)), (w.__mjDone = true)),
      (error) => void ((w.__mjResult = JSON.stringify({ error: String(error?.stack ?? error) })), (w.__mjDone = true)),
    );
  return true;
}

Object.assign(window, { MijharD: { call } });
