// TEST-RTL-07 (AC-A7 البنود ١ و٢ و٥، وAC-1.2): نطاق كل إعداد في الوحدة (أ) عبر عينات من مستودعات متعددة، وإزالة الأثر دون إعادة
// تحميل، وسرد ما لا يغطيه التسجيل في «استثناءات الاستعادة». تعمل الوحدة كما في الإضافة: PageDetector وLifecycleManager وسجل
// إعدادات حقيقي (SettingsStore فوق Store ومنطقة تخزين في الذاكرة) وتنقل Turbo بين صفحات مستودعات مختلفة.
// البندان ٣ و٤ في guard.test.ts (TEST-GUARD-01 إلى 04).
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  LifecycleManager,
  MemoryStorageArea,
  ModuleRegistry,
  PageDetector,
  RESTORE_EXCEPTION_IDS,
  SettingsRegistry,
  SettingsStore,
  Store,
  bindModuleToggles,
  moduleEnabledKey,
} from '../../../../src/core';
import type { RestoreReport } from '../../../../src/core';
import { DIRECTION_FEATURE, DIR_ATTR } from '../../../../src/modules/a/direction';
import { TEXT_RESTORE_EXCEPTION_IDS } from '../../../../src/modules/a/guard';
import type { TextTransform } from '../../../../src/modules/a/guard';
import { PageOverrides, READING_STYLES_ID, createModuleA, defineModuleASettings, featureSettingKey, resolveScope } from '../../../../src/modules/a/scope';
import type { FeatureSetting, FeatureStopReport, ModuleAFeature } from '../../../../src/modules/a/scope';
import { ROOT } from '../../../setup/paths';

const PAGES = {
  demo: { file: 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html', url: 'https://github.com/octo/mijhar-demo' },
  shakkala: { file: 'fixtures/spikes/gh-readme-shakkala.html', url: 'https://github.com/Barqawiz/Shakkala' },
  algorithms: { file: 'fixtures/spikes/gh-readme-js-algorithms-ar.html', url: 'https://github.com/trekhleb/javascript-algorithms/blob/master/README.ar-AR.md' },
  issue: { file: 'fixtures/spikes/gh-issue-etos-1.html', url: 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1' },
  profile: { file: 'fixtures/pages/unrecognized-layout.html', url: 'https://github.com/octo' },
} as const;
type PageName = keyof typeof PAGES;

const html = (name: PageName): string => fs.readFileSync(path.join(ROOT, PAGES[name].file), 'utf8');
const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const DIACRITICS = /[ً-ٰٟ]/;
const STRIP: TextTransform = { id: 'test.strip', apply: (text) => text.replace(/[ً-ٰٟ]/g, '') };

// ميزة اختبار تمرّ بكل ما يسجّله السياق: تحويل نصي بحارس الملكية، وعنصر محقون، وكتلة أنماط. (إخفاء التشكيل الفعلي في T-2.5.)
const TEXT_FEATURE: ModuleAFeature = {
  id: 'test-text',
  title: 'ميزة اختبار نصية',
  defaults: { enabled: true, scope: 'all', repos: [] },
  mount(ctx) {
    const doc = ctx.document;
    ctx.text.register(STRIP);
    const nodes: Node[] = [];
    const walker = doc.createTreeWalker(doc.body, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement?.closest('.markdown-body') && !n.parentElement.closest('pre, code') && DIACRITICS.test(n.nodeValue ?? '')) nodes.push(n);
    }
    ctx.text.apply(STRIP.id, nodes);
    const host = doc.querySelector('.markdown-body');
    if (host) {
      const badge = doc.createElement('span');
      badge.className = 'mijhar-test-badge';
      badge.setAttribute('data-mijhar-injected', 'true');
      badge.textContent = 'مِجهَر';
      ctx.mutations.insert(host, badge);
    }
    ctx.styles.set('.mijhar-test-badge{opacity:.6}');
  },
};

const FEATURES = [DIRECTION_FEATURE, TEXT_FEATURE];

interface Harness {
  readonly dom: JSDOM;
  readonly doc: Document;
  readonly settings: SettingsStore;
  readonly overrides: PageOverrides;
  readonly manager: LifecycleManager;
  readonly reports: FeatureStopReport[];
  readonly coreReports: RestoreReport[];
  navigate(name: PageName): void;
  direction(): number;
  textActive(): boolean;
  setFeature(id: string, value: FeatureSetting): Promise<void>;
}

async function harness(start: PageName): Promise<Harness> {
  const dom = new JSDOM(html(start), { url: PAGES[start].url, pretendToBeVisual: true });
  const doc = dom.window.document;
  const area = new MemoryStorageArea();
  const store = await Store.open({ area, changes: area });
  const registry = new SettingsRegistry();
  registry.defineModuleToggle('a', true);
  defineModuleASettings(registry, FEATURES);
  const settings = await SettingsStore.open(store, registry);
  const overrides = new PageOverrides();
  const reports: FeatureStopReport[] = [];
  const coreReports: RestoreReport[] = [];
  const module = createModuleA({ settings: () => settings, overrides, features: FEATURES, onReport: (r) => reports.push(r) });
  const detector = new PageDetector({ document: doc, settleMs: 5 });
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([module]),
    detector,
    document: doc,
    isEnabled: (id) => settings.isModuleEnabled(id),
    onRestore: (r) => coreReports.push(r),
  });
  bindModuleToggles(settings, manager);
  manager.start();
  return {
    dom,
    doc,
    settings,
    overrides,
    manager,
    reports,
    coreReports,
    // تنقل Turbo: يدفع المسار ويستبدل body ويطلق turbo:render ثم turbo:load (كما في tests/core/helpers/dom.ts).
    navigate(name) {
      const next = new dom.window.DOMParser().parseFromString(html(name), 'text/html');
      dom.window.history.pushState({}, '', PAGES[name].url);
      doc.dispatchEvent(new dom.window.CustomEvent('turbo:before-render'));
      doc.documentElement.replaceChild(doc.adoptNode(next.body), doc.body);
      doc.dispatchEvent(new dom.window.CustomEvent('turbo:render'));
      doc.dispatchEvent(new dom.window.CustomEvent('turbo:load'));
    },
    direction: () => doc.querySelectorAll(`[${DIR_ATTR}]`).length,
    textActive: () => doc.querySelector('.mijhar-test-badge') !== null,
    setFeature: (id, value) => settings.set(featureSettingKey(id), value as never),
  };
}

