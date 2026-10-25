// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911"}
// TEST-AI-03 (AC-D9) ومعه AC-E9 (٢) و(٥) و(٧) داخل الأقسام، بمحوّل مزوّد وهمي خلف منفذ الخلفية (fixture-provider-mock):
//  - شرح سجل الفحص على صفحة مهمة حقيقية محفوظة: بلا مفتاح بوابة معلَّلة في الطبقة الثالثة ولا نص تحليل ولا طلب؛ وبمفتاح: «حلّل…» ثم الموافقة ثم
//    طلب واحد بعد «إرسال للتحليل» وحدها، والنتيجة في الطبقة الثالثة موسومة «احتمال يحتاج تحققًا» بأدلتها وما نقص والمودل ووقت الطلب، ولا شيء منها
//    في طبقتي الحقيقة والسبب المثبت؛ وبإزالة المفتاح يعود القسم بلا نص تحليل؛ والتفعيل البرمجي لا يفتح الموافقة ولا يرسل.
//  - الرد المعادي يُعرض نصًّا ولا يُنفَّذ؛ والفشل يُعلن ولا يُعاد تلقائيًا.
//  - بطاقة طلب الدمج وصفحة المشكلة: الخيار بقالبه (مراجعة التغييرات، فهم المشكلة).
//  - MJ23 (TEST-AI-05، AC-E10 (٥) و(٨)): الموافقة تعكس الاختيار الفعلي: تغيّر المزوّد أو المودل أو المحتوى بعد عرضها يمنع الإرسال ويعيد عرضها؛ والطلب
//    يحمل المزوّد الذي عُرض؛ والسياق بحد الأسطر PP-03 الذي يتبعه «نسخ البرومبت» (I-3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../../../../src/core/connections/health';
import { CONNECTIONS_CHANGED_MESSAGE } from '../../../../src/core/connections/port';
import type { ConnectionsPort } from '../../../../src/core/connections/port';
import type { ExtEvent } from '../../../../src/core/ui-host/browser-api';
import { createAnalysisModule } from '../../../../src/modules/d/analysis';
import type { SectionAnalysisDeps } from '../../../../src/modules/d/analysis';
import { NO_ROOT_CAUSE_TEXT, POSSIBILITY_TAG, createLogModule } from '../../../../src/modules/d/log-parser';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import { scanText } from '../../../../src/modules/e/privacy-check';
import { providerInfo } from '../../../../src/modules/e/provider';
import type { AnalyzeInput, AnalyzeResponse, ProviderPort, ProviderStatus } from '../../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../../src/modules/e/provider/descriptors/anthropic';
import { trustedClick } from '../../../shared/trusted-click';
import { HOSTILE_REPLY, mockDescriptor, structuredReply } from '../../e/provider/fixture-provider-mock';
import { ROOT, flush, hostsOf, loadHtml, mountModules } from '../helpers';

const JOB_PAGE = `${ROOT}/fixtures/logs/gh-job-failed.html`;
const NOW = Date.UTC(2026, 9, 24, 11, 0);

const STATUS: ProviderStatus = {
  provider: providerInfo(ANTHROPIC),
  selected: true,
  permission: true,
  hostPermission: true,
  contentPermission: null,
  key: null,
  model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' },
  choice: 'mock-sonnet-2',
  models: null,
  test: null,
  retryAt: null,
  providers: [],
};

const ok = (input: AnalyzeInput, text: string): AnalyzeResponse => ({
  ok: true,
  status: 200,
  data: { text, model: input.model, stopReason: 'end_turn', usage: null, provider: 'Anthropic', host: 'api.anthropic.com', requestedAt: NOW, completedAt: NOW },
});

