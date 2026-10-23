// TEST-RTL-01 (AC-A1 البنود أ إلى د وو؛ والبند هـ يقيسه tests/modules/a/direction/browser/pb02.mjs في المتصفحات): معالج الاتجاه
// على fixture-mixed-rtl-readme.html (مرجع data-expect لكل كتلة) وعلى عينات التعليقات الحقيقية من T-0.1.
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector, SelectorsRegistry } from '../../../../src/core';
import {
  DEFAULT_DIRECTION_OPTIONS,
  DIRECTION_SELECTORS,
  DIRECTION_SELECTOR_KEYS,
  DIR_ATTR,
  ORIG_DIR_ATTR,
  decide,
  measureBlock,
  resolveNative,
} from '../../../../src/modules/a/direction';
import type { BlockMeasure } from '../../../../src/modules/a/direction';
import { createModuleA } from '../../../../src/modules/a/scope';
import { dirAttributes, loadFixture, loadSpike, runProcessor } from './helpers';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function fixtureCases(): Array<[string, 'rtl' | 'keep']> {
  const doc = loadFixture().window.document;
  return [...doc.querySelectorAll('[data-expect]')].map((el) => [el.getAttribute('data-case') as string, el.getAttribute('data-expect') as 'rtl' | 'keep']);
}

