// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-PR-03 (AC-D3): كل مانع دمج مقرون بدليل مرصود (نص في صندوق الدمج أو حقل في API)، ولا سبب بلا دليل، والتنبيه المنهجي ظاهر
// دائمًا، ولا تظهر عبارة «جاهز للدمج» في أي حالة من العينات.
// TEST-PR-04 (AC-D4): الشارة تعرض المصدر (DOM أو DOM + API) ووقت آخر قراءة؛ والتنبيهات الثلاثة (قائمة مطوية، عتبة التقادم PP-01،
// تحديث حي)؛ ويتجدد الوقت بعد التحديث. بساعة اختبار متحكَّم بها.
import { describe, expect, it, vi } from 'vitest';
import type { PagedResult, PublicApiPort, PublicApiResult, PublicApiStatus } from '../../../src/core';
import { METHOD_NOTICE, apiMatchesHead, blocker, clock, collapsedInfo, minutesText, explainBlockers, freshnessAlerts, isLiveChange, mergeApi, readDomEvidence, readFacts, readPrApi } from '../../../src/modules/d/blockers';
import type { ApiPrData } from '../../../src/modules/d/blockers';
import { PR_STATUS_SELECTORS, createPrStatusModule, readPrSummary } from '../../../src/modules/d/pr-status';
import type { FetchDetails } from '../../../src/modules/d/pr-status';
import { ROOT, flush, hostsOf, loadHtml, mountModules, readFixture, selectorsWith, shadowText } from './helpers';

const REAL_PR = `${ROOT}/fixtures/spikes/gh-pr-watad-80.html`;
const READY = /جاهز للدمج|جاهزة للدمج|ready to merge|can be merged|يمكن الدمج/i;
const selectors = () => selectorsWith(PR_STATUS_SELECTORS);
const fragment: FetchDetails = async () => readFixture('fixture-status-details.html');
const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';

// ---- API وهمية بلا شبكة: ردود مسجلة لكل مسار ----

const ok = <T,>(data: T, at = 1): PublicApiResult<T> => ({ ok: true, status: 200, data, fromCache: false, readAt: at, rate: { limit: 60, remaining: 52, used: 8, reset: 1_792_737_281, resource: 'core', readAt: at } });

interface FakeApi extends PublicApiPort {
  readonly calls: string[];
  granted: boolean;
}

function fakeApi(routes: Record<string, unknown>, granted = true): FakeApi {
  const calls: string[] = [];
  const api: FakeApi = {
    calls,
    granted,
    status: vi.fn(async (): Promise<PublicApiStatus> => ({ granted: api.granted, rate: null })),
    get: vi.fn(async (path: string): Promise<PublicApiResult<unknown>> => {
      calls.push(path);
      if (!(path in routes)) return { ok: false, failure: 'not-found', status: 404, message: 'Not Found', retryAt: null, readAt: 1, rate: null };
      return ok(routes[path]);
    }) as unknown as PublicApiPort['get'],
    getAll: vi.fn(async (path: string, key: 'check_runs' | 'statuses' | null): Promise<PublicApiResult<PagedResult<unknown>>> => {
      calls.push(path);
      const body = routes[path] as Record<string, unknown> | undefined;
      if (!body) return { ok: false, failure: 'not-found', status: 404, message: 'Not Found', retryAt: null, readAt: 1, rate: null };
      const items = (key ? body[key] : body) as unknown[];
      return ok({ items, total: (body.total_count as number) ?? items.length, partial: false, pages: 1 });
    }) as unknown as PublicApiPort['getAll'],
  };
  return api;
}

