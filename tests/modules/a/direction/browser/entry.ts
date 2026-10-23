// مدخل حزمة اختبار (لا تُشحن) لقياس الوحدة (أ) الفعلية في المتصفحات: يحقن window.MijharA بدوال يستدعيها run.mjs.
// القياس على الشيفرة التي تُشحن (DirectionProcessor وcreateModuleA وModuleARuntime ومحرك النصوص)، لا على نموذج T-0.1 الأولي.
// العينات تُخدم من 127.0.0.1 فيعدّها PageDetector صفحة خارجية؛ فيُركَّب الموديول بسياق ModuleContext أدنى يطابق ترتيب إيقاف
// النواة (إلغاء signal ← التنظيف بترتيب معاكس ← استعادة السجل)، وتُبدَّل الإعدادات بقارئ إعدادات في الذاكرة.
// ميزة «إخفاء التشكيل» هنا ميزة اختبار تمر بالمحرك وحارسه كما ستفعل T-2.5، لتطابق ما فعّله خط الأساس في PB-01.
import { MutationRecorder, SelectorsRegistry } from '../../../../../src/core';
import type { ExtensionModule, JsonValue, ModuleContext } from '../../../../../src/core';
import { DIRECTION_FEATURE, DIRECTION_SELECTORS, DIR_ATTR, DirectionProcessor } from '../../../../../src/modules/a/direction';
import { READING_STYLES_ID, createModuleA, featureSettingKey } from '../../../../../src/modules/a/scope';
import type { FeatureStopReport, ModuleAFeature, SettingsReader } from '../../../../../src/modules/a/scope';

const DIACRITIC = /[ً-ٰٟ]/;
const DIACRITICS_TEST: ModuleAFeature = {
  id: 'diacritics-test',
  title: 'إخفاء التشكيل (ميزة اختبار للقياس)',
  defaults: { enabled: true, scope: 'all', repos: [] },
  mount(ctx) {
    ctx.text.register({ id: 'diacritics-test.strip', apply: (text) => text.replace(/[ً-ٰٟ]/g, '') });
    const nodes: Node[] = [];
    for (const container of ctx.document.querySelectorAll('.markdown-body')) {
      const walker = ctx.document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement?.closest('pre, code, textarea') && DIACRITIC.test(n.nodeValue ?? '')) nodes.push(n);
      }
    }
    ctx.text.apply('diacritics-test.strip', nodes);
  },
};

const LEFTOVERS = `[data-mijhar-dir], [data-mijhar-orig-dir], [data-mijhar-injected], #${READING_STYLES_ID}`;

