// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// بوابة الموجة L (Docs/MJ/waves.json) على الشجرة المجمّعة: أنماط حجب صيغ المفاتيح الثلاث معًا (Anthropic من MJ21، وOpenAI من MJ24، وGoogle Gemini
// بصيغتيه من MJ25) على «نسخ البرومبت» والتحليل حيث تلتقي المرحلتان ولم يقسها فرع وحده: كل مفتاح يُحجب بنمطه هو مرة واحدة، ولا يلتقط نمط مفتاح غيره.
// كتبته جلسة دمج الموجة L في مراجعتها (evidence/wave-L/review.md). المفاتيح مختلَقة تُركَّب وقت التشغيل.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../../../src/core/connections/health';
import type { ConnectionsPort } from '../../../src/core/connections/port';
import type { SectionAnalysisDeps } from '../../../src/modules/d/analysis';
import { createPrStatusModule } from '../../../src/modules/d/pr-status';
import type { FetchDetails } from '../../../src/modules/d/pr-status';
import { createCopyPromptModule } from '../../../src/modules/e/copy-prompt';
import type { CopyFn } from '../../../src/modules/e/copy-prompt';
import { SECRET_PATTERNS, scanText } from '../../../src/modules/e/privacy-check/scan';
import type { AnalyzeInput, AnalyzeResponse, ProviderPort, ProviderStatus } from '../../../src/modules/e/provider';
import { providerInfo } from '../../../src/modules/e/provider';
import { OPENAI } from '../../../src/modules/e/provider/descriptors/openai';
import { trustedClick } from '../../shared/trusted-click';
import { flush, hostsOf, loadHtml, mountModules, readFixture } from '../d/helpers';
import { NOW, SAMPLES, mountOn, view } from './copy-prompt/helpers';

const KEYS = {
  anthropic: ['sk', 'ant', 'api03', 'Wv5Ix8Qe2Lp7Rt4Mz1Kc9Hn6Bd3Fs0Yg-Ja_Ou2468013579'].join('-'),
  openai: ['sk', 'proj', 'WaveLCrossingFakeOpenAiKey0123456789abcdef'].join('-'),
  geminiAiza: ['AIza', 'SyWaveLCrossingFakeGeminiKey012345678'].join(''),
  geminiAq: ['AQ', 'WaveLCrossingFakeGeminiStudioKey0123456789abcdefABCD'].join('.'),
} as const;
const LINE = `env: ANTHROPIC_API_KEY=${KEYS.anthropic} OPENAI_API_KEY=${KEYS.openai} GEMINI_API_KEY=${KEYS.geminiAiza} GOOGLE_AI_STUDIO=${KEYS.geminiAq}`;

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, '', '/octo/demo/pull/4242');
});

describe('الأنماط الثلاثة معًا في القائمة المشتركة', () => {
  it('كل مفتاح يُرصد بنمطه هو مرة واحدة بموضعه الكامل، ولا يلتقط نمط OpenAI مفتاح Anthropic', () => {
    expect(SECRET_PATTERNS.map((p) => p.id).slice(-3)).toEqual(['anthropic-key', 'openai-key', 'gemini-key']);
    const found = scanText(LINE);
    expect(found.map((f) => [f.patternId, LINE.slice(f.start, f.end)])).toEqual([
      ['anthropic-key', KEYS.anthropic],
      ['openai-key', KEYS.openai],
      ['gemini-key', KEYS.geminiAiza],
      ['gemini-key', KEYS.geminiAq],
    ]);
  });
});

function plantKeys(): void {
  const p = [...document.querySelectorAll('.comment-body p, .markdown-body p, td.comment-body p')].find((el) => (el.textContent ?? '').trim().length > 0) as HTMLElement | undefined;
  if (!p) throw new Error('لا فقرة في وصف الطلب');
  p.textContent = LINE;
}

function plantKeysInTitle(): void {
  const title = document.querySelector('[data-component="TitleArea"] .markdown-title');
  if (!title) throw new Error('لا عنوان للطلب');
  title.textContent = `chore: rotate (${LINE})`;
}