const ROUTES_COMPLEX = {
  '/repos/octo/demo/pulls/4242': { number: 4242, state: 'open', draft: false, merged: false, mergeable: false, mergeable_state: 'dirty', head: { sha: HEAD }, base: { ref: 'main' } },
  [`/repos/octo/demo/commits/${HEAD}/check-runs`]: {
    total_count: 3,
    check_runs: [
      { id: 9001, name: 'ci / lint (pull_request)', status: 'completed', conclusion: 'failure', output: { title: 'Lint failed' } },
      { id: 9004, name: 'ci / build (pull_request)', status: 'in_progress', conclusion: null },
      { id: 9010, name: 'copilot-pull-request-reviewer', status: 'completed', conclusion: 'neutral' },
    ],
  },
  [`/repos/octo/demo/commits/${HEAD}/status`]: { state: 'success', total_count: 1, statuses: [{ context: 'EasyCLA', state: 'success', description: 'All signed' }] },
  '/repos/octo/demo/branches/main': { name: 'main', protected: true, protection: { required_status_checks: { contexts: ['ci / lint (pull_request)', 'ci / build (pull_request)', 'EasyCLA'] } } },
};

async function apiData(routes: Record<string, unknown>, owner = 'octo', repo = 'demo', number = 4242): Promise<ApiPrData> {
  return readPrApi(fakeApi(routes), owner, repo, number, () => 10_000);
}

const report = (file: string, api: ApiPrData | null = null, mutate?: (doc: Document) => void) => {
  loadHtml(file);
  mutate?.(document);
  const summary = mergeApi(readPrSummary(document, selectors(), { pageNumber: 4242 }), api);
  return explainBlockers(summary, readDomEvidence(document, selectors()), api);
};

