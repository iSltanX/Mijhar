// مدخل حزمة اختبار (لا تُشحن) لتجربة المحركات الحقيقية (T-4.3، TEST-TR-04) في المتصفحات: المحرك الذي يختاره selectLocalEngine في سياق الصفحة
// كما يختاره سكربت المحتوى، بلا محرك وهمي:
//  - المجموعة المرجعية (fixtures/translation/reference.json) عبر التقنيع والفاحص الرباعي وقاعدة الفشل الآمن، ومعها خط أساس بصيغة الخطة وحدها
//    (المترجم نفسه بلا الصيغة على السلك) للمقارنة بقياس T-0.2؛ تبدأ من نقرة حقيقية لأن create() تحتاجها ما دامت الحزمة 'downloadable'.
//  - حالات AC-C1 الأربع عبر واجهة الترجمة كما تُشحن، أو الحالة الصريحة وبديل النسخ حيث لا محرك. النقر والتحديد الفعليان يرسلهما run.mjs.
import { selectLocalEngine, TranslatorApiEngine, translatorFactoryOf } from '../../../../../src/modules/c/engines';
import { maskText, translateProtected } from '../../../../../src/modules/c/masking';
import type { ProtectedTranslation } from '../../../../../src/modules/c/masking';
import { createTranslateModule } from '../../../../../src/modules/c/ui';
import type { TranslationService } from '../../../../../src/modules/c/ui';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

interface Reference {
  sentences: string[];
  paragraphs: string[];
  technical: Array<{ case: string; text: string }>;
}

let mounted: MountedModule | null = null;
let engine: TranslationService | null = null;
const copied: string[] = [];
let corpus: { done: boolean; result: unknown } = { done: false, result: null };

