// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// MJ25 (T-11.12، AC-E12 (٤)، TEST-PRIV-05): صيغة مفتاح Google Gemini نمطٌ في قائمة الحجب (T-6.3) كصيغة Anthropic (AD-30 H-5):
//  - الفاحص المحلي يرصده بموضعه ولا يرصد ما دون الطول، والمنقّح المشترك يحجبه من البرومبت؛
//  - «نسخ البرومبت» (MJ20) يحجبه ويعدّه في التنبيه المختصر ولا يظهر في المنسوخ ولا في واجهة الزر؛
//  - التحليل من بطاقة الطلب: الموافقة تعلن الحجب وما يُرسل إلى المزوّد بلا المفتاح، وبالمزوّد Google Gemini المختار.
// المفتاح مختلَق يُركَّب وقت التشغيل؛ لا مفتاح بصيغته الكاملة في المستودع.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SectionAnalysisDeps } from '../../../../src/modules/d/analysis';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import type { FetchDetails } from '../../../../src/modules/d/pr-status';
import type { ConnectionStatus } from '../../../../src/core/connections/health';
import type { ConnectionsPort } from '../../../../src/core/connections/port';
import { maskOf } from '../../../../src/modules/e/context';
import { createCopyPromptModule } from '../../../../src/modules/e/copy-prompt';
import type { CopyFn } from '../../../../src/modules/e/copy-prompt';
import { SECRET_PATTERNS, scanText } from '../../../../src/modules/e/privacy-check';
import type { AnalyzeInput, AnalyzeResponse, ProviderPort, ProviderStatus } from '../../../../src/modules/e/provider';
import { providerInfo } from '../../../../src/modules/e/provider';
import { GEMINI } from '../../../../src/modules/e/provider/descriptors/gemini';
import { trustedClick } from '../../../shared/trusted-click';
import { flush, hostsOf, loadHtml, mountModules, readFixture } from '../../d/helpers';
import { NOW, SAMPLES, mountOn, view } from '../copy-prompt/helpers';
import { fakeGeminiAqKey, fakeGeminiKey } from './fixture-provider-mock';

const FAKE_KEY = fakeGeminiKey('V');

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, '', '/octo/demo/pull/4242');
});

describe('الفاحص والمنقّح: النمط في القائمة المعرّفة', () => {
  it('gemini-key في القائمة، ويرصد المفتاح المختلَق وحده بموضعه، ولا يرصد ما دون الطول ولا ما التصق بحرف قبله', () => {
    expect(SECRET_PATTERNS.map((p) => p.id)).toContain('gemini-key');
    const text = `export GEMINI_API_KEY=${FAKE_KEY}\nAIzaShort\nxAIza${FAKE_KEY.slice(4)}`;
    const found = scanText(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ patternId: 'gemini-key', line: 1 });
    expect(text.slice(found[0]?.start, found[0]?.end)).toBe(FAKE_KEY);
    expect(maskOf('gemini-key')).toContain('محجوب');
  });

  it('الصيغة الجديدة AQ. (AI Studio) تُرصد وتُحجب كذلك، ولا يُرصد «AQ.» قصير', () => {
    const aq = fakeGeminiAqKey('V');
    const text = `GEMINI_API_KEY=${aq}\nAQ.short\nxAQ.${aq.slice(3)}`;
    const found = scanText(text);
    expect(found.map((f) => f.patternId)).toEqual(['gemini-key']);
    expect(text.slice(found[0]?.start, found[0]?.end)).toBe(aq);
  });
});

/** يضع المفتاح المختلَق في أول فقرة من وصف الطلب (عينة الطبقة المشتركة). */
function plantKey(): void {
  const p = [...document.querySelectorAll('.comment-body p, .markdown-body p, td.comment-body p')].find((el) => (el.textContent ?? '').trim().length > 0) as HTMLElement | undefined;
  if (!p) throw new Error('لا فقرة في وصف الطلب');
  p.textContent = `Set GEMINI_API_KEY=${FAKE_KEY} before running.`;
}