describe('TEST-PR-03: الموانع بأدلتها', () => {
  it('العينة المعقدة (صندوق دمج مسجَّل): كل مانع بعبارته المنقولة من صندوق الدمج أو صف فحص إلزامي', () => {
    const r = report('fixture-pr-complex.html');
    expect(r.state).toBe('explained');
    expect(r.blockers.map((b) => b.id).sort()).toEqual(['conflicts', 'required-failed', 'required-pending', 'review-required']);
    expect(r.attention.map((b) => b.id)).toEqual(['behind']);
    const byId = Object.fromEntries([...r.blockers, ...r.attention].map((b) => [b.id, b]));
    expect(byId.conflicts?.evidence).toEqual([{ source: 'dom', where: 'صندوق الدمج', text: 'This branch has conflicts that must be resolved', quoted: ['This branch has conflicts that must be resolved'] }]);
    expect(byId['review-required']?.evidence[0]?.text).toBe('Review required');
    expect(byId.behind?.evidence[0]?.text).toBe('This branch is out-of-date with the base branch');
    expect(byId['required-failed']?.evidence.map((e) => [e.text, e.note])).toEqual([['ci / lint (pull_request) — Failing after 4m (Required)', 'التصنيف: فاشل']]);
    expect(byId['required-pending']?.evidence.map((e) => [e.text, e.note])).toEqual([
      ['ci / build (pull_request) — In progress — This check has started... (Required)', 'التصنيف: قيد التشغيل'],
      ['Linux / Browser — Expected — Waiting for status to be reported (Required)', 'التصنيف: لم يُشغَّل'],
    ]);
    // الفاشل غير الإلزامي ملاحظة لا مانع.
    expect(r.notes.join(' ')).toContain('preview-deploy');
    // كل دليل نصه موجود حرفيًا في الصفحة (بعد ضغط المسافات) أو في صف فحص.
    const page = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    for (const b of [...r.blockers, ...r.attention]) for (const e of b.evidence) expect(page).toContain(e.text.split(' — ')[0]);
  });

  it('لا مانع بلا دليل: blocker() يرفض الدليل الفارغ، وكل مانع في كل العينات له دليل واحد على الأقل', async () => {
    expect(blocker('x', 'سبب', 'blocks', [])).toBeNull();
    expect(blocker('x', 'سبب', 'blocks', [{ source: 'dom', where: 'w', text: '   ' }])).toBeNull();
    const api = await apiData(ROUTES_COMPLEX);
    for (const r of [report('fixture-pr-complex.html'), report(REAL_PR), report('fixture-pr-complex.html', api), report(REAL_PR, await apiData(ROUTES_COMPLEX))]) {
      for (const b of [...r.blockers, ...r.attention]) expect(b.evidence.length, b.id).toBeGreaterThan(0);
    }
  });

  it('صفحة حقيقية لغير مسجَّل (Watad#80): لا صندوق دمج، فطلب التغييرات من الشريط الجانبي «قد يمنع»، والموانع الأخرى غير متاحة معلنة', () => {
    const r = report(REAL_PR);
    expect(r.blockers).toEqual([]);
    expect(r.attention.map((b) => [b.id, b.evidence[0]?.text])).toEqual([['changes-requested', 'Om4rMu requested changes']]);
    expect(r.notes.join(' ')).toContain('صندوق الدمج لا يعرضه GitHub لغير المسجَّل');
  });

  it('API: mergeable_state = dirty دليل ثانٍ للتعارض، والفحوص الإلزامية من حماية الفرع، وneutral لا يُعدّ فشلًا', async () => {
    const api = await apiData(ROUTES_COMPLEX);
    const r = report('fixture-pr-complex.html', api);
    const conflicts = r.blockers.find((b) => b.id === 'conflicts');
    expect(conflicts?.evidence.map((e) => [e.source, e.text])).toEqual([
      ['dom', 'This branch has conflicts that must be resolved'],
      ['api', 'mergeable_state = dirty'],
    ]);
    expect(conflicts?.evidence[1]?.where).toBe('/repos/octo/demo/pulls/4242');
    expect(r.sources).toEqual(['dom', 'api']);
    expect(JSON.stringify(r)).not.toContain('copilot-pull-request-reviewer');
  });

  it('API وحدها لغير المسجَّل: blocked وdraft وbehind وunstable وclean وunknown بقيمها كما هي', async () => {
    const pull = (state: string, extra: object = {}) => ({ ...ROUTES_COMPLEX, '/repos/Watad-Project/Watad/pulls/80': { number: 80, state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: state, head: { sha: HEAD }, base: { ref: 'main' }, ...extra } });
    const read = async (state: string, extra: object = {}) => report(REAL_PR, await apiData(pull(state, extra), 'Watad-Project', 'Watad', 80));
    expect((await read('blocked')).blockers.map((b) => [b.id, b.evidence.at(-1)?.text])).toContainEqual(['protection', 'mergeable_state = blocked']);
    const draft = await read('draft', { draft: true });
    expect(draft.blockers.find((b) => b.id === 'draft')?.evidence.map((e) => e.text)).toEqual(['draft = true', 'mergeable_state = draft']);
    expect((await read('behind')).attention.map((b) => b.id)).toContain('behind');
    expect((await read('unstable')).notes.join(' ')).toContain('mergeable_state = unstable');
    const clean = await read('clean');
    expect(clean.blockers).toEqual([]);
    expect(clean.notes.join(' ')).toContain('لا تعلن API مانعًا (mergeable_state = clean)');
    expect((await read('unknown')).notes.join(' ')).toContain('لم يحسب GitHub قابلية الدمج بعد');
  });

  it('المسودة من الترويسة، والمدموج والمغلق لا يُفسَّر منعهما', () => {
    const draft = report('fixture-pr-complex.html', null, (doc) => {
      const label = doc.querySelector('[data-component="StateLabel"]') as Element;
      label.setAttribute('data-status', 'pullDraft');
      label.lastChild!.textContent = 'Draft';
    });
    expect(draft.blockers.find((b) => b.id === 'draft')?.evidence).toEqual([{ source: 'dom', where: 'ترويسة الطلب', text: 'شارة الحالة: Draft', quoted: ['Draft'] }]);
    const merged = report('fixture-pr-complex.html', null, (doc) => doc.querySelector('[data-component="StateLabel"]')!.setAttribute('data-status', 'pullMerged'));
    expect(merged).toMatchObject({ state: 'closed', blockers: [], attention: [] });
  });

  it('البطاقة: التنبيه المنهجي ظاهر دائمًا ولا عبارة جاهزية في أي عينة (مسجَّل، غير مسجَّل، API، مدموج، بلا مانع)', async () => {
    const cases: Array<{ file: string; api?: Record<string, unknown>; mutate?: (doc: Document) => void }> = [
      { file: 'fixture-pr-complex.html' },
      { file: REAL_PR },
      { file: 'fixture-pr-complex.html', api: ROUTES_COMPLEX },
      { file: 'fixture-pr-complex.html', mutate: (doc) => doc.querySelector('[data-component="StateLabel"]')!.setAttribute('data-status', 'pullMerged') },
      // بلا مانع: صندوق دمج لا يذكر إلا فحوصًا ناجحة.
      { file: 'fixture-pr-complex.html', mutate: (doc) => { const box = doc.querySelector('[data-testid="mergebox-partial"]') as Element; box.innerHTML = '<h3>Merge info</h3><section><h4>All checks have passed</h4><ul><li><svg class="octicon octicon-check color-fg-success"></svg><strong>ci</strong> <span class="color-fg-muted text-small">Successful</span> <span class="Label">Required</span></li></ul></section><p>This branch has no conflicts with the base branch</p>'; } },
    ];
    for (const c of cases) {
      loadHtml(c.file);
      c.mutate?.(document);
      const port = c.api ? fakeApi(c.api) : null;
      const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: port, staleMs: () => 300_000 })]);
      await flush(20);
      const card = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
      if (port) {
        (card.querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
        await flush(20);
      }
      const text = shadowText(hostsOf('d.pr-status')[0]);
      expect(card.querySelector('[data-notice="method"]')?.textContent, c.file).toBe(METHOD_NOTICE);
      expect(text, c.file).not.toMatch(READY);
      // كل مانع معروض معه دليل معروض.
      for (const li of card.querySelectorAll('[data-blocker]')) expect(li.querySelectorAll('[data-evidence-source]').length).toBeGreaterThan(0);
      manager.stop();
    }
  });

  it('بلا مانع في الأدلة: يُقال ذلك ومعه أن غيابه لا يثبت إمكان الدمج', async () => {
    loadHtml('fixture-pr-complex.html');
    const box = document.querySelector('[data-testid="mergebox-partial"]') as Element;
    box.innerHTML = '<h3>Merge info</h3><p>This branch has no conflicts with the base branch</p>';
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: null, staleMs: () => 300_000 })]);
    const card = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    expect(card.querySelector('[data-blockers-state="none-found"]')?.textContent).toContain('غيابه فيها لا يثبت أن الدمج ممكن');
    manager.stop();
  });
});