describe('TEST-RTL-01: fixture-mixed-rtl-readme.html', () => {
  const cases = fixtureCases();

  it('العينة تغطي الحالات المطلوبة في الخطة', () => {
    const names = cases.map(([name]) => name);
    for (const required of ['p-starts-with-mention', 'p-starts-with-issue-ref', 'p-starts-with-code', 'p-starts-with-path', 'td-arabic-diacritized', 'code-block', 'p-relative-time', 'file-tree', 'p-pure-english']) {
      expect(names).toContain(required);
    }
    expect(cases.filter(([, expect]) => expect === 'rtl').length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases)('%s → %s', (name, expected) => {
    const dom = loadFixture();
    const doc = dom.window.document;
    const el = doc.querySelector(`[data-case="${name}"]`) as Element;
    const originalDir = el.getAttribute('dir');
    runProcessor(doc);
    if (expected === 'rtl') {
      expect(el.getAttribute(DIR_ATTR)).toBe('rtl');
      // (د) القيمة الأصلية محفوظة، وسمة dir نفسها لم تُمس.
      expect(el.getAttribute(ORIG_DIR_ATTR)).toBe(originalDir ?? '');
      expect(el.getAttribute('dir')).toBe(originalDir);
    } else {
      expect(el.hasAttribute(DIR_ATTR)).toBe(false);
      expect(el.hasAttribute(ORIG_DIR_ATTR)).toBe(false);
    }
  });

  it('(ج) شجرة الملفات وهيكل الصفحة يبقيان ltr: لا سمة خارج الحاويات والكتل المستقلة، وشجرة الملفات حرفيًا كما هي', () => {
    const dom = loadFixture();
    const doc = dom.window.document;
    const tree = doc.querySelector('[aria-labelledby="folders-and-files"]') as Element;
    const header = doc.getElementById('repository-container-header') as Element;
    const treeBefore = tree.outerHTML;
    const headerBefore = header.outerHTML;
    const dirsBefore = dirAttributes(doc);
    const htmlAttrs = [...doc.documentElement.attributes].map((a) => `${a.name}=${a.value}`);
    const bodyAttrs = [...doc.body.attributes].map((a) => `${a.name}=${a.value}`);
    runProcessor(doc);
    expect(tree.outerHTML).toBe(treeBefore);
    expect(header.outerHTML).toBe(headerBefore);
    expect(dirAttributes(doc)).toEqual(dirsBefore);
    expect([...doc.documentElement.attributes].map((a) => `${a.name}=${a.value}`)).toEqual(htmlAttrs);
    expect([...doc.body.attributes].map((a) => `${a.name}=${a.value}`)).toEqual(bodyAttrs);
    const allowed = [...DIRECTION_SELECTORS.filter((s) => s.key !== DIRECTION_SELECTOR_KEYS.container).flatMap((s) => s.candidates), '.markdown-body *'].join(', ');
    for (const el of doc.querySelectorAll(`[${DIR_ATTR}]`)) expect(el.matches(allowed)).toBe(true);
  });

  it('(ب) لا تُقلب كتلة لا حرف عربيًا فيها؛ و(و) لا تُقلب كتلة يعرضها GitHub rtl أصلًا ولا كتلة بـdir="ltr" صريحة', () => {
    const doc = loadFixture().window.document;
    const natives = new Map([...doc.querySelectorAll('.markdown-body :is(p, li, h1, h2, h3, h4, h5, h6, td, th)')].map((el) => [el, resolveNative(el)]));
    runProcessor(doc);
    for (const [el, native] of natives) {
      if (!el.hasAttribute(DIR_ATTR)) continue;
      expect(measureBlock(el).arabic).toBeGreaterThan(0);
      expect(native.direction).toBe('ltr');
      expect(native.source).not.toBe('explicit');
    }
  });

  it('نص relative-time والكود ومحتوى الكتل لا يتغير: المعالج يكتب سمتين فقط', () => {
    const doc = loadFixture().window.document;
    const textBefore = doc.body.textContent;
    const times = [...doc.querySelectorAll('relative-time')].map((t) => t.outerHTML);
    const { recorder } = runProcessor(doc);
    expect(doc.body.textContent).toBe(textBefore);
    expect([...doc.querySelectorAll('relative-time')].map((t) => t.outerHTML)).toEqual(times);
    expect(recorder.size).toBe(doc.querySelectorAll(`[${DIR_ATTR}]`).length * 2);
  });

  it('الاستعادة تعيد المستند حرفيًا، والتشغيل ثانية لا يكرر شيئًا', () => {
    const dom = loadFixture();
    const doc = dom.window.document;
    const before = doc.documentElement.outerHTML;
    const run = runProcessor(doc);
    const flipped = doc.querySelectorAll(`[${DIR_ATTR}]`).length;
    expect(run.processor.scan(doc)).toMatchObject({ flipped: 0, lists: 0 });
    expect(doc.querySelectorAll(`[${DIR_ATTR}]`).length).toBe(flipped);
    const report = run.recorder.restore();
    expect(report).toMatchObject({ restored: flipped * 2, skipped: [] });
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it('القائمة تُقلب كلها حين تكون كل عناصرها عربية، والمختلطة يُقلب عنصرها العربي وحده', () => {
    const doc = loadFixture().window.document;
    const { stats } = runProcessor(doc);
    expect(stats.lists).toBe(2);
    expect(doc.querySelector('[data-case="ul-all-arabic"]')?.getAttribute(DIR_ATTR)).toBe('rtl');
    expect(doc.querySelector('[data-case="ul-mixed"]')?.hasAttribute(DIR_ATTR)).toBe(false);
    expect(doc.querySelector('[data-case="li-mixed-english"]')?.hasAttribute(DIR_ATTR)).toBe(false);
  });

  it('محدد مستقل غائب أو معطوب لا يكسر المعالجة ويظهر في صحة الجدول', () => {
    const doc = loadFixture().window.document;
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    selectors.define({ key: DIRECTION_SELECTOR_KEYS.repoDescription, description: 'معطوب', candidates: ['p[class*="gone__"]', ':::'] });
    const { stats } = runProcessor(doc, undefined, selectors);
    expect(stats.flipped).toBeGreaterThan(20);
    expect(doc.querySelector('[data-case="repo-description-ar"]')?.hasAttribute(DIR_ATTR)).toBe(false);
    expect(selectors.health()[DIRECTION_SELECTOR_KEYS.repoDescription]?.status).toBe('missing');
  });
});

describe('TEST-RTL-01: عينات التعليقات الحقيقية (T-0.1)', () => {
  const COMMENT_PAGES = [
    ['fixture-50-comments.html', 'https://github.com/octo/demo/issues/50'],
    ['gh-issue-etos-1.html', 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1'],
    ['gh-issue-winscreen-1.html', 'https://github.com/M-Tech54/WinScreen-Lite-By-python/issues/1'],
    ['gh-pr-watad-80.html', 'https://github.com/octo/watad/pull/80'],
  ] as const;

  it.each(COMMENT_PAGES)('%s: كل كتلة عربية بوضوح يعرضها GitHub ltr تُقلب، ولا تُقلب كتلة لاتينية ولا كتلة يعرضها rtl', (file, url) => {
    const doc = loadSpike(file, url).window.document;
    const blocks = [...doc.querySelectorAll('.markdown-body :is(p, li, h1, h2, h3, h4, h5, h6, td, th)')];
    const before = new Map<Element, { m: BlockMeasure; native: ReturnType<typeof resolveNative> }>(blocks.map((el) => [el, { m: measureBlock(el), native: resolveNative(el) }]));
    runProcessor(doc);
    for (const [el, { m, native }] of before) {
      const flipped = el.hasAttribute(DIR_ATTR);
      if (m.ratio >= DEFAULT_DIRECTION_OPTIONS.strong && native.direction === 'ltr' && native.source !== 'explicit' && !el.closest('pre, code')) {
        expect(flipped).toBe(true);
      }
      if (m.arabic === 0 || native.direction === 'rtl') expect(flipped).toBe(false);
    }
  });
});

describe('قاعدة القلب (decide)', () => {
  const m = (ratio: number, extra: Partial<BlockMeasure> = {}): BlockMeasure => ({ ratio, arabic: Math.round(ratio * 100), letters: 100, arabicRun: 0, latinLead: 0, linksCounted: false, ...extra });
  const ltr = { direction: 'ltr', source: 'auto' } as const;

  it.each([
    ['عربية بوضوح', m(0.6), ltr, null, 'flip'],
    ['يعرضها GitHub rtl', m(1), { direction: 'rtl', source: 'auto' } as const, null, 'native-rtl'],
    ['dir="ltr" صريحة', m(1), { direction: 'ltr', source: 'explicit' } as const, null, 'explicit-ltr'],
    ['بلا حروف', m(0, { letters: 0 }), ltr, null, 'no-letters'],
    ['لاتينية', m(0.1), ltr, 0.9, 'latin'],
    ['مختلطة في حاوية عربية', m(0.45), ltr, 0.8, 'flip'],
    ['مختلطة في حاوية إنجليزية', m(0.45), ltr, 0.2, 'mixed-latin-context'],
    ['مختلطة بتتابع ثلاث كلمات في حاوية عربية', m(0.2, { arabicRun: 3 }), ltr, 0.7, 'flip'],
    ['مختلطة خارج الحاويات لا تبدأ بجملة لاتينية', m(0.45, { latinLead: 2 }), ltr, null, 'flip'],
    ['مختلطة خارج الحاويات تبدأ بجملة لاتينية', m(0.45, { latinLead: 3 }), ltr, null, 'mixed-latin-sentence'],
  ] as const)('%s', (_name, measure, native, containerRatio, verdict) => {
    expect(decide(measure, { native, containerRatio })).toBe(verdict);
  });

  it('العتبات قابلة للضبط', () => {
    expect(decide(m(0.45), { native: ltr, containerRatio: 0.2 }, { ...DEFAULT_DIRECTION_OPTIONS, context: 0.1 })).toBe('flip');
    expect(decide(m(0.6), { native: ltr, containerRatio: null }, { ...DEFAULT_DIRECTION_OPTIONS, strong: 0.9 })).toBe('flip');
    expect(decide(m(0.6, { latinLead: 5 }), { native: ltr, containerRatio: null }, { ...DEFAULT_DIRECTION_OPTIONS, strong: 0.9 })).toBe('mixed-latin-sentence');
  });
});

describe('محتوى يضيفه GitHub أو يغيّره بعد التركيب (الميزة كاملة داخل الوحدة)', () => {
  function mountModule(): { doc: Document; manager: LifecycleManager } {
    const dom = loadFixture('https://github.com/octo/mijhar-demo');
    const doc = dom.window.document;
    const detector = new PageDetector({ document: doc, settleMs: 5 });
    const manager = new LifecycleManager({ registry: new ModuleRegistry([createModuleA()]), detector, document: doc, isEnabled: () => true });
    manager.start();
    return { doc, manager };
  }

  it('تعليق جديد عربي يُقلب، وإنجليزي لا يُقلب', async () => {
    const { doc, manager } = mountModule();
    const host = doc.querySelector('.Layout-main') as Element;
    host.insertAdjacentHTML('beforeend', '<div class="comment-body markdown-body" id="new-ar"><p dir="auto">@octo تم الإصلاح في الفرع الجديد، راجعه من فضلك</p></div><div class="comment-body markdown-body" id="new-en"><p dir="auto">LGTM, merging now.</p></div>');
    await deliver();
    expect(doc.querySelector('#new-ar p')?.getAttribute(DIR_ATTR)).toBe('rtl');
    expect(doc.querySelector('#new-en p')?.hasAttribute(DIR_ATTR)).toBe(false);
    manager.stop();
    expect(doc.querySelectorAll(`[${DIR_ATTR}], [${ORIG_DIR_ATTR}], #mijhar-reading-styles`).length).toBe(0);
  });

  it('كتلة لم تُقلب يتغير نصها إلى عربي فتُقلب', async () => {
    const { doc, manager } = mountModule();
    const p = doc.querySelector('[data-case="p-pure-english"]') as Element;
    expect(p.hasAttribute(DIR_ATTR)).toBe(false);
    (p.firstChild as Text).data = 'Edit: هذه الفقرة صارت عربية بعد أن عدّلها كاتبها في GitHub';
    await deliver();
    expect(p.getAttribute(DIR_ATTR)).toBe('rtl');
    manager.stop();
  });
});
