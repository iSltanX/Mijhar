// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// بوابة الموجة I (Docs/MJ/waves.json) على الشجرة المجمّعة: قيدا AD-30 حيث تلتقي المرحلتان، ولم يقسهما فرع وحده.
//  - H-5: «نسخ البرومبت» (MJ20) يحجب مفتاحًا مختلَقًا بصيغة مفتاح المزوّد بالنمط الذي أضافته MJ21، والتحليل (MJ21) لا يرسله إلى المزوّد.
//  - H-1: قراءة API تقرؤها بطاقة الطلب لالتزام غير الظاهر لا تدخل ما يُرسل للتحليل، ويُعلن أنها لالتزام آخر و«غير معروف»؛ ولالتزام الرأس تدخل.
// كتبته جلسة دمج الموجة I في مراجعتها (evidence/wave-I/review.md). المفتاح والرمز مختلَقان يُركَّبان وقت التشغيل.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PagedResult, PublicApiPort, PublicApiResult, PublicApiStatus } from '../../../src/core';
import type { ConnectionStatus } from '../../../src/core/connections/health';
import type { ConnectionsPort } from '../../../src/core/connections/port';
import type { SectionAnalysisDeps } from '../../../src/modules/d/analysis';
import { createPrStatusModule } from '../../../src/modules/d/pr-status';
import type { FetchDetails } from '../../../src/modules/d/pr-status';
import { createCopyPromptModule } from '../../../src/modules/e/copy-prompt';
import type { CopyFn } from '../../../src/modules/e/copy-prompt';
import type { AnalyzeInput, AnalyzeResponse, ProviderPort, ProviderStatus } from '../../../src/modules/e/provider';
import { providerInfo } from '../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../src/modules/e/provider/descriptors/anthropic';
import { trustedClick } from '../../shared/trusted-click';
import { flush, hostsOf, loadHtml, mountModules, readFixture } from '../d/helpers';
import { NOW, SAMPLES, mountOn, view } from './copy-prompt/helpers';

const FAKE_KEY = ['sk', 'ant', 'api03', 'Wv5Ix8Qe2Lp7Rt4Mz1Kc9Hn6Bd3Fs0Yg-Ja_Ou2468013579'].join('-');
const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';
const OTHER = '0123456789abcdef0123456789abcdef01234567';
const API_ONLY_CHECK = 'wave-i / api-only-check (pull_request)';

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, '', '/octo/demo/pull/4242');
});

/** يضع المفتاح المختلَق في أول فقرة من وصف الطلب (عينة الطبقة المشتركة). */
function plantKey(): void {
  const p = [...document.querySelectorAll('.comment-body p, .markdown-body p, td.comment-body p')].find((el) => (el.textContent ?? '').trim().length > 0) as HTMLElement | undefined;
  if (!p) throw new Error('لا فقرة في وصف الطلب');
  p.textContent = `Set ANTHROPIC_API_KEY=${FAKE_KEY} before running.`;
}

/** عينة البطاقة بلا وصف: يضع المفتاح المختلَق في عنوان الطلب، وهو مما يُرسل للتحليل. */
function plantKeyInTitle(): void {
  const title = document.querySelector('[data-component="TitleArea"] .markdown-title');
  if (!title) throw new Error('لا عنوان للطلب');
  title.textContent = `feat: refresh the settings UI (ANTHROPIC_API_KEY=${FAKE_KEY})`;
}

function analysisDeps() {
  const status: ProviderStatus = {
    provider: providerInfo(ANTHROPIC),
    selected: true,
    permission: true,
    hostPermission: true,
    contentPermission: null,
    key: { id: 'provider-key', place: 'session', savedAt: 1, health: 'healthy', checkedAt: 1, detail: {} } as ConnectionStatus,
    model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' },
    choice: 'mock-sonnet-2',
    models: null,
    test: null,
    retryAt: null,
    providers: [],
  };
  const sent: AnalyzeInput[] = [];
  const provider = {
    status: vi.fn(async () => status),
    verify: vi.fn(),
    probe: vi.fn(),
    analyze: vi.fn(async (input: AnalyzeInput): Promise<AnalyzeResponse> => {
      sent.push(input);
      return { ok: true, status: 200, data: { text: '{"summary":"x","findings":[],"next_steps":[],"missing":[]}', model: input.model, stopReason: 'end_turn', usage: null, provider: 'Anthropic', host: 'api.anthropic.com', requestedAt: NOW, completedAt: NOW } };
    }),
    cancel: vi.fn(async () => undefined),
  } satisfies ProviderPort;
  const connections = {
    status: vi.fn(async () => [status.key as ConnectionStatus]),
    pending: vi.fn(async () => null),
    returnToFeature: vi.fn(async () => false),
    dismiss: vi.fn(async () => undefined),
  } satisfies ConnectionsPort;
  const deps: SectionAnalysisDeps = { provider, connections, openSettings: vi.fn(), messages: null, newId: () => 'req-wave-i' };
  return { deps, provider, sent };
}