describe('TEST-PR-04: المصدر والوقت والتنبيهات (وحدة)', () => {
  const base = { now: 0, domReadAt: 0, apiReadAt: null, liveUpdateAt: null, staleMs: 5 * 60_000 };

  it('صيغة الدقائق', () => {
    expect([1, 2, 5, 10, 11, 60].map(minutesText)).toEqual(['دقيقة واحدة', 'دقيقتان', '5 دقائق', '10 دقائق', '11 دقيقة', '60 دقيقة']);
  });

  it('لا تنبيه في البداية؛ والتقادم عند بلوغ العتبة بالضبط', () => {
    expect(freshnessAlerts(base, null)).toEqual([]);
    expect(freshnessAlerts({ ...base, now: 5 * 60_000 - 1 }, null)).toEqual([]);
    expect(freshnessAlerts({ ...base, now: 5 * 60_000 }, null)).toEqual([{ kind: 'stale', minutes: 5 }]);
  });

  it('التحديث الحي يُعلَن، وبيانات API الأقدم منه تُعلَن', () => {
    expect(freshnessAlerts({ ...base, now: 1000, domReadAt: 900, liveUpdateAt: 900, apiReadAt: 500 }, null)).toEqual([{ kind: 'live-update', at: 900, apiOutdated: true }]);
    expect(freshnessAlerts({ ...base, now: 1000, domReadAt: 900, liveUpdateAt: 900, apiReadAt: 950 }, null)).toEqual([{ kind: 'live-update', at: 900, apiOutdated: false }]);
  });

  it('القائمة المطوية: صفوف أقل مما يعلنه الرمز المجمَّع (9 من 12 في العينة المعقدة)، أو check-runs جزئية من API', async () => {
    loadHtml('fixture-pr-complex.html');
    const summary = readPrSummary(document, selectors(), { pageNumber: 4242 });
    expect(collapsedInfo(summary, null)).toEqual({ read: 9, expected: 12, basis: 'rollup', label: '6 / 12 checks OK' });
    const api = await apiData(ROUTES_COMPLEX);
    expect(collapsedInfo(mergeApi(summary, api), api)).toBeNull();
    const partial = { ...api, checks: api.checks.available ? { available: true as const, value: { ...api.checks.value, partial: true, checkRunsTotal: 340 } } : api.checks };
    // VR-06: المتوقع إجمالي المصدرين كلٌّ بعدّه (340 check-run وcommit status واحد)، لا إجمالي check-runs أمام مقروء يشمل statuses.
    expect(collapsedInfo(summary, partial)).toMatchObject({ read: 4, expected: 341, basis: 'api-pages' });
  });

  it('التحديث الحي = قيمة مقروءة تغيّرت؛ لا ظهور قيمة كانت غير متاحة', () => {
    expect(isLiveChange(new Map([['commits', '3']]), new Map([['commits', '4']]))).toBe(true);
    expect(isLiveChange(new Map(), new Map([['commits', '4']]))).toBe(false);
    expect(isLiveChange(new Map([['commits', '3']]), new Map([['commits', '3'], ['rollup', '"1 / 1"']]))).toBe(false);
    loadHtml('fixture-pr-complex.html');
    expect(readFacts(readPrSummary(document, selectors())).get('commits')).toBe('3');
  });
});

