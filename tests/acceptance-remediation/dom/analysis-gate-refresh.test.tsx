// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/salktbi902/etos/issues/1"}
// MJ-F-02 (Fable، ANA-12/13/15) وPR-04: بوابة التحليل في صفحة GitHub مفتوحة لا تتجدد بعد تغيّر حالة المفتاح من صفحة الإعدادات.
//
// السبب كما في المصدر (b63f9c4): SectionAnalysis.readHealth (src/modules/d/analysis/controller.tsx) لا تُستدعى إلا عند start() وعند رسالة
// mijhar/connections-changed؛ والخلفية لا ترسل هذه الرسالة إلا من ConnectionsService.returnToFeature (src/core/connections/service.ts) أي حين يفتح المستخدم
// الإعدادات من بوابة الميزة نفسها (setPending) ثم يعود. أما مسح المفتاح أو تبديل المزوّد أو رفضه (401) من الإعدادات، أو منح صلاحية api.github.com
// من زر «افتح الإعدادات» (بلا feature فلا pending)، فلا يبلغ التبويب المفتوح. وConsentSheet تحسب ready = نموذج مختار ∧ صلاحية المضيف ∧ بلا موعد انتظار،
// ولا تنظر إلى وجود مفتاح صالح.
//
// ما تفترضه الاختبارات هنا: «عودة المستخدم إلى التبويب» (visibilitychange إلى visible ثم focus) تعقبها دقيقة على الأكثر فتظهر الحالة الجديدة؛ فتقبل
// الإصلاح بإعادة القراءة عند العودة أو بمؤقت دوري. ولا تفترض اسم واجهة ولا رسالة جديدة. إن اختير بث من الخلفية فيُضاف اختبار خلفية (providerSystem) له.
//   [فشل على b63f9c4] اختبارات «بعد العودة إلى التبويب» و«زر الإرسال» و«PR-04».
//   [حارس] اختبارات رسالة connections-changed الموجودة (القناة الوحيدة اليوم) وأن المفتاح الصالح/غير المتحقق منه لا يُعطَّل.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../../../src/core/connections/health';
import { CONNECTIONS_CHANGED_MESSAGE } from '../../../src/core/connections/port';
import type { PublicApiPort, PublicApiStatus } from '../../../src/core';
import { createAnalysisModule } from '../../../src/modules/d/analysis';
import { createPrStatusModule } from '../../../src/modules/d/pr-status';
import { providerInfo } from '../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../src/modules/e/provider/descriptors/anthropic';
import { OPENAI } from '../../../src/modules/e/provider/descriptors/openai';
import { ROOT, loadHtml } from '../../modules/d/helpers';
import { trustedClick } from '../../shared/trusted-click';
import { mountRig, useRigTimers } from './rig';
import type { Rig } from './rig';
import { analysisDeps } from './surfaces';

useRigTimers();

const ISSUE = `${ROOT}/fixtures/spikes/gh-issue-etos-1.html`;
const PR = `${ROOT}/tests/modules/d/fixtures/fixture-pr-complex.html`;

afterEach(() => {
  // يعيد خاصية الرؤية إلى getter الأصلي بعد اختبارات العودة إلى التبويب
  delete (document as unknown as Record<string, unknown>).visibilityState;
  delete (document as unknown as Record<string, unknown>).hidden;
  vi.restoreAllMocks();
});

/** المستخدم يعود إلى تبويب GitHub بعد أن غيّر شيئًا في صفحة الإعدادات، ثم تمضي دقيقة على الأكثر. */
async function returnToTab(rig: Rig): Promise<void> {
  const set = (state: 'hidden' | 'visible'): void => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  };
  set('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  set('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  await rig.settle(60_000);
}

async function mountIssue(options: Parameters<typeof analysisDeps>[0] = {}) {
  const f = analysisDeps(options);
  const rig = await mountRig({ load: () => loadHtml(ISSUE), path: '/salktbi902/etos/issues/1', modules: [createAnalysisModule(f.deps)] });
  await rig.settle(50);
  const root = (): ShadowRoot => rig.hosts('d.analysis')[0]?.shadowRoot as ShadowRoot;
  const state = (): string | null => root()?.querySelector('[data-analysis-section]')?.getAttribute('data-analysis') ?? null;
  return { f, rig, root, state };
}

const keyOf = (health: ConnectionStatus['health']): ConnectionStatus => ({ id: 'provider-key', place: 'session', savedAt: 1, health, checkedAt: 1, detail: {} });

describe('البطاقة المفتوحة تعرض الخيار ما دام المفتاح سليمًا (أساس المقارنة)', () => {
  it('[حارس] مفتاح سليم: الخيار ظاهر ولا بوابة', async () => {
    const { state, root, rig } = await mountIssue();
    expect(rig.errors).toEqual([]);
    expect(state()).toBe('idle');
    expect(root().querySelector('[data-action="analysis-open"]')).not.toBeNull();
  });
});

describe('رسالة connections-changed (القناة الوحيدة اليوم: عودة الخلفية بعد بوابة الميزة نفسها)', () => {
  it.each([['none' as const], ['expired' as const]])('[حارس] وصولها بعد أن صار المفتاح %s يُظهر البوابة', async (health) => {
    const { f, state, rig } = await mountIssue();
    f.backend.setHealth(health);
    f.deliver({ type: CONNECTIONS_CHANGED_MESSAGE, feature: 'd.analysis.checks' });
    await rig.settle(50);
    expect(state()).toBe('gate');
  });
});