const leftovers = (doc: Document): number =>
  doc.querySelectorAll(`[data-mijhar-dir], [data-mijhar-orig-dir], [data-mijhar-injected], #${READING_STYLES_ID}`).length;

describe('TEST-RTL-07 (١): كل إعداد يعمل ضمن نطاقه المختار فقط', () => {
  it('كل GitHub: تعمل الميزتان في صفحات أربعة مستودعات مختلفة', async () => {
    const h = await harness('demo');
    for (const name of ['demo', 'shakkala', 'algorithms', 'issue'] as const) {
      if (name !== 'demo') h.navigate(name);
      expect(h.direction(), name).toBeGreaterThan(0);
      expect(h.textActive(), name).toBe(true);
    }
    h.manager.stop();
  });

  it('مستودع محدد: يعمل في صفحاته وحدها (بلا تفريق بين حالتي الأحرف)، ولا يعمل في مستودع آخر ولا في صفحة ليست لمستودع', async () => {
    const h = await harness('shakkala');
    await h.setFeature('direction', { enabled: true, scope: 'repos', repos: ['barqawiz/shakkala'] });
    expect(h.direction()).toBeGreaterThan(0);
    h.navigate('algorithms');
    expect(h.direction()).toBe(0);
    expect(h.textActive()).toBe(true); // الإعداد الآخر بنطاقه «كل GitHub» لا يتأثر
    h.navigate('demo');
    expect(h.direction()).toBe(0);
    h.navigate('profile');
    expect(h.direction()).toBe(0);
    h.navigate('shakkala');
    expect(h.direction()).toBeGreaterThan(0);
    h.manager.stop();
  });

  it('الصفحة الحالية مؤقتًا: تشغيل لهذه الصفحة وحدها، يسقط بالتنقل عنها ولا يعود بالرجوع إليها، ولا يُحفظ', async () => {
    const h = await harness('demo');
    await h.setFeature('direction', { enabled: false, scope: 'all', repos: [] });
    expect(h.direction()).toBe(0);
    h.overrides.set('direction', h.dom.window.location.href, true);
    expect(h.direction()).toBeGreaterThan(0);
    expect(h.settings.get(featureSettingKey('direction'))).toEqual({ enabled: false, scope: 'all', repos: [] });
    h.navigate('shakkala');
    expect(h.direction()).toBe(0);
    h.navigate('demo');
    expect(h.direction()).toBe(0);
    h.manager.stop();
  });

  it('إيقاف مؤقت لهذه الصفحة وحدها فوق «كل GitHub»', async () => {
    const h = await harness('demo');
    expect(h.direction()).toBeGreaterThan(0);
    h.overrides.set('direction', h.dom.window.location.href, false);
    expect(h.direction()).toBe(0);
    expect(h.textActive()).toBe(true);
    h.navigate('algorithms');
    expect(h.direction()).toBeGreaterThan(0);
    h.manager.stop();
  });

  it('تغيير النطاق يسري فورًا دون إعادة تحميل ولا إعادة تركيب الوحدة', async () => {
    const h = await harness('demo');
    const mountedBefore = h.coreReports.length;
    expect(h.direction()).toBeGreaterThan(0);
    await h.setFeature('direction', { enabled: true, scope: 'repos', repos: ['barqawiz/shakkala'] });
    expect(h.direction()).toBe(0);
    expect(h.reports.at(-1)).toMatchObject({ featureId: 'direction', reason: 'out-of-scope' });
    await h.setFeature('direction', { enabled: true, scope: 'repos', repos: ['barqawiz/shakkala', 'octo/mijhar-demo'] });
    expect(h.direction()).toBeGreaterThan(0);
    expect(h.coreReports.length).toBe(mountedBefore); // الوحدة لم تُوقف
    expect(h.textActive()).toBe(true);
    h.manager.stop();
  });

  it('قيمة إعداد مرفوضة لا تُكتب، والمخزَّنة التالفة تُهمل إلى الافتراضي', async () => {
    const h = await harness('demo');
    await expect(h.settings.set(featureSettingKey('direction'), { enabled: true, scope: 'repos', repos: ['ليس مستودعًا'] })).rejects.toThrow();
    await expect(h.settings.set(featureSettingKey('direction'), { enabled: true, scope: 'page', repos: [] })).rejects.toThrow();
    expect(h.direction()).toBeGreaterThan(0);
    h.manager.stop();
  });

  it('resolveScope: القرار دالة نقية من الإعداد والصفحة والتجاوز', () => {
    const repo = { owner: 'Octo', repo: 'Demo' };
    const repos: FeatureSetting = { enabled: true, scope: 'repos', repos: ['octo/demo'] };
    expect(resolveScope(repos, repo)).toEqual({ active: true, reason: 'repo' });
    expect(resolveScope(repos, { owner: 'octo', repo: 'other' })).toEqual({ active: false, reason: 'other-repo' });
    expect(resolveScope(repos, { owner: null, repo: null })).toEqual({ active: false, reason: 'not-a-repo-page' });
    expect(resolveScope({ ...repos, enabled: false }, repo)).toEqual({ active: false, reason: 'disabled' });
    expect(resolveScope({ ...repos, enabled: false }, repo, true)).toEqual({ active: true, reason: 'page-on' });
    expect(resolveScope({ enabled: true, scope: 'all', repos: [] }, repo, false)).toEqual({ active: false, reason: 'page-off' });
  });
});