describe('TEST-PR-04: على البطاقة بساعة متحكَّم بها', () => {
  const mount = async (options: { api?: PublicApiPort | null; clock: { now: number } }) => {
    loadHtml('fixture-pr-complex.html');
    const { manager } = await mountModules([
      createPrStatusModule({ debounceMs: 5, tickMs: 10, fetchDetails: fragment, api: options.api ?? null, now: () => options.clock.now, staleMs: () => 5 * 60_000 }),
    ]);
    await flush(20);
    const card = (): ShadowRoot => hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    return { manager, card };
  };
  const T0 = Date.UTC(2026, 9, 23, 9, 0, 0);

  it('المصدر DOM ووقت آخر قراءة، وتنبيه القائمة المطوية من البداية', async () => {
    const time = { now: T0 };
    const { manager, card } = await mount({ clock: time });
    expect(card().querySelector('.d-freshness')?.getAttribute('data-source')).toBe('DOM');
    expect(card().querySelector('.d-badge time')?.textContent).toBe(clock(T0));
    expect(card().querySelector('[data-alert="collapsed"]')?.textContent).toContain('قُرئ 9 من 12');
    expect(card().querySelector('[data-alert="stale"]')).toBeNull();
    manager.stop();
  });

  it('عتبة التقادم: يظهر التنبيه بعد 5 دقائق بلا تحديث حي، و«أعد القراءة» يجدد الوقت ويزيله', async () => {
    const time = { now: T0 };
    const { manager, card } = await mount({ clock: time });
    time.now = T0 + 5 * 60_000;
    await flush(30);
    expect(card().querySelector('[data-alert="stale"]')?.textContent).toContain('مضت 5 دقائق');
    time.now = T0 + 6 * 60_000;
    (card().querySelector('[data-action="refresh"]') as HTMLButtonElement).click();
    await flush(30);
    expect(card().querySelector('[data-alert="stale"]')).toBeNull();
    expect(card().querySelector('.d-badge time')?.textContent).toBe(clock(T0 + 6 * 60_000));
    manager.stop();
  });

  it('تحديث حي (الالتزامات 3 ← 4): يُعلَن بوقته ويتجدد وقت القراءة، فلا تقادم بعده حتى تمضي العتبة من جديد', async () => {
    const time = { now: T0 };
    const { manager, card } = await mount({ clock: time });
    time.now = T0 + 4 * 60_000;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.includes('wants to merge 3 commits')) node.nodeValue = node.nodeValue.replace('3 commits', '4 commits');
    await flush(40);
    const live = card().querySelector('[data-alert="live-update"]');
    expect(live?.textContent).toContain('ورد تحديث حي');
    expect(live?.querySelector('time')?.textContent).toBe(clock(T0 + 4 * 60_000));
    expect(card().querySelector('.d-badge time')?.textContent).toBe(clock(T0 + 4 * 60_000));
    time.now = T0 + 6 * 60_000;
    await flush(30);
    expect(card().querySelector('[data-alert="stale"]')).toBeNull();
    time.now = T0 + 9 * 60_000;
    await flush(30);
    expect(card().querySelector('[data-alert="stale"]')).not.toBeNull();
    manager.stop();
  });

  it('تعديل لا يغيّر قيمة مقروءة ليس تحديثًا حيًا ولا يجدد الوقت', async () => {
    const time = { now: T0 };
    const { manager, card } = await mount({ clock: time });
    time.now = T0 + 60_000;
    document.querySelector('main')?.append(document.createElement('span'));
    await flush(40);
    expect(card().querySelector('[data-alert="live-update"]')).toBeNull();
    expect(card().querySelector('.d-badge time')?.textContent).toBe(clock(T0));
    manager.stop();
  });

  it('API: لا طلب بلا نقر؛ وبعده المصدر «DOM + API» ووقت قراءتها؛ وتحديث حي بعدها يعلن أنها أقدم', async () => {
    const time = { now: T0 };
    const api = fakeApi(ROUTES_COMPLEX);
    const { manager, card } = await mount({ api, clock: time });
    expect(api.calls).toEqual([]);
    time.now = T0 + 30_000;
    (card().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(30);
    expect(api.calls).toEqual(['/repos/octo/demo/pulls/4242', `/repos/octo/demo/commits/${HEAD}/check-runs`, `/repos/octo/demo/commits/${HEAD}/status`, '/repos/octo/demo/branches/main']);
    expect(card().querySelector('.d-freshness')?.getAttribute('data-source')).toBe('DOM + API');
    expect([...card().querySelectorAll('.d-badge time')].map((t) => t.textContent)).toEqual([clock(T0), clock(T0 + 30_000)]);
    expect(card().querySelector('[data-checks-source="api"]')).not.toBeNull();
    // القائمة الكاملة من API: لا تنبيه طيّ.
    expect(card().querySelector('[data-alert="collapsed"]')).toBeNull();
    time.now = T0 + 60_000;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.includes('wants to merge 3 commits')) node.nodeValue = node.nodeValue.replace('3 commits', '5 commits');
    await flush(40);
    expect(card().querySelector('[data-alert="live-update"]')?.textContent).toContain('بيانات API قُرئت قبله');
    expect(card().querySelector('[data-action="api-refresh"]')).not.toBeNull();
    manager.stop();
  });

  it('تدقيق شبكة: بلا صلاحية لا يصدر أي طلب API، ويُعرض زر فتح الإعدادات وحده', async () => {
    const time = { now: T0 };
    const api = fakeApi(ROUTES_COMPLEX, false);
    const openSettings = vi.fn();
    loadHtml('fixture-pr-complex.html');
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api, now: () => time.now, staleMs: () => 300_000, openSettings })]);
    await flush(20);
    const card = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    expect(card.querySelector('[data-api-state="not-granted"]')).not.toBeNull();
    expect(card.querySelector('[data-action="api-read"]')).toBeNull();
    (card.querySelector('[data-action="open-settings"]') as HTMLButtonElement).click();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(api.calls).toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.getAll).not.toHaveBeenCalled();
    manager.stop();
  });

  it('فشل API يُعلَن ولا يُعرض نجاحًا، وتبقى البطاقة على DOM', async () => {
    const time = { now: T0 };
    const api = fakeApi({});
    const { manager, card } = await mount({ api, clock: time });
    (card().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(30);
    expect(card().querySelector('[data-api-error="pull"]')?.textContent).toContain('404');
    expect(card().querySelector('.d-freshness')?.getAttribute('data-source')).toBe('DOM');
    manager.stop();
  });
});