// قارئ إعدادات في الذاكرة (يطابق SettingsStore في get وsubscribe).
const values = new Map<string, JsonValue>();
const listeners = new Set<(change: { readonly key: string }) => void>();
const settings: SettingsReader = {
  get(key) {
    if (!values.has(key)) throw new Error(`غير معرَّف: ${key}`);
    return values.get(key) as JsonValue;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
const setFeature = (id: string, enabled: boolean): void => {
  const key = featureSettingKey(id);
  values.set(key, { enabled, scope: 'all', repos: [] });
  for (const listener of [...listeners]) listener({ key });
};

let recorder: MutationRecorder | null = null;
let teardown: (() => void) | null = null;
let pristine = '';
let reports: FeatureStopReport[] = [];

function directionScan(): { ms: number; flipped: number; lists: number } {
  recorder = new MutationRecorder('a.direction');
  const processor = new DirectionProcessor({ document, selectors: new SelectorsRegistry(DIRECTION_SELECTORS), mutations: recorder });
  const t0 = performance.now();
  const stats = processor.scan(document);
  const t1 = performance.now();
  return { ms: t1 - t0, flipped: stats.flipped, lists: stats.lists };
}

function directionReset(): number {
  return recorder?.restore().restored ?? 0;
}

function moduleContext(module: ExtensionModule): { ctx: ModuleContext; teardown: () => void } {
  const mutations = new MutationRecorder(module.id);
  const controller = new AbortController();
  const disposers: Array<() => void> = [];
  const ctx: ModuleContext = {
    moduleId: module.id,
    document,
    page: { href: 'https://github.com/octo/demo', type: 'repo', owner: 'octo', repo: 'demo', number: null, confidence: 'high', contentRoot: document.body },
    selectors: new SelectorsRegistry(module.selectors ?? []),
    mutations,
    signal: controller.signal,
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      disposers.push(() => target.removeEventListener(type, listener, options));
    },
    observe(target, init, callback) {
      const observer = new MutationObserver(callback);
      observer.observe(target, init);
      disposers.push(() => observer.disconnect());
      return observer;
    },
    onTeardown(cleanup) {
      disposers.push(cleanup);
    },
  };
  return {
    ctx,
    teardown() {
      controller.abort();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      mutations.restore();
    },
  };
}

/** يركّب الوحدة (أ)؛ features: 'direction' أو 'all' (الاتجاه وإخفاء التشكيل). */
function mountModule(features: 'direction' | 'all'): { flipped: number; styles: boolean } {
  pristine = document.documentElement.outerHTML;
  values.clear();
  reports = [];
  const module = createModuleA({ settings: () => settings, features: features === 'all' ? [DIRECTION_FEATURE, DIACRITICS_TEST] : [DIRECTION_FEATURE], onReport: (r) => reports.push(r) });
  const mounted = moduleContext(module);
  module.mount(mounted.ctx);
  teardown = mounted.teardown;
  return { flipped: document.querySelectorAll(`[${DIR_ATTR}]`).length, styles: document.getElementById(READING_STYLES_ID) !== null };
}

interface DisableResult {
  ms: number;
  leftovers: number;
  identical: boolean;
  restoredText: number;
  skipped: number;
}

const result = (ms: number): DisableResult => ({
  ms,
  leftovers: document.querySelectorAll(LEFTOVERS).length,
  identical: document.documentElement.outerHTML === pristine,
  restoredText: reports.reduce((n, r) => n + (r.text?.restored ?? 0), 0),
  skipped: reports.reduce((n, r) => n + r.restore.skipped.length + (r.text?.skipped.length ?? 0), 0),
});

/** PB-01 للوحدة: من استدعاء إيقافها حتى اكتمال إزالة الأثر وإعادة العقد. */
function timeDisable(): DisableResult {
  reports = [];
  const t0 = performance.now();
  teardown?.();
  const t1 = performance.now();
  teardown = null;
  return result(t1 - t0);
}

/** PB-01 للإعداد (AC-A7 بند ٢): إيقاف إعداد كل الميزات واحدًا بعد آخر وهي مركَّبة، دون إيقاف الوحدة. */
function timeSettingsOff(ids: readonly string[]): DisableResult {
  reports = [];
  const t0 = performance.now();
  for (const id of ids) setFeature(id, false);
  const t1 = performance.now();
  const out = result(t1 - t0);
  teardown?.();
  teardown = null;
  return out;
}

const computed = (el: Element): { direction: string; textAlign: string; paddingLeft: string; paddingRight: string } => {
  const style = getComputedStyle(el);
  return { direction: style.direction, textAlign: style.textAlign, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight };
};

/** TEST-RTL-01 في المتصفح: الاتجاه المحسوب لكل كتلة في العينة قبل التركيب وبعده وبعد الإيقاف. */
function oracle(): unknown {
  const cases = [...document.querySelectorAll('[data-expect]')];
  const before = cases.map(computed);
  mountModule('direction');
  const after = cases.map(computed);
  const rows = cases.map((el, i) => ({ name: el.getAttribute('data-case'), expect: el.getAttribute('data-expect'), before: before[i], after: after[i], attr: el.getAttribute(DIR_ATTR) }));
  const off = timeDisable();
  const restored = cases.map(computed);
  return { rows, off, restoredSame: restored.every((c, i) => JSON.stringify(c) === JSON.stringify(before[i])) };
}

/** على عينة حقيقية: كل كتلة قُلبت محسوبها rtl فعلًا بأنماط GitHub، والإيقاف لا يترك أثرًا. */
function effective(): { flipped: number; computedRtl: number; notRtl: string[]; off: DisableResult } {
  const stats = mountModule('direction');
  const flipped = [...document.querySelectorAll(`[${DIR_ATTR}]`)];
  const rtl = flipped.filter((el) => getComputedStyle(el).direction === 'rtl');
  const notRtl = flipped.filter((el) => !rtl.includes(el)).slice(0, 3).map((el) => el.outerHTML.slice(0, 120));
  return { flipped: stats.flipped, computedRtl: rtl.length, notRtl, off: timeDisable() };
}

(window as unknown as { MijharA: unknown }).MijharA = { directionScan, directionReset, mountModule, timeDisable, timeSettingsOff, oracle, effective };