/** API وهمية بلا شبكة لبطاقة الطلب: رأس الطلب كما تعيده القراءة (headSha) وفحص لا تعرضه الصفحة. */
function fakeApi(headSha: string): PublicApiPort & { calls: string[] } {
  const routes: Record<string, unknown> = {
    '/repos/octo/demo/pulls/4242': { number: 4242, state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: 'clean', head: { sha: headSha, ref: 'feature/ui-refresh' }, base: { ref: 'main' } },
    [`/repos/octo/demo/commits/${headSha}/check-runs`]: { total_count: 1, check_runs: [{ id: 9901, name: API_ONLY_CHECK, status: 'completed', conclusion: 'failure', output: { title: 'x' } }] },
    [`/repos/octo/demo/commits/${headSha}/status`]: { state: 'success', total_count: 0, statuses: [] },
    '/repos/octo/demo/branches/main': { name: 'main', protected: false },
  };
  const calls: string[] = [];
  const ok = <T,>(data: T): PublicApiResult<T> => ({ ok: true, status: 200, data, fromCache: false, readAt: NOW, rate: null });
  const miss = { ok: false as const, failure: 'not-found' as const, status: 404, message: 'Not Found', retryAt: null, readAt: NOW, rate: null };
  return {
    calls,
    status: vi.fn(async (): Promise<PublicApiStatus> => ({ granted: true, rate: null })),
    get: vi.fn(async (path: string) => {
      calls.push(path);
      return path in routes ? ok(routes[path]) : miss;
    }) as unknown as PublicApiPort['get'],
    getAll: vi.fn(async (path: string, key: 'check_runs' | 'statuses' | null): Promise<PublicApiResult<PagedResult<unknown>>> => {
      calls.push(path);
      const body = routes[path] as Record<string, unknown> | undefined;
      if (!body) return miss;
      const items = (key ? body[key] : body) as unknown[];
      return ok({ items, total: items.length, partial: false, pages: 1 });
    }) as unknown as PublicApiPort['getAll'],
  };
}

const fragment: FetchDetails = async () => readFixture('fixture-status-details.html');

/** يركّب بطاقة الطلب بالتحليل (وبـAPI إن مُرّرت)، ويقرأ API بنقرة إن طُلب، ثم يمر بالموافقة الموثوقة ويعيد ما أُرسل. */
async function analyzePr(options: { api?: PublicApiPort; key?: boolean } = {}) {
  loadHtml('fixture-pr-complex.html');
  if (options.key) plantKeyInTitle();
  const a = analysisDeps();
  const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: options.api ?? null, connections: null, analysis: a.deps, now: () => NOW })]);
  await flush(30);
  const root = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
  if (options.api) {
    (root.querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(30);
  }
  trustedClick(root.querySelector('[data-analysis-section="pr"] [data-action="analysis-open"]') as HTMLButtonElement);
  await flush(20);
  const consent = root.querySelector('[data-consent]')?.textContent ?? '';
  trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
  await flush(20);
  manager.stop();
  return { ...a, errors, consent };
}

describe('H-5 على الشجرة المجمّعة: مفتاح مختلَق بصيغة مفتاح المزوّد', () => {
  it('«نسخ البرومبت» (MJ20) يحجبه بنمط MJ21 ويعدّه في التنبيه المختصر، ولا يظهر في المنسوخ ولا في واجهة الزر', async () => {
    const copied: string[] = [];
    const copy: CopyFn = async (text) => {
      copied.push(text);
      return { ok: true, via: 'clipboard' };
    };
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy, settings: { template: () => 'auto', lineLimit: () => 400 }, now: () => NOW })], plantKey);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    const text = copied[0] ?? '';
    expect(text).toContain('Set ANTHROPIC_API_KEY=');
    expect(text).toContain('[محجوب:');
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{16,}/);
    expect([...(ui.q('[data-note="private"]')?.querySelectorAll('[data-private-item]') ?? [])].map((el) => el.textContent)).toEqual(['1× مفتاح Anthropic API']);
    expect(ui.root().textContent).not.toContain(FAKE_KEY);
    manager.stop();
  });

  it('التحليل (MJ21) من بطاقة الطلب: الموافقة تعلن الحجب، وما يُرسل إلى المزوّد بلا المفتاح', async () => {
    const r = await analyzePr({ key: true });
    expect(r.errors).toEqual([]);
    expect(r.consent).toMatch(/حُجب 1 موضعًا/);
    expect(r.consent).not.toContain(FAKE_KEY);
    expect(r.provider.analyze).toHaveBeenCalledTimes(1);
    const sent = r.sent[0] as AnalyzeInput;
    expect(sent.prompt).toContain('[محجوب:');
    expect(`${sent.system}\n${sent.prompt}`).not.toContain(FAKE_KEY);
    expect(sent.prompt).not.toMatch(/sk-ant-[A-Za-z0-9_-]{16,}/);
  });
});

describe('H-1 على الشجرة المجمّعة: قراءة API في سياق التحليل من بطاقة الطلب', () => {
  it('ضابط: قراءة لالتزام الرأس الظاهر تدخل ما يُرسل (الفحص الذي لا تعرضه الصفحة)، ولا يُعلن التزام آخر', async () => {
    const api = fakeApi(HEAD);
    const r = await analyzePr({ api });
    expect(api.calls[0]).toBe('/repos/octo/demo/pulls/4242');
    const sent = r.sent[0] as AnalyzeInput;
    expect(sent.prompt).toContain(API_ONLY_CHECK);
    expect(sent.prompt).not.toContain('لالتزام آخر');
  });

  it('قراءة لالتزام غير الظاهر لا تدخل ما يُرسل، ويُعلن أنها لالتزام آخر وقيمها «غير معروف»', async () => {
    const api = fakeApi(OTHER);
    const r = await analyzePr({ api });
    expect(api.calls[0]).toBe('/repos/octo/demo/pulls/4242');
    const sent = r.sent[0] as AnalyzeInput;
    expect(sent.prompt).not.toContain(API_ONLY_CHECK);
    expect(sent.prompt).toMatch(/- \*\*بيانات API\*\* \(غير متاح\): قراءة API لالتزام آخر \(0123456[^)]*\) غير الظاهر الآن \(22c15d5[^)]*\)؛ تغيّر الالتزام، فلم تدخل الفحوص ولا الموانع وقيمها غير معروف/);
  });
});