describe('هوية التزام الرأس بين DOM وAPI (VR-03)', () => {
  const A = HEAD;
  const B = 'b'.repeat(40);
  const LINT = 'ci / lint (pull_request)';
  const routesFor = (head: string, lint: string) => ({
    '/repos/octo/demo/pulls/4242': { number: 4242, state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: 'blocked', head: { sha: head }, base: { ref: 'main' } },
    [`/repos/octo/demo/commits/${head}/check-runs`]: { total_count: 1, check_runs: [{ id: 9001, name: LINT, status: 'completed', conclusion: lint }] },
    [`/repos/octo/demo/commits/${head}/status`]: { total_count: 0, statuses: [] },
    '/repos/octo/demo/branches/main': { name: 'main', protected: true, protection: { required_status_checks: { contexts: [LINT] } } },
  });
  const lintOf = (summary: { checks: { items: readonly { name: string; classification: { category: string } }[] } }) => summary.checks.items.find((i) => i.name === LINT)?.classification.category;

  it('mergeApi يعيد ملخص DOM كما هو حين يختلف رأس API أو يُجهل أحدهما، ويدمج عند التطابق ولو مختصرًا (7 أحرف فأكثر)', async () => {
    loadHtml('fixture-pr-complex.html');
    const summary = readPrSummary(document, selectors(), { pageNumber: 4242 });
    expect(summary.headSha).toBe(A);
    const api = await apiData(routesFor(A, 'success'));
    expect(apiMatchesHead(summary, api)).toBe(true);
    expect(lintOf(mergeApi(summary, api))).toBe('success');
    for (const head of [B, null, A.slice(0, 6)]) {
      const other = { ...summary, headSha: head };
      expect(apiMatchesHead(other, api)).toBe(false);
      expect(mergeApi(other, api)).toBe(other);
      expect(lintOf(mergeApi(other, api))).toBe('failure');
    }
    expect(lintOf(mergeApi({ ...summary, headSha: A.slice(0, 7) }, api))).toBe('success');
  });

  it('رد API متأخر للالتزام A بعد أن صار الرأس الظاهر B: فشل B يبقى في الملخص والموانع، ولا يظهر نجاح A، ويُنبَّه أنها لالتزام آخر', async () => {
    const time = { now: Date.UTC(2026, 9, 23, 9, 0, 0) };
    const api = fakeApi({ ...routesFor(A, 'success'), ...routesFor(B, 'failure') });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pulls = { [A]: true } as Record<string, boolean>;
    const get = api.get;
    let head = A;
    // يعيد رأس الالتزام كما كان وقت إرسال الطلب (الرد الأول متأخر عند البوابة).
    api.get = (async (path: string) => {
      const sent = head;
      if (path.endsWith('/pulls/4242') && pulls[sent]) {
        await gate;
        return { ...(await get(path)), data: routesFor(sent, 'success')['/repos/octo/demo/pulls/4242'] };
      }
      return get(path);
    }) as PublicApiPort['get'];
    loadHtml('fixture-pr-complex.html');
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, tickMs: 10_000, fetchDetails: fragment, api, now: () => time.now, staleMs: () => 300_000 })]);
    await flush(20);
    const card = (): ShadowRoot => hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    (card().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(10);
    // يغيّر رأس الصفحة الظاهر بالنتائج نفسها فيها (lint فاشل): دفع التزام جديد أو الرجوع إلى سابق.
    const push = async (from: string, to: string) => {
      for (const el of document.querySelectorAll('*')) {
        if (el.closest('mijhar-host')) continue;
        for (const attr of [...el.attributes]) if (attr.value.includes(from)) el.setAttribute(attr.name, attr.value.replaceAll(from, to));
        if (el.localName === 'script' && el.textContent?.includes(from)) el.textContent = el.textContent.replaceAll(from, to);
      }
      await flush(40);
    };
    head = B;
    await push(A, B);
    release();
    await flush(60);
    const shown = () => [...card().querySelectorAll('[data-category]')].filter((li) => li.textContent?.includes(LINT)).map((li) => li.getAttribute('data-category'));
    expect(shown()).toEqual(['failure']);
    expect(card().querySelector('[data-checks-source="api"]')).toBeNull();
    expect(card().querySelector('.d-freshness')?.getAttribute('data-source')).toBe('DOM');
    const lintEvidence = [...card().querySelectorAll('[data-evidence-source]')].filter((e) => e.textContent?.includes(LINT));
    expect(lintEvidence.length).toBeGreaterThan(0);
    expect(lintEvidence.every((e) => e.getAttribute('data-evidence-source') === 'dom')).toBe(true);
    expect(card().querySelector('[data-api-mismatch]')?.textContent).toContain('التزام آخر');
    expect(card().querySelector('[data-section="checks"]')?.textContent).toContain(`${LINT} — فاشل`);

    // الرجوع إلى A (A ← B ← A) تطابق صحيح: تُدمج قراءة A المحفوظة؛ ثم B من جديد فلا تُدمج.
    await push(B, A);
    expect(card().querySelector('[data-api-mismatch]')).toBeNull();
    expect(card().querySelector('[data-checks-source="api"]')).not.toBeNull();
    await push(A, B);
    expect(card().querySelector('[data-api-mismatch]')).not.toBeNull();
    expect(shown()).toEqual(['failure']);

    // قراءة تطابق B تُدمج كالمعتاد.
    pulls[B] = false;
    (card().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(60);
    expect(card().querySelector('[data-api-mismatch]')).toBeNull();
    expect(card().querySelector('[data-checks-source="api"]')).not.toBeNull();
    expect(shown()).toEqual(['failure']);
    manager.stop();
  });
});

