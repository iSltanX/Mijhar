// TEST-RTL-02 (AC-A2) على jsdom: العزل داخل الكتل rtl في fixture-mixed-rtl-readme.html (ما قلبته ميزة الاتجاه وما يعرضه GitHub
// rtl أصلًا)، وثبات textContent لكل عنصر أصلي، وغياب محارف التوجيه الخفية، وإعادة العقد النصية الأصلية نفسها عند الإيقاف.
// العرض الفعلي (direction المحسوب) ومطابقة المنسوخ في المتصفحات الأربعة في tests/modules/a/browser/run.mjs.
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector, SelectorsRegistry } from '../../../../src/core';
import { DIRECTION_FEATURE, DIRECTION_SELECTORS, DIR_ATTR } from '../../../../src/modules/a/direction';
import {
  GROUP_CLASS,
  INJECTED_ATTR,
  ISOLATE_CLASS,
  ISOLATION_CSS,
  ISOLATION_FEATURE,
  IsolationProcessor,
  LINK_ATTR,
  findIsolateRuns,
} from '../../../../src/modules/a/isolation';
import { READING_STYLES_ID, createModuleA } from '../../../../src/modules/a/scope';
import { MutationRecorder } from '../../../../src/core';
import { dirAttributes, loadFixture, loadSpike, runProcessor, SPIKE_PAGES } from '../direction/helpers';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/;

/** ما عُزل في الكتلة: نص كل span معزول بالترتيب. */
const isolatedIn = (el: Element): string[] => [...el.querySelectorAll(`.${ISOLATE_CLASS}`)].map((s) => s.textContent ?? '');

// الحالات المعرّفة لـTEST-RTL-02: لكل كتلة ما يُعزل فيها نصًا عاديًا (المسارات والإصدارات والمراجع)، أو [] حيث لا يُغلَّف شيء.
const CASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['p-starts-with-path', ['src/components/common/Explain.tsx', 'v2.0.1-rc.3']], // قلبتها ميزة الاتجاه
  ['p-arabic-with-path', ['src/api/github.ts', 'v2.0.1-rc.3', '#452']], // rtl أصلًا (dir="auto" وأول حرف قوي عربي)
  ['p-relative-time', ['v2.0.1-rc.3']], // نص <relative-time> لا يُمس
  ['p-starts-with-code', []], // الكود عنصر قائم: تعزله القاعدة لا التغليف
  ['p-terminal-inline', []],
  ['p-starts-with-mention', []],
  ['p-starts-with-issue-ref', []],
  ['p-english-with-path', []], // كتلة ltr: لا يُغلَّف فيها شيء
  ['p-pure-english', []],
  ['p-emoji-numbers', []],
];

function processFixture(): { doc: Document; recorder: MutationRecorder } {
  const doc = loadFixture().window.document;
  const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
  runProcessor(doc, undefined, selectors);
  const recorder = new MutationRecorder('a.isolation');
  new IsolationProcessor({ document: doc, selectors, mutations: recorder }).scan(doc);
  return { doc, recorder };
}

describe('أنماط العزل النصية', () => {
  it.each([
    ['حدّث الملف src/api/github.ts ثم انقل الإصدار إلى v2.0.1-rc.3 وأشر إلى المشكلة #452 في الوصف.', ['path:src/api/github.ts', 'version:v2.0.1-rc.3', 'ref:#452']],
    ['راجع owner/repo#12 و@octocat و@org/team وREADME.md وdist/ و/usr/bin و./a.sh.', ['ref:owner/repo#12', 'mention:@octocat', 'mention:@org/team', 'file:README.md', 'path:dist/', 'path:/usr/bin', 'path:./a.sh']],
    ['كتبه @M-Tech54 في package.json أو index.d.ts', ['mention:@M-Tech54', 'file:package.json', 'file:index.d.ts']],
  ])('%s', (text, expected) => {
    expect(findIsolateRuns(text).map((r) => `${r.kind}:${text.slice(r.start, r.end)}`)).toEqual(expected);
  });

  it('لا يطابق البريد ولا النسبة ولا تاريخ ISO ولا وسط كلمة، ولا يمتد إلى حرف عربي ملاصق', () => {
    for (const text of ['راسلني على a@b.com', 'النسبة 50% فقط', 'في 2026-10-22 صدر', 'لغة C#1 قديمة', 'كلمةabc']) expect(findIsolateRuns(text)).toEqual([]);
    const glued = 'الملفsrc/a.tsثم';
    expect(findIsolateRuns(glued).map((r) => glued.slice(r.start, r.end))).toEqual(['src/a.ts']);
  });

  it('الترقيم بعد المطابقة خارجها', () => {
    const text = 'انظر README.md، ثم v1.2.3.';
    expect(findIsolateRuns(text).map((r) => text.slice(r.start, r.end))).toEqual(['README.md', 'v1.2.3']);
  });
});