describe('TEST-RTL-07 (٢): إيقاف الإعداد يزيل أثره كله دون إعادة تحميل', () => {
  it.each(['demo', 'shakkala', 'algorithms', 'issue'] as const)('%s: إيقاف الإعدادين يعيد المستند حرفيًا كما كان قبل التركيب', async (name) => {
    const dom = new JSDOM(html(name), { url: PAGES[name].url });
    const pristine = dom.window.document.documentElement.outerHTML;
    const h = await harness(name);
    expect(leftovers(h.doc)).toBeGreaterThan(0);
    expect(h.doc.getElementById(READING_STYLES_ID)?.textContent).toContain('/* direction */');
    await h.setFeature('direction', { enabled: false, scope: 'all', repos: [] });
    // بقي الإعداد الآخر: أنماطه وحدها في العنصر
    expect(h.doc.querySelectorAll(`[${DIR_ATTR}]`).length).toBe(0);
    expect(h.doc.getElementById(READING_STYLES_ID)?.textContent).not.toContain('/* direction */');
    await h.setFeature('test-text', { enabled: false, scope: 'all', repos: [] });
    expect(leftovers(h.doc)).toBe(0);
    expect(h.doc.documentElement.outerHTML).toBe(pristine);
    const [direction, text] = h.reports;
    expect(direction).toMatchObject({ featureId: 'direction', reason: 'out-of-scope', errors: [], restore: { skipped: [] } });
    expect(text).toMatchObject({ featureId: 'test-text', reason: 'out-of-scope', errors: [], restore: { skipped: [] }, text: { skipped: [] } });
    expect((text?.text?.restored ?? 0) > 0 || name === 'issue' || name === 'algorithms').toBe(true);
    h.manager.stop();
  });

  it('إيقاف الوحدة كلها (modules.a.enabled) يزيل أثر الميزتين معًا', async () => {
    const dom = new JSDOM(html('shakkala'), { url: PAGES.shakkala.url });
    const pristine = dom.window.document.documentElement.outerHTML;
    const h = await harness('shakkala');
    expect(leftovers(h.doc)).toBeGreaterThan(0);
    await h.settings.set(moduleEnabledKey('a'), false);
    expect(leftovers(h.doc)).toBe(0);
    expect(h.doc.documentElement.outerHTML).toBe(pristine);
    expect(h.reports.map((r) => [r.featureId, r.reason])).toEqual([
      ['test-text', 'unmount'],
      ['direction', 'unmount'],
    ]);
    h.manager.stop();
  });

  it('زمن الإيقاف مقيس في كل تقرير (قياس تمهيدي على jsdom؛ PB-01 في المتصفحات: tests/modules/a/direction/browser)', async () => {
    const h = await harness('algorithms');
    await h.setFeature('direction', { enabled: false, scope: 'all', repos: [] });
    const report = h.reports.at(-1) as FeatureStopReport;
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.restore.restored).toBeGreaterThan(100);
    h.manager.stop();
  });
});