describe('نقص صفحات commit statuses (VR-06)', () => {
  it('check-runs كاملة وstatuses ناقصة: partial، والعددان من المصدرين كلٌّ بإجماليه، وتنبيه الطي في البطاقة', async () => {
    const statuses = Array.from({ length: 100 }, (_, i) => ({ context: `status-${i}`, state: 'success' }));
    const port = fakeApi(ROUTES_COMPLEX);
    const getAll = port.getAll;
    port.getAll = (async (path: string, key: 'check_runs' | 'statuses' | null) =>
      key === 'statuses' ? ok({ items: statuses, total: 101, partial: true, pages: 1 }) : getAll(path, key)) as PublicApiPort['getAll'];
    const api = await readPrApi(port, 'octo', 'demo', 4242, () => 10_000);
    expect(api.checks.available && api.checks.value).toMatchObject({ partial: true, checkRunsTotal: 3, statusesTotal: 101 });
    loadHtml('fixture-pr-complex.html');
    const summary = readPrSummary(document, selectors(), { pageNumber: 4242 });
    expect(collapsedInfo(mergeApi(summary, api), api)).toEqual({ read: 103, expected: 104, basis: 'api-pages', label: null });

    const time = { now: Date.UTC(2026, 9, 23, 9, 0, 0) };
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, tickMs: 10_000, fetchDetails: fragment, api: port, now: () => time.now, staleMs: () => 300_000 })]);
    await flush(20);
    const card = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    (card.querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(40);
    expect(card.querySelector('[data-alert="collapsed"]')?.textContent).toContain('قُرئ 103 من 104');
    manager.stop();
  });
});