describe('بعد العودة إلى التبويب: حالة المفتاح التي غيّرتها صفحة الإعدادات تظهر دون إعادة تحميل', () => {
  it('ANA-13: المفتاح مُسح من الإعدادات ← تظهر بوابة «يحتاج مفتاحًا» لا خيار «حلّل»', async () => {
    const { f, state, root, rig } = await mountIssue();
    f.backend.setHealth('none');
    f.backend.setStatus({ key: null });
    await returnToTab(rig);
    expect(state()).toBe('gate');
    expect(root().querySelector('[data-action="analysis-open"]')).toBeNull();
    expect(f.provider.analyze).not.toHaveBeenCalled();
  });

  it('ANA-12: المزوّد المختار بُدّل إلى مزوّد بلا مفتاح ← تظهر البوابة', async () => {
    const { f, state, root, rig } = await mountIssue();
    f.backend.setHealth('none');
    f.backend.setStatus({ provider: providerInfo(OPENAI), key: null, model: null, choice: undefined });
    await returnToTab(rig);
    expect(state()).toBe('gate');
    expect(root().querySelector('[data-action="analysis-open"]')).toBeNull();
  });

  it('ANA-15: رفض المزوّد المفتاح (401) عند التحقق من الإعدادات ← تظهر بوابة المنتهي', async () => {
    const { f, state, root, rig } = await mountIssue();
    f.backend.setHealth('expired');
    f.backend.setStatus({ key: keyOf('expired') });
    await returnToTab(rig);
    expect(state()).toBe('gate');
    expect(root().querySelector('[data-action="analysis-open"]')).toBeNull();
  });

  it('العكس: بوابة ظاهرة ثم يربط المستخدم مفتاحًا من الإعدادات يدويًا (لا من زر البوابة) ← يظهر الخيار', async () => {
    const { f, state, root, rig } = await mountIssue({ health: 'none', status: { key: null } });
    expect(state()).toBe('gate');
    f.backend.setHealth('healthy');
    f.backend.setStatus({ key: keyOf('healthy') });
    await returnToTab(rig);
    expect(state()).toBe('idle');
    expect(root().querySelector('[data-action="analysis-open"]')).not.toBeNull();
  });
});

describe('موافقة الإرسال لا تُفعَّل بلا مفتاح صالح (ConsentSheet.ready لا تنظر إلى المفتاح)', () => {
  /** يفتح الموافقة من بطاقة ما زالت تعرض الخيار (قراءتها القديمة سليمة) بينما الخلفية ترى حالة أخرى للمفتاح. */
  async function openConsent(key: ConnectionStatus | null) {
    const m = await mountIssue();
    m.f.backend.setStatus({ key });
    trustedClick(m.root().querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
    await m.rig.settle(50);
    const confirm = (): HTMLButtonElement | null => m.root().querySelector<HTMLButtonElement>('[data-action="consent-confirm"]');
    return { ...m, confirm };
  }

  it('لا مفتاح محفوظ (key = null): لا زر إرسال مفعَّل، ولا طلب', async () => {
    const { confirm, f } = await openConsent(null);
    const button = confirm();
    expect(button === null || button.disabled).toBe(true);
    expect(f.provider.analyze).not.toHaveBeenCalled();
  });

  it('مفتاح رفضه المزوّد (منتهٍ): لا زر إرسال مفعَّل، ولا طلب', async () => {
    const { confirm, f } = await openConsent(keyOf('expired'));
    const button = confirm();
    expect(button === null || button.disabled).toBe(true);
    expect(f.provider.analyze).not.toHaveBeenCalled();
  });

  it('[حارس] مفتاح سليم: زر الإرسال مفعَّل', async () => {
    const { confirm } = await openConsent(keyOf('healthy'));
    expect(confirm()?.disabled).toBe(false);
  });

  it('[حارس] مفتاح غير متحقق منه (صلاحية معلقة أو لم يُتحقق بعد) لا يُعطَّل: الإرسال مفعَّل والخلفية تحسم', async () => {
    const { confirm } = await openConsent(keyOf('unverified'));
    expect(confirm()?.disabled).toBe(false);
  });
});

describe('PR-04: صلاحية api.github.com ممنوحة بعد تركيب بطاقة طلب الدمج', () => {
  function apiPort(): PublicApiPort & { grant(): void } {
    let granted = false;
    const status = vi.fn(async (): Promise<PublicApiStatus> => ({ granted, rate: null }));
    return { status, get: vi.fn(), getAll: vi.fn(), grant: () => void (granted = true) } as unknown as PublicApiPort & { grant(): void };
  }
  async function mountPr(api: PublicApiPort) {
    const rig = await mountRig({
      load: () => loadHtml(PR),
      path: '/octo/demo/pull/4242',
      modules: [createPrStatusModule({ debounceMs: 5, api, connections: null, runtimeMessages: null, staleMs: () => 5 * 60_000, fetchDetails: async () => '<div class="merge-status-list"></div>', now: () => Date.now() })],
    });
    await rig.settle(50);
    return rig;
  }

  it('[حارس] قبل المنح: لوحة API تعرض «افتح الإعدادات» ولا زر قراءة', async () => {
    const rig = await mountPr(apiPort());
    const root = rig.hosts('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    expect(root.querySelector('[data-api-state="not-granted"]')).not.toBeNull();
    expect(root.querySelector('[data-action="api-read"]')).toBeNull();
  });

  it('بعد منح الصلاحية من الإعدادات والعودة إلى التبويب: يظهر زر «أكمل من GitHub API العامة» دون إعادة تحميل', async () => {
    const port = apiPort();
    const rig = await mountPr(port);
    port.grant();
    await returnToTab(rig);
    const root = rig.hosts('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    expect(root.querySelector('[data-api-state="not-granted"]')).toBeNull();
    expect(root.querySelector('[data-action="api-read"]')?.textContent).toContain('أكمل من GitHub API العامة');
    expect(port.get).not.toHaveBeenCalled();
  });
});