describe('TEST-RTL-02: fixture-mixed-rtl-readme.html', () => {
  it.each(CASES)('%s', (name, expected) => {
    const { doc } = processFixture();
    const el = doc.querySelector(`[data-case="${name}"]`) as Element;
    expect(isolatedIn(el)).toEqual(expected);
  });

  it('لا يتغير textContent لأي عنصر أصلي، ولا محرف توجيه خفي في الصفحة', () => {
    const doc = loadFixture().window.document;
    const before = new Map([...doc.querySelectorAll('*')].map((el) => [el, el.textContent]));
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    runProcessor(doc, undefined, selectors);
    const stats = new IsolationProcessor({ document: doc, selectors, mutations: new MutationRecorder('a.isolation') }).scan(doc);
    expect(stats.runs).toBeGreaterThanOrEqual(6);
    for (const [el, text] of before) expect(el.textContent).toBe(text);
    expect(BIDI_CONTROLS.test(doc.body.textContent ?? '')).toBe(false);
  });

  it('ما يُحقن بلا سمة dir، وسمات dir في الصفحة كما هي', () => {
    const doc = loadFixture().window.document;
    const dirs = dirAttributes(doc);
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    new IsolationProcessor({ document: doc, selectors, mutations: new MutationRecorder('a.isolation') }).scan(doc);
    expect(doc.querySelectorAll(`[${INJECTED_ATTR}][dir]`).length).toBe(0);
    expect(dirAttributes(doc)).toEqual(dirs);
  });

  it('الكود والكتل البرمجية وأشجار الملفات وكتل ltr لا يُغلَّف فيها شيء', () => {
    const { doc } = processFixture();
    for (const el of doc.querySelectorAll(`.${GROUP_CLASS}`)) {
      expect(el.parentElement?.closest('code, pre, a, relative-time, [aria-labelledby="folders-and-files"]')).toBeNull();
      const block = el.closest('p, li, h1, h2, h3, h4, h5, h6, td, th') as Element;
      expect(block.getAttribute(DIR_ATTR) === 'rtl' || block.getAttribute('dir') === 'auto').toBe(true);
    }
    expect(doc.querySelector('[data-case="code-block"]')?.querySelector(`[${INJECTED_ATTR}]`)).toBeNull();
  });

  it('الروابط ذات النص اللاتيني الخالص في الكتل rtl تُعلَّم، والعربية لا', () => {
    const doc = loadFixture().window.document;
    const p = doc.querySelector('[data-case="p-arabic-with-path"]') as Element;
    p.insertAdjacentHTML('beforeend', ' <a href="https://example.com/docs">https://example.com/docs</a> و<a href="#x">الدليل</a>');
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    runProcessor(doc, undefined, selectors);
    new IsolationProcessor({ document: doc, selectors, mutations: new MutationRecorder('a.isolation') }).scan(doc);
    const [latin, arabic] = [...p.querySelectorAll('a')];
    expect(latin?.getAttribute(LINK_ATTR)).toBe('ltr');
    expect(arabic?.hasAttribute(LINK_ATTR)).toBe(false);
    expect(doc.querySelector('[data-case="li-arabic-link"] a')?.hasAttribute(LINK_ATTR)).toBe(false);
    // روابط الإشارات والمراجع تعزلها القاعدة بصنفها فلا تُعلَّم.
    expect(doc.querySelector('[data-case="p-starts-with-mention"] a')?.hasAttribute(LINK_ATTR)).toBe(false);
  });

  it('الإيقاف يعيد العقد النصية الأصلية نفسها والصفحة حرفيًا', () => {
    const doc = loadFixture().window.document;
    const html = doc.body.innerHTML;
    const p = doc.querySelector('[data-case="p-arabic-with-path"]') as Element;
    const original = p.firstChild;
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    const recorder = new MutationRecorder('a.isolation');
    new IsolationProcessor({ document: doc, selectors, mutations: recorder }).scan(doc);
    expect(p.firstChild).not.toBe(original);
    const report = recorder.restore();
    expect(report.skipped).toEqual([]);
    expect(p.firstChild).toBe(original);
    expect(doc.body.innerHTML).toBe(html);
  });

  it('القاعدة تعزل العناصر القائمة في الكتل المقلوبة وفي ما يعرضه GitHub rtl، وعناصر التغليف', () => {
    expect(ISOLATION_CSS).toContain(`[${DIR_ATTR}="rtl"] :is(code, kbd, samp, a.user-mention, a.team-mention, a.issue-link, a.commit-link, span.reference, [${LINK_ATTR}]){direction:ltr;unicode-bidi:isolate}`);
    expect(ISOLATION_CSS).toContain(':dir(rtl){direction:ltr;unicode-bidi:isolate}');
    expect(ISOLATION_CSS).toContain(`.${ISOLATE_CLASS}{direction:ltr;unicode-bidi:isolate}`);
  });
});