function fakeDeps(options: { health?: ConnectionStatus['health']; reply?: (input: AnalyzeInput) => AnalyzeResponse; lineLimit?: number } = {}) {
  let health = options.health ?? 'healthy';
  /** ما تعيده الخلفية الآن (يتغير بالمزوّد أو المودل المختار). */
  let current: ProviderStatus = STATUS;
  const listeners = new Set<(m: unknown) => unknown>();
  const connections = {
    status: vi.fn(async () => [{ id: 'provider-key', place: 'session', savedAt: 1, health, checkedAt: 1, detail: {} }] as ConnectionStatus[]),
    pending: vi.fn(async () => null),
    returnToFeature: vi.fn(async () => false),
    dismiss: vi.fn(async () => undefined),
  } satisfies ConnectionsPort;
  const provider = {
    status: vi.fn(async () => ({ ...current, key: { id: 'provider-key', place: 'session', savedAt: 1, health, checkedAt: 1, detail: {} } }) as ProviderStatus),
    verify: vi.fn(),
    probe: vi.fn(),
    analyze: vi.fn(async (input: AnalyzeInput) => (options.reply ?? ((i) => ok(i, structuredReply(i.prompt))))(input)),
    cancel: vi.fn(async () => undefined),
  } satisfies ProviderPort;
  const messages: ExtEvent<(m: unknown) => unknown> = { addListener: (l) => void listeners.add(l), removeListener: (l) => void listeners.delete(l) };
  const openSettings = vi.fn();
  let lineLimit = options.lineLimit ?? 400;
  const deps: SectionAnalysisDeps = { provider, connections, openSettings, messages, newId: () => 'req-1', lineLimit: () => lineLimit };
  return {
    deps,
    provider,
    openSettings,
    /** يغيّر ما تعيده الخلفية (تبديل المزوّد أو المودل في الإعدادات). */
    setStatus: (next: Partial<ProviderStatus>) => {
      current = { ...current, ...next };
    },
    setLineLimit: (next: number) => {
      lineLimit = next;
    },
    /** يحاكي حذف المفتاح أو ربطه ثم عودة الخلفية إلى التبويب. */
    setHealth: async (next: ConnectionStatus['health']) => {
      health = next;
      for (const l of listeners) l({ type: CONNECTIONS_CHANGED_MESSAGE, feature: 'd.analysis.checks' });
      await flush(20);
    },
  };
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, '', '/microsoft/vscode/actions/runs/39905618450/job/120256773911');
});

async function logCard(deps: SectionAnalysisDeps) {
  loadHtml(JOB_PAGE);
  const { manager, errors } = await mountModules([createLogModule({ debounceMs: 5, analysis: deps })]);
  await flush(30);
  const root = hostsOf('d.log')[0]?.shadowRoot as ShadowRoot;
  return { manager, errors, root, layer: (name: string) => root.querySelector(`[data-layer="${name}"]`) };
}