describe('مسار دليل commit status (VR-19)', () => {
  it('فحص commit status إلزامي فاشل يُنسب إلى طلب /status لا check-runs', async () => {
    loadHtml('fixture-pr-complex.html');
    const summary = readPrSummary(document, selectors(), { pageNumber: 4242 });
    const api = await apiData({
      ...ROUTES_COMPLEX,
      [`/repos/octo/demo/commits/${HEAD}/check-runs`]: { total_count: 0, check_runs: [] },
      [`/repos/octo/demo/commits/${HEAD}/status`]: { total_count: 1, statuses: [{ context: 'legacy/ci', state: 'failure', description: 'broken' }] },
      '/repos/octo/demo/branches/main': { name: 'main', protected: true, protection: { required_status_checks: { contexts: ['legacy/ci'] } } },
    });
    const r = explainBlockers(mergeApi(summary, api), readDomEvidence(document, selectors()), api);
    const evidence = r.blockers.flatMap((b) => b.evidence).find((e) => e.text.startsWith('legacy/ci'));
    expect(evidence?.where).toBe(`/repos/octo/demo/commits/${HEAD}/status`);
    const run = r.blockers.flatMap((b) => b.evidence).find((e) => e.source === 'api' && e.text.startsWith('ci / lint'));
    if (run) expect(run.where).toBe(`/repos/octo/demo/commits/${HEAD}/check-runs`);
  });
});