describe('عينات T-0.1 الحقيقية', () => {
  it.each(SPIKE_PAGES.map(([name, file, url]) => [name, file, url] as const))('%s: النص كما هو وبلا محارف خفية، والإيقاف يعيد الصفحة', (_name, file, url) => {
    const doc = loadSpike(file, url).window.document;
    const html = doc.body.innerHTML;
    const text = doc.body.textContent;
    const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
    const direction = runProcessor(doc, undefined, selectors);
    const recorder = new MutationRecorder('a.isolation');
    new IsolationProcessor({ document: doc, selectors, mutations: recorder }).scan(doc);
    // النص كله حرفيًا كما كان؛ فلا محرف أُضيف (بعض العينات فيها محارف توجيه من GitHub نفسه، فلا يُشترط غيابها).
    expect(doc.body.textContent).toBe(text);
    for (const el of doc.querySelectorAll(`[${INJECTED_ATTR}]`)) expect(BIDI_CONTROLS.test(el.textContent ?? '')).toBe(false);
    expect(recorder.restore().skipped).toEqual([]);
    direction.recorder.restore();
    expect(doc.body.innerHTML).toBe(html);
  });
});

describe('الميزة داخل الوحدة (أ)', () => {
  function mount(): { doc: Document; manager: LifecycleManager } {
    const doc = loadFixture('https://github.com/octo/mijhar-demo').window.document;
    const detector = new PageDetector({ document: doc, settleMs: 5 });
    const module = createModuleA({ features: [DIRECTION_FEATURE, ISOLATION_FEATURE] });
    const manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector, document: doc, isEnabled: () => true });
    manager.start();
    return { doc, manager };
  }

  it('تعمل بعد الاتجاه في التركيب نفسه، وتعالج تعليقًا يضيفه GitHub بعده، والإيقاف يزيل أثرها كله', async () => {
    const { doc, manager } = mount();
    const html = loadFixture().window.document.body.innerHTML;
    expect(isolatedIn(doc.querySelector('[data-case="p-starts-with-path"]') as Element)).toEqual(['src/components/common/Explain.tsx', 'v2.0.1-rc.3']);
    expect(doc.getElementById(READING_STYLES_ID)?.textContent).toContain(ISOLATION_CSS);
    const host = doc.querySelector('.Layout-main') as Element;
    host.insertAdjacentHTML('beforeend', '<div class="comment-body markdown-body" id="new-ar"><p dir="auto">Fixed في الفرع fix/rtl-paths والإصدار v3.1.0 يغلق #77</p></div>');
    await deliver();
    await deliver();
    expect(isolatedIn(doc.querySelector('#new-ar p') as Element)).toEqual(['fix/rtl-paths', 'v3.1.0', '#77']);
    doc.getElementById('new-ar')?.remove();
    manager.stop();
    expect(doc.querySelectorAll(`[${INJECTED_ATTR}], [${LINK_ATTR}], [${DIR_ATTR}], #${READING_STYLES_ID}`).length).toBe(0);
    expect(doc.body.innerHTML).toBe(html);
  });
});