describe('AC-D9: التحليل في شرح سجل الفحص', () => {
  it('بلا مفتاح: الخيار معلَّلًا بما يحتاجه داخل الطبقة الثالثة، والقسم كامل، ولا نص تحليل ولا طلب', async () => {
    const f = fakeDeps({ health: 'none' });
    const { root, layer, errors, manager } = await logCard(f.deps);
    expect(errors).toEqual([]);
    const gate = layer('possibility')?.querySelector('[data-analysis="gate"]');
    expect(gate).not.toBeNull();
    expect(text(gate)).toContain('حلّل الفشل واقترح الإصلاح');
    expect(text(gate)).toContain('يحتاج «مفتاح مزوّد التحليل»');
    expect(root.querySelector('[data-action="analysis-open"], [data-analysis="result"], [data-consent]')).toBeNull();
    expect(text(layer('literal'))).toContain('Process completed with exit code 1.');
    expect(text(root.querySelector('[data-no-root-cause]'))).toBe(NO_ROOT_CAUSE_TEXT);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    expect(f.provider.status).not.toHaveBeenCalled();
    (gate?.querySelector('[data-action="connect"]') as HTMLButtonElement).click();
    expect(f.openSettings).toHaveBeenCalledWith('d.analysis.checks');
    manager.stop();
  });

  it('بمفتاح: التفعيل البرمجي لا يفتح الموافقة ولا يرسل؛ والموافقة تبيّن ما يُرسل؛ و«إرسال للتحليل» الموثوقة وحدها تُصدر طلبًا واحدًا؛ والنتيجة في الطبقة الثالثة وحدها', async () => {
    const f = fakeDeps();
    const { root, layer, manager } = await logCard(f.deps);
    const open = root.querySelector<HTMLButtonElement>('[data-action="analysis-open"]');
    expect(text(open)).toBe('حلّل الفشل واقترح الإصلاح');
    open?.click();
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush(10);
    expect(root.querySelector('[data-consent]')).toBeNull();
    trustedClick(open as HTMLButtonElement);
    await flush(20);
    const consent = layer('possibility')?.querySelector('[data-consent]');
    expect(consent).not.toBeNull();
    expect(text(consent?.querySelector('[data-consent-lead]'))).toContain('Anthropic');
    expect(text(consent?.querySelector('[data-consent-lead]'))).toContain('Mock Sonnet 2');
    expect(text(consent?.querySelector('[data-consent-row="content"]'))).toContain('تشخيص الخطأ');
    expect(f.provider.analyze).not.toHaveBeenCalled();
    const send = consent?.querySelector<HTMLButtonElement>('[data-action="consent-confirm"]') as HTMLButtonElement;
    send.click();
    send.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush(10);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    trustedClick(send);
    await flush(30);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    const sent = f.provider.analyze.mock.calls[0]?.[0] as AnalyzeInput;
    expect(sent).toMatchObject({ requestId: 'req-1', section: 'checks', provider: 'anthropic', model: 'mock-sonnet-2' });
    expect(sent.prompt.split('\n')[0]).toBe('# تشخيص الخطأ');
    expect(scanText(sent.prompt)).toEqual([]);

    const result = layer('possibility')?.querySelector('[data-analysis="result"]');
    expect(result).not.toBeNull();
    expect(text(result)).toContain(POSSIBILITY_TAG);
    expect(text(result?.querySelector('[data-analysis-part="findings"]'))).toContain('السبب المحتمل: خطأ أنواع في الملف المذكور.');
    const evidence = [...(result?.querySelectorAll('[data-evidence]') ?? [])].map((e) => e.getAttribute('data-evidence'));
    expect(evidence).toEqual(['found', 'not-found']);
    expect(text(result?.querySelector('[data-analysis-sourced]'))).toContain('مثبت من الصفحة');
    expect(text(result?.querySelector('[data-analysis-sourced]'))).toContain('لا في عناوين مِجهَر وتسمياته');
    expect(text(result?.querySelector('[data-evidence="found"]'))).toContain('ورد في محتوى الصفحة');
    expect(text(result?.querySelector('[data-evidence="not-found"]'))).toContain('لم يرد حرفيًا في محتوى الصفحة المرسل');
    expect(text(result?.querySelector('[data-analysis-part="missing"]'))).toContain('لم يُرسل السجل كاملًا.');
    expect(text(result?.querySelector('[data-analysis-part="missing"]'))).toContain('وما أعلنته الطبقة قبل الإرسال');
    const meta = text(result?.querySelector('[data-analysis-meta]'));
    for (const part of ['mock-sonnet-2', 'Anthropic', 'api.anthropic.com', 'طُلب']) expect(meta).toContain(part);
    expect(result?.querySelector('time')?.getAttribute('datetime')).toBe(new Date(NOW).toISOString());
    // لا شيء من الاقتراح في طبقتي الحقيقة والسبب المثبت، والسبب المثبت لم يُستبدل.
    expect(text(layer('literal'))).not.toContain('خطأ أنواع في الملف المذكور');
    expect(text(layer('root-cause'))).not.toContain('خطأ أنواع في الملف المذكور');
    expect(text(root.querySelector('[data-no-root-cause]'))).toBe(NO_ROOT_CAUSE_TEXT);
    manager.stop();
  });

  it('بإزالة المفتاح يبقى القسم كاملًا ولا يظهر أي نص تحليل، ويظهر الخيار معلَّلًا', async () => {
    const f = fakeDeps();
    const { root, layer, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(root.querySelector('[data-analysis="result"]')).not.toBeNull();
    await f.setHealth('none');
    expect(root.querySelector('[data-analysis="result"]')).toBeNull();
    expect(text(layer('possibility'))).not.toContain('خطأ أنواع في الملف المذكور');
    expect(layer('possibility')?.querySelector('[data-analysis="gate"]')).not.toBeNull();
    expect(text(layer('literal'))).toContain('Process completed with exit code 1.');
    manager.stop();
  });

  it('رد معادٍ يُعرض نصًّا كما هو ولا يُنفَّذ منه شيء ولا يُنشئ عنصرًا', async () => {
    const f = fakeDeps({ reply: (input) => ok(input, HOSTILE_REPLY) });
    const { root, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    const raw = root.querySelector('[data-analysis-part="raw"]');
    expect(raw?.textContent).toContain('<img src=x onerror=');
    expect(root.querySelector('[data-analysis] img, [data-analysis] script')).toBeNull();
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined();
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('الفشل يُعلن بسببه ويقترح بطاقة المفتاح، ولا يُعاد تلقائيًا؛ و«أعد المحاولة» يعود إلى الموافقة لا إلى الإرسال', async () => {
    const f = fakeDeps({ reply: () => ({ ok: false, failure: 'unauthorized', status: 401, message: 'invalid x-api-key', retryAt: null }) });
    const { root, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    const failed = root.querySelector('[data-analysis="failed"]');
    expect(text(failed)).toContain('رفض المزوّد المفتاح لأنه غير صالح أو منتهٍ (401)');
    expect(failed?.querySelector('[data-action="analysis-settings"]')).not.toBeNull();
    await flush(30);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    trustedClick(failed?.querySelector('[data-action="analysis-retry"]') as HTMLButtonElement);
    await flush(20);
    expect(root.querySelector('[data-consent]')).not.toBeNull();
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});

describe('بطاقة طلب الدمج وصفحة المشكلة', () => {
  it('بطاقة الطلب: «راجع تغييرات الطلب» في ذيلها، والموافقة بقالب «مراجعة التغييرات»', async () => {
    history.replaceState(null, '', '/octo/demo/pull/4242');
    loadHtml('fixture-pr-complex.html');
    const f = fakeDeps();
    const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, api: null, connections: null, analysis: f.deps })]);
    await flush(30);
    expect(errors).toEqual([]);
    const root = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    const open = root.querySelector<HTMLButtonElement>('[data-analysis-section="pr"] [data-action="analysis-open"]');
    expect(text(open)).toBe('راجع تغييرات الطلب');
    trustedClick(open as HTMLButtonElement);
    await flush(20);
    expect(text(root.querySelector('[data-consent-row="content"]'))).toContain('مراجعة التغييرات');
    expect(f.provider.analyze).not.toHaveBeenCalled();
    manager.stop();
  });

  it('صفحة المشكلة: بطاقة «فهم المشكلة» بعد الترويسة، والموافقة بقالب «فهم المشكلة»؛ وبلا مفتاح بوابة معلَّلة وحدها', async () => {
    history.replaceState(null, '', '/salktbi902/etos/issues/1');
    loadHtml(`${ROOT}/fixtures/spikes/gh-issue-etos-1.html`);
    const f = fakeDeps();
    const { manager, errors } = await mountModules([createAnalysisModule(f.deps)]);
    await flush(30);
    expect(errors).toEqual([]);
    const root = hostsOf('d.analysis')[0]?.shadowRoot as ShadowRoot;
    expect(text(root.querySelector('[data-card="issue-analysis"] h3'))).toBe('فهم المشكلة');
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    expect(text(root.querySelector('[data-consent-row="content"]'))).toContain('فهم المشكلة');
    manager.stop();

    const none = fakeDeps({ health: 'none' });
    const second = await mountModules([createAnalysisModule(none.deps)]);
    await flush(30);
    const gated = hostsOf('d.analysis')[0]?.shadowRoot as ShadowRoot;
    expect(gated.querySelector('[data-analysis="gate"]')).not.toBeNull();
    expect(gated.querySelector('[data-action="analysis-open"]')).toBeNull();
    second.manager.stop();
  });
});

describe('TEST-AI-05 (AC-E10 (٥)): الموافقة تعكس الاختيار الفعلي', () => {
  it('تغيّر المزوّد المختار بعد عرض الموافقة: لا يُرسل شيء، وتُعرض من جديد بالوجهة الجديدة وسببها؛ ثم الإرسال يحمل المزوّد الجديد', async () => {
    const f = fakeDeps();
    const { root, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    expect(text(root.querySelector('[data-consent-lead]'))).toContain('Anthropic');
    const b = mockDescriptor('mock-b', 'Mock B', false);
    f.setStatus({ provider: providerInfo(b), model: { id: 'b-model-2', displayName: 'B Model 2' } });
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    expect(text(root.querySelector('[data-consent-changed]'))).toContain('تغيّر المزوّد المختار أو المودل');
    expect(text(root.querySelector('[data-consent-lead]'))).toContain('Mock B');
    expect(text(root.querySelector('[data-consent-lead]'))).toContain('api.mock-b.test');
    expect(text(root.querySelector('[data-consent]'))).not.toContain('Anthropic');
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    expect(f.provider.analyze.mock.calls[0]?.[0]).toMatchObject({ provider: 'mock-b', model: 'b-model-2' });
    manager.stop();
  });

  it('تغيّر المودل وحده بعد العرض: لا يُرسل، وتُعاد الموافقة بالمودل الجديد', async () => {
    const f = fakeDeps();
    const { root, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    f.setStatus({ model: { id: 'mock-haiku-2', displayName: 'Mock Haiku 2' } });
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    expect(text(root.querySelector('[data-consent-lead]'))).toContain('Mock Haiku 2');
    manager.stop();
  });

  it('تغيّر المحتوى في الصفحة بعد العرض: لا يُرسل، وتُعرض الموافقة بالمحتوى الذي سيُرسل الآن', async () => {
    const f = fakeDeps();
    const { root, manager } = await logCard(f.deps);
    trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    const before = text(root.querySelector('[data-consent-row="size"]'));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) if (node.textContent?.includes('Process completed with exit code 1.')) node.textContent = node.textContent.replace('exit code 1.', 'exit code 1. (changed after consent)');
    await flush(10);
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(f.provider.analyze).not.toHaveBeenCalled();
    expect(text(root.querySelector('[data-consent-changed]'))).toContain('تغيّر المحتوى');
    expect(text(root.querySelector('[data-consent-row="size"]'))).not.toBe(before);
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(30);
    expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});

describe('AC-E10 (٨) وI-3: سياق التحليل بحد الأسطر PP-03', () => {
  it('الحد المختار يسري على ما يُرسل كما يسري على «نسخ البرومبت»: اقتطاع معلن في المعلومات الناقصة', async () => {
    const sentWith = async (lineLimit: number): Promise<string> => {
      history.replaceState(null, '', '/salktbi902/etos/issues/1');
      loadHtml(`${ROOT}/fixtures/spikes/gh-issue-etos-1.html`);
      const f = fakeDeps({ lineLimit });
      const { manager } = await mountModules([createAnalysisModule(f.deps)]);
      await flush(30);
      const root = hostsOf('d.analysis')[0]?.shadowRoot as ShadowRoot;
      trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
      await flush(20);
      trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
      await flush(30);
      manager.stop();
      return (f.provider.analyze.mock.calls[0]?.[0] as AnalyzeInput).prompt;
    };
    const full = await sentWith(5000);
    const cut = await sentWith(20);
    expect(cut.length).toBeLessThan(full.length);
    expect(cut).toMatch(/اقتُطع|اقتطاع|مقتطع/);
  });
});