describe('«نسخ البرومبت» والتحليل على الشجرة المجمّعة', () => {
  it('«نسخ البرومبت» يحجب المفاتيح الأربعة (الصيغ الثلاث) ويعدّها في التنبيه، ولا يظهر أيٌّ منها في المنسوخ ولا الواجهة', async () => {
    const copied: string[] = [];
    const copy: CopyFn = async (text) => {
      copied.push(text);
      return { ok: true, via: 'clipboard' };
    };
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy, settings: { template: () => 'auto', lineLimit: () => 400 }, now: () => NOW })], plantKeys);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    const text = copied[0] ?? '';
    for (const key of Object.values(KEYS)) {
      expect(text).not.toContain(key);
      expect(ui.root().textContent).not.toContain(key);
    }
    // الأربعة في مواضعها بنمط كلٍّ منها (والخامس في البرومبت شرح الصيغة «[محجوب: …]» في بند «أسرار محتملة»).
    expect(text).toContain('ANTHROPIC_API_KEY=[محجوب: anthropic-key] OPENAI_API_KEY=[محجوب: openai-key] GEMINI_API_KEY=[محجوب: gemini-key] GOOGLE_AI_STUDIO=[محجوب: gemini-key]');
    expect([...(ui.q('[data-note="private"]')?.querySelectorAll('[data-private-item]') ?? [])].map((el) => el.textContent).sort()).toEqual(
      ['1× مفتاح Anthropic API', '1× مفتاح OpenAI API', '2× مفتاح Google Gemini API'].sort(),
    );
    manager.stop();
  });

  it('التحليل إلى OpenAI: الموافقة تعلن حجب المواضع الأربعة، وما يُرسل بلا أي مفتاح', async () => {
    loadHtml('fixture-pr-complex.html');
    plantKeysInTitle();
    const status: ProviderStatus = {
      provider: providerInfo(OPENAI),
      selected: true,
      permission: true,
      hostPermission: true,
      contentPermission: null,
      key: { id: 'provider-key', place: 'session', savedAt: 1, health: 'healthy', checkedAt: 1, detail: {} } as ConnectionStatus,
      model: { id: 'gpt-typed-by-hand', displayName: 'gpt-typed-by-hand' },
      choice: 'gpt-typed-by-hand',
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
        return { ok: true, status: 200, data: { text: '{"summary":"x","findings":[],"next_steps":[],"missing":[]}', model: input.model, stopReason: 'completed', usage: null, provider: 'OpenAI', host: 'api.openai.com', requestedAt: NOW, completedAt: NOW } };
      }),
      cancel: vi.fn(async () => undefined),
    } satisfies ProviderPort;
    const connections = {
      status: vi.fn(async () => [status.key as ConnectionStatus]),
      pending: vi.fn(async () => null),
      returnToFeature: vi.fn(async () => false),
      dismiss: vi.fn(async () => undefined),
    } satisfies ConnectionsPort;
    const deps: SectionAnalysisDeps = { provider, connections, openSettings: vi.fn(), messages: null, newId: () => 'req-wave-l' };
    const fragment: FetchDetails = async () => readFixture('fixture-status-details.html');
    const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: null, connections: null, analysis: deps, now: () => NOW })]);
    await flush(30);
    const root = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    trustedClick(root.querySelector('[data-analysis-section="pr"] [data-action="analysis-open"]') as HTMLButtonElement);
    await flush(20);
    const consent = root.querySelector('[data-consent]')?.textContent ?? '';
    expect(consent).toMatch(/حُجب 4 موضعًا/);
    expect(consent).toContain('gpt-typed-by-hand');
    trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
    await flush(20);
    manager.stop();
    expect(errors).toEqual([]);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    const body = `${sent[0]?.system ?? ''}\n${sent[0]?.prompt ?? ''}`;
    for (const key of Object.values(KEYS)) expect(body).not.toContain(key);
    expect(sent[0]?.model).toBe('gpt-typed-by-hand');
  });
});