const settle = (ms = 100): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hostsOf = (name: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${name}"]`)];
const ARABIC = /[؀-ۿ]/;
const center = (el: Element): { x: number; y: number } => {
  (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
};

async function detect(): Promise<unknown> {
  const scoped = selectLocalEngine();
  return {
    translatorType: typeof (globalThis as { Translator?: unknown }).Translator,
    engine: scoped.id,
    label: scoped.label,
    availability: await scoped.availability(),
    status: scoped instanceof TranslatorApiEngine ? await scoped.status().catch((e: unknown) => `error: ${String(e)}`) : null,
    trialMl: typeof (globalThis as { browser?: { trial?: unknown } }).browser?.trial,
    userAgent: navigator.userAgent,
  };
}

// ——— المجموعة المرجعية ———

interface ItemOutcome {
  id: string;
  kind: string;
  tokens: number;
  status: ProtectedTranslation['status'] | 'error';
  retryAttempts?: number;
  engineCalls?: number;
  firstChecks?: string[];
  lastChecks?: string[];
  ms: number;
  output?: string;
  error?: string;
}

const checksOf = (failures: readonly { check: string }[]): string[] => [...new Set(failures.map((f) => f.check))];

async function runItems(items: Array<{ id: string; kind: string; text: string }>, translate: (masked: string, context: { signal?: AbortSignal }) => Promise<string>): Promise<ItemOutcome[]> {
  const out: ItemOutcome[] = [];
  for (const item of items) {
    const tokens = maskText(item.text).expectedTokens.size;
    const t0 = performance.now();
    try {
      const r = await translateProtected(item.text, translate, { locale: 'en' });
      const base = { id: item.id, kind: item.kind, tokens, status: r.status, retryAttempts: r.retryAttempts, engineCalls: r.engineCalls, ms: Math.round(performance.now() - t0) };
      out.push(r.status === 'translated' ? { ...base, output: r.text } : { ...base, firstChecks: checksOf(r.firstAttemptFailures), lastChecks: checksOf(r.failures) });
    } catch (error) {
      out.push({ id: item.id, kind: item.kind, tokens, status: 'error', ms: Math.round(performance.now() - t0), error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }
  return out;
}

function rates(outcomes: ItemOutcome[]): unknown {
  const withTokens = outcomes.filter((o) => o.tokens > 0);
  const count = (list: ItemOutcome[], pred: (o: ItemOutcome) => boolean): number => list.filter(pred).length;
  const firstPass = (o: ItemOutcome): boolean => o.status === 'translated' && o.retryAttempts === 0;
  const summary = (list: ItemOutcome[]) => ({
    n: list.length,
    firstAttemptPassed: count(list, firstPass),
    passedAfterSentenceRetry: count(list, (o) => o.status === 'translated' && o.retryAttempts === 1),
    originalKept: count(list, (o) => o.status === 'original-kept'),
    errors: count(list, (o) => o.status === 'error'),
    validatorFailureRateFirstAttempt: list.length ? +(1 - count(list, firstPass) / list.length).toFixed(3) : null,
    keptRate: list.length ? +(count(list, (o) => o.status === 'original-kept') / list.length).toFixed(3) : null,
  });
  return { all: summary(outcomes), withTokens: summary(withTokens) };
}

function armCorpus(ref: Reference): { x: number; y: number } {
  corpus = { done: false, result: null };
  document.getElementById('mj-go')?.remove();
  const button = document.createElement('button');
  button.id = 'mj-go';
  button.textContent = 'run corpus';
  button.setAttribute('style', 'position:fixed;top:8px;left:8px;z-index:2147483647;padding:12px 16px');
  document.body.append(button);
  const items = [
    ...ref.sentences.map((text, i) => ({ id: `s${i + 1}`, kind: 'sentence', text })),
    ...ref.paragraphs.map((text, i) => ({ id: `p${i + 1}`, kind: 'paragraph', text })),
    ...ref.technical.map((t, i) => ({ id: `t${i + 1}`, kind: t.case, text: t.text })),
  ];
  button.onclick = () => {
    void (async () => {
      const scoped = selectLocalEngine();
      const t0 = performance.now();
      const withWire = await runItems(items, (masked, context) => scoped.translate(masked, context));
      const wireMs = Math.round(performance.now() - t0);
      let baseline: ItemOutcome[] | null = null;
      const factory = translatorFactoryOf();
      if (factory && withWire.some((o) => o.status !== 'error')) {
        // خط الأساس: المترجم نفسه بصيغة الخطة ⟦TYPE_N⟧ كما هي (بلا wire.ts)، للمقارنة.
        const raw = await factory.create({ sourceLanguage: 'en', targetLanguage: 'ar' });
        baseline = await runItems(items, (masked) => raw.translate(masked));
      }
      corpus = {
        done: true,
        result: {
          engine: scoped.id,
          items: items.length,
          withWireFormat: { ms: wireMs, rates: rates(withWire), outcomes: withWire },
          planFormatBaseline: baseline && { rates: rates(baseline), outcomes: baseline.map(({ output: _o, ...rest }) => rest) },
        },
      };
    })().catch((error: unknown) => {
      corpus = { done: true, result: { error: String(error) } };
    });
  };
  return center(button);
}

const corpusResult = (): unknown => (corpus.done ? corpus.result : null);

// ——— واجهة الترجمة كما تُشحن ———

async function mount(arg: { href: string }): Promise<{ bars: number; engine: string }> {
  engine = selectLocalEngine();
  copied.length = 0;
  mounted = mountInPage(createTranslateModule({ service: engine, debounceMs: 20, selection: { debounceMs: 20 }, copy: async (text) => void copied.push(text) }), arg.href);
  // الأشرطة تظهر بعد أن تجيب availability()، وأول جواب في ملف تعريف جديد قد يتأخر.
  for (let waited = 0; hostsOf('c.ui.bar').length === 0 && waited < 15000; waited += 100) await settle(100);
  await settle(200);
  return { bars: hostsOf('c.ui.bar').length, engine: engine.id };
}

const bodyOf = (selector: string): Element => document.querySelector(selector) as Element;
const barOf = (selector: string): HTMLElement => bodyOf(selector).previousElementSibling as HTMLElement;

function barState(selector: string): unknown {
  const root = barOf(selector)?.shadowRoot;
  if (!root) return null;
  return {
    phase: root.querySelector('.bar')?.getAttribute('data-phase'),
    note: root.querySelector('[data-note]')?.textContent?.replace(/\s+/g, ' ').trim(),
    actions: [...root.querySelectorAll('button')].map((el) => el.getAttribute('data-action') ?? el.getAttribute('data-mode')),
  };
}

function barButton(arg: { body: string; action: string }): { x: number; y: number } | null {
  const el = barOf(arg.body)?.shadowRoot?.querySelector(`[data-action="${arg.action}"]`);
  return el ? center(el) : null;
}

/** ترجمات نص بعينه: عددها، والمحفوظ أصله، وهل فيها عربية، والعناصر المحمية مقابل الأصل. */
function translated(selector: string): unknown {
  const body = bodyOf(selector);
  const hosts = [...body.querySelectorAll<HTMLElement>('mijhar-host[data-mijhar-host="c.ui.translation"]')];
  const translations = hosts.filter((h) => h.getAttribute('data-kind') === 'translation');
  const texts = translations.map((h) => h.shadowRoot?.querySelector('.tr-body')?.textContent ?? '');
  // نص الأصل بلا ما أضافه مِجهَر (الظل لا يدخل textContent، وأغلفة الأصل تبقى من الأصل).
  const originalText = (body.textContent ?? '').replace(/\s+/g, ' ');
  const shownProtected = translations.flatMap((h) => [...(h.shadowRoot?.querySelectorAll('.prot') ?? [])].map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
  return {
    translations: translations.length,
    warnings: hosts.filter((h) => h.getAttribute('data-kind') === 'warning').length,
    arabic: texts.filter((t) => ARABIC.test(t)).length,
    protectedShown: shownProtected.length,
    protectedAllFromOriginal: shownProtected.every((t) => originalText.includes(t)),
    tokenLeak: texts.some((t) => /[⟦⟧]|\{\d+\}|\[\[\d+\]\]/.test(t)),
    sample: texts.slice(0, 3),
  };
}

function dragFor(arg: { selector: string; chars: number }): { x1: number; y1: number; x2: number; y2: number } | null {
  const el = document.querySelector(arg.selector);
  if (!el) return null;
  (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  const first = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
  if (!first) return null;
  const a = document.createRange();
  a.setStart(first, 0);
  a.setEnd(first, 1);
  const startRect = a.getBoundingClientRect();
  const b = document.createRange();
  b.setStart(first, 0);
  b.setEnd(first, Math.min(arg.chars, first.length));
  const rects = b.getClientRects();
  const endRect = rects[rects.length - 1] as DOMRect;
  return { x1: Math.round(startRect.left + 1), y1: Math.round(startRect.top + startRect.height / 2), x2: Math.round(endRect.right), y2: Math.round(endRect.top + endRect.height / 2) };
}

function selectionUi(): unknown {
  const root = hostsOf('c.ui.selection')[0]?.shadowRoot;
  const card = root?.querySelector<HTMLElement>('.sel-card');
  const button = root?.querySelector('[data-action="translate-selection"]');
  const copy = root?.querySelector('[data-action="copy-masked"]');
  const translation = card?.querySelector('[data-section="translation"]')?.textContent ?? null;
  return {
    selected: document.getSelection()?.toString() ?? '',
    button: button ? center(button) : null,
    copyButton: copy ? center(copy) : null,
    card: card && {
      status: card.getAttribute('data-status'),
      original: card.querySelector('[data-section="original"]')?.textContent,
      translation,
      arabic: translation ? ARABIC.test(translation) : false,
      notice: card.querySelector('[data-section="notice"]')?.textContent ?? null,
      copyNote: card.querySelector('[data-section="copy-note"]')?.textContent ?? null,
    },
  };
}

const resources = (): string[] => performance.getEntriesByType('resource').map((e) => e.name);
const copiedTexts = (): string[] => [...copied];

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  return { hosts: document.querySelectorAll('mijhar-host').length, skipped: report?.skipped.length ?? 0 };
}

const api: Record<string, (arg?: never) => unknown> = { detect, armCorpus, corpusResult, mount, barState, barButton, translated, dragFor, selectionUi, resources, copiedTexts, stop } as never;

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

Object.assign(window, { MijharE2E: { call } });