describe('TEST-RTL-07 (٥): ما لا يغطيه التسجيل يُسرد في «استثناءات الاستعادة» ولا تُدّعى له استعادة', () => {
  it('كتابة GitHub على نص محوَّل، واستبدال عقدة، وتغيير سمة كتبتها الإضافة: تُترك كلها وتُسرد بأرقام موثقة', async () => {
    const h = await harness('shakkala');
    await deliver();
    const cells = [...h.doc.querySelectorAll('.markdown-body td')].filter((td) => td.hasAttribute(DIR_ATTR));
    expect(cells.length).toBeGreaterThanOrEqual(3);
    const [edited, replaced, attr] = cells as [Element, Element, Element];
    // GitHub يحرّر نص خلية (حتى بنص يساوي المعروض)، ويستبدل عقدة نص أخرى، ويعيد كتابة data-mijhar-dir على ثالثة.
    const editedNode = [...edited.childNodes].find((n) => n.nodeType === 3 && (n.nodeValue ?? '').trim()) as Text;
    editedNode.data = editedNode.data;
    replaced.replaceChildren(h.doc.createTextNode('نص جديد من GitHub'));
    attr.setAttribute(DIR_ATTR, 'ltr');
    await deliver();

    await h.settings.set(moduleEnabledKey('a'), false);
    const text = h.reports.find((r) => r.featureId === 'test-text')?.text;
    const direction = h.reports.find((r) => r.featureId === 'direction')?.restore;
    expect(text?.skipped.map((s) => s.exception).sort()).toEqual(['text-foreign-write', 'text-node-removed']);
    expect(direction?.skipped.map((s) => s.exception)).toEqual(['external-attribute-change']);
    expect(editedNode.data).not.toMatch(DIACRITICS);
    expect(replaced.textContent).toBe('نص جديد من GitHub');
    expect(attr.getAttribute(DIR_ATTR)).toBe('ltr');
    const documented = new Set<string>([...TEXT_RESTORE_EXCEPTION_IDS, ...RESTORE_EXCEPTION_IDS]);
    for (const report of h.reports) {
      for (const skip of [...report.restore.skipped, ...(report.text?.skipped ?? [])]) expect(documented.has(skip.exception)).toBe(true);
    }
    h.manager.stop();
  });

  it('التنقل يستبدل body: العقد المحوَّلة القديمة تُسرد عقدًا أُزيلت ولا يُكتب عليها', async () => {
    const h = await harness('shakkala');
    const oldBody = h.doc.body;
    h.navigate('demo');
    const text = h.reports.find((r) => r.featureId === 'test-text' && r.reason === 'unmount')?.text;
    expect(text?.restored).toBe(0);
    expect(text?.skipped.length).toBeGreaterThan(0);
    expect(new Set(text?.skipped.map((s) => s.exception))).toEqual(new Set(['text-node-removed']));
    expect(oldBody.isConnected).toBe(false);
    h.manager.stop();
  });
});