/** عينة البطاقة بلا وصف: المفتاح في عنوان الطلب، وهو مما يُرسل للتحليل. */
function plantKeyInTitle(): void {
  const title = document.querySelector('[data-component="TitleArea"] .markdown-title');
  if (!title) throw new Error('لا عنوان للطلب');
  title.textContent = `feat: refresh the settings UI (GEMINI_API_KEY=${FAKE_KEY})`;
}

function analysisDeps() {
  const status: ProviderStatus = {
    provider: providerInfo(GEMINI),
    selected: true,
    permission: true,
    hostPermission: true,
    contentPermission: null,
    key: { id: 'provider-key', place: 'session', savedAt: 1, health: 'healthy', checkedAt: 1, detail: {} } as ConnectionStatus,
    model: { id: 'mock-gem-2', displayName: 'Mock Gem 2' },
    choice: 'mock-gem-2',
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
      return { ok: true, status: 200, data: { text: '{"summary":"x","findings":[],"next_steps":[],"missing":[]}', model: input.model, stopReason: 'end_turn', usage: null, provider: 'Google Gemini', host: GEMINI.host, requestedAt: NOW, completedAt: NOW } };
    }),
    cancel: vi.fn(async () => undefined),
  } satisfies ProviderPort;
  const connections = {
    status: vi.fn(async () => [status.key as ConnectionStatus]),
    pending: vi.fn(async () => null),
    returnToFeature: vi.fn(async () => false),
    dismiss: vi.fn(async () => undefined),
  } satisfies ConnectionsPort;
  const deps: SectionAnalysisDeps = { provider, connections, openSettings: vi.fn(), messages: null, newId: () => 'req-gemini' };
  return { deps, provider, sent };
}

const fragment: FetchDetails = async () => readFixture('fixture-status-details.html');

async function analyzePr() {
  loadHtml('fixture-pr-complex.html');
  plantKeyInTitle();
  const a = analysisDeps();
  const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: null, connections: null, analysis: a.deps, now: () => NOW })]);
  await flush(30);
  const root = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
  trustedClick(root.querySelector('[data-analysis-section="pr"] [data-action="analysis-open"]') as HTMLButtonElement);
  await flush(20);
  const consent = root.querySelector('[data-consent]')?.textContent ?? '';
  trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
  await flush(20);
  manager.stop();
  return { ...a, errors, consent };
}

describe('TEST-PRIV-05: مفتاح مختلَق بصيغة مفتاح Google Gemini', () => {
  it('«نسخ البرومبت» يحجبه ويعدّه في التنبيه المختصر، ولا يظهر في المنسوخ ولا في واجهة الزر', async () => {
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
    expect(text).toContain('Set GEMINI_API_KEY=');
    expect(text).toContain('[محجوب:');
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(FAKE_KEY.slice(0, 10));
    expect([...(ui.q('[data-note="private"]')?.querySelectorAll('[data-private-item]') ?? [])].map((el) => el.textContent)).toEqual(['1× مفتاح Google Gemini API']);
    expect(ui.root().textContent).not.toContain(FAKE_KEY);
    manager.stop();
  });

  it('التحليل من بطاقة الطلب: الموافقة تعلن الحجب وتذكر Google Gemini ومضيفه، وما يُرسل إلى المزوّد بلا المفتاح', async () => {
    const r = await analyzePr();
    expect(r.errors).toEqual([]);
    expect(r.consent).toMatch(/حُجب 1 موضعًا/);
    expect(r.consent).toContain('Google Gemini');
    expect(r.consent).toContain(GEMINI.host);
    expect(r.consent).not.toContain(FAKE_KEY);
    expect(r.provider.analyze).toHaveBeenCalledTimes(1);
    const sent = r.sent[0] as AnalyzeInput;
    expect(sent.prompt).toContain('[محجوب:');
    expect(`${sent.system}\n${sent.prompt}`).not.toContain(FAKE_KEY);
    expect(sent.prompt).not.toContain(FAKE_KEY.slice(0, 10));
  });
});
