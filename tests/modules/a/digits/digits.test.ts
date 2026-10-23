// TEST-RTL-06 (AC-A6) على jsdom: شكل الأرقام في النثر العربي الخالص وحده بمجموعة الحالات المعرّفة هنا (تُضاف إلى
// fixture-mixed-rtl-readme.html)، وثبات نص <relative-time>، وإعادة النص عند الإيقاف بحارس الملكية، وتحديث GitHub الحي.
// التلميح الهجري في hijri.test.ts، والقياس في المتصفحات الأربعة (Intl وPB-01) في tests/modules/a/browser/run.mjs.
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { DIGITS_FEATURE, isPureArabicProse, toEasternDigits } from '../../../../src/modules/a/digits';
import { DIRECTION_FEATURE } from '../../../../src/modules/a/direction';
import { ISOLATION_FEATURE } from '../../../../src/modules/a/isolation';
import { createModuleA } from '../../../../src/modules/a/scope';
import type { FeatureStopReport, ModuleAFeature } from '../../../../src/modules/a/scope';
import { loadFixture } from '../direction/helpers';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// الحالات المعرّفة: [المعرّف، HTML يُدرج، النص المتوقع بعد التفعيل مع الاتجاه والعزل كما في الإضافة].
export const DIGIT_CASES: ReadonlyArray<readonly [string, string, string]> = [
  ['prose', '<p dir="auto">في المستودع 12 ملفًا و3 مجلدات.</p>', 'في المستودع ١٢ ملفًا و٣ مجلدات.'],
  ['prose-list', '<ul><li>الخطوة 2 من 5</li></ul>', 'الخطوة ٢ من ٥'],
  ['prose-table', '<table><tbody><tr><td>عدد المساهمين 42</td></tr></tbody></table>', 'عدد المساهمين ٤٢'],
  ['code-inline', '<p dir="auto">شغّل <code>node 22</code> ثم انتظر 5 ثوانٍ</p>', 'شغّل node 22 ثم انتظر ٥ ثوانٍ'],
  ['code-block', '<pre><code>// انتظر 5 ثوانٍ\nsleep 5</code></pre>', '// انتظر 5 ثوانٍ\nsleep 5'],
  // العزل يغلّف المرجع والإصدار فيصير ما حولهما عقد نثر خالصة تُحوَّل، ويبقى المرجع والإصدار.
  ['issue-ref', '<p dir="auto">راجع #452 قبل 3 أيام</p>', 'راجع #452 قبل ٣ أيام'],
  ['version', '<p dir="auto">الإصدار v1.2.3 صدر قبل 3 أيام</p>', 'الإصدار v1.2.3 صدر قبل ٣ أيام'],
  ['sha', '<p dir="auto">الالتزام a1b2c3d أصلح 2 خطأ</p>', 'الالتزام a1b2c3d أصلح 2 خطأ'],
  ['iso-date', '<p dir="auto">صدر في 2026-10-22 بعد 3 أيام</p>', 'صدر في 2026-10-22 بعد ٣ أيام'],
  ['percent', '<p dir="auto">اكتمل 75% من العمل في 4 أيام</p>', 'اكتمل 75% من العمل في ٤ أيام'],
  ['decimal', '<p dir="auto">النسخة 3.5 أسرع</p>', 'النسخة 3.5 أسرع'],
  ['relative-time', '<p dir="auto">نُشر <relative-time datetime="2026-10-20T10:00:00Z">منذ 3 أيام</relative-time> فقط</p>', 'نُشر منذ 3 أيام فقط'],
  ['link', '<p dir="auto">انظر <a href="#v2">الفصل 2</a> أولًا</p>', 'انظر الفصل 2 أولًا'],
  ['english', '<p dir="auto">Version 2 is out in 3 days</p>', 'Version 2 is out in 3 days'],
  ['kbd', '<p dir="auto">اضغط <kbd>F5</kbd> مرة 1</p>', 'اضغط F5 مرة ١'],
];

// خارج حاويات Markdown: أرقام الأسطر وشريط اللغات وعناوين React تبقى.
const OUTSIDE = [
  '<table data-case="blob"><tr><td class="blob-num" data-line-number="12">12</td><td class="blob-code">// تعليق 5</td></tr></table>',
  '<span data-case="lang-bar">JavaScript 62.5%</span>',
  '<bdi class="markdown-title" data-case="title">إصدار 3 من الدليل</bdi>',
].join('');

function casesDocument(): Document {
  const doc = loadFixture('https://github.com/octo/mijhar-demo').window.document;
  const body = doc.querySelector('article.markdown-body') as Element;
  body.insertAdjacentHTML('beforeend', DIGIT_CASES.map(([id, html]) => `<div data-digits="${id}">${html}</div>`).join(''));
  doc.querySelector('.Layout-main')?.insertAdjacentHTML('beforeend', OUTSIDE);
  return doc;
}

interface Mounted {
  readonly doc: Document;
  readonly manager: LifecycleManager;
  readonly reports: FeatureStopReport[];
}

function mount(doc: Document, features: readonly ModuleAFeature[] = [DIRECTION_FEATURE, ISOLATION_FEATURE, DIGITS_FEATURE]): Mounted {
  const reports: FeatureStopReport[] = [];
  const enabled = features.map((f) => (f.id === DIGITS_FEATURE.id ? { ...f, defaults: { ...f.defaults, enabled: true } } : f));
  const module = createModuleA({ features: enabled, onReport: (r) => reports.push(r) });
  const detector = new PageDetector({ document: doc, settleMs: 5 });
  const manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector, document: doc, isEnabled: () => true });
  manager.start();
  return { doc, manager, reports };
}

const caseText = (doc: Document, id: string): string => doc.querySelector(`[data-digits="${id}"]`)?.textContent ?? '';

describe('toEasternDigits وisPureArabicProse', () => {
  it('يحوّل الأرقام المنفردة ويستثني ISO والنسب والأعداد المنقوطة و#123', () => {
    expect(toEasternDigits('في 2026-10-22 اكتمل 75% من 3 مهام بالإصدار 1.2.3 و#9 و0')).toBe('في 2026-10-22 اكتمل 75% من ٣ مهام بالإصدار 1.2.3 و#9 و٠');
  });

  it.each([
    ['في المستودع 12 ملفًا', true],
    ['Version 2', false],
    ['الإصدار v1.2', false],
    ['راجع #12', false],
    ['في src/a 3 ملفات', false],
    ['لا أرقام هنا', false],
    ['12 34', false],
  ])('%s → %s', (text, pure) => {
    expect(isPureArabicProse(text)).toBe(pure);
  });
});

describe('TEST-RTL-06: شكل الأرقام في الحالات المعرّفة', () => {
  it.each(DIGIT_CASES)('%s', (id, _html, expected) => {
    const { doc, manager } = mount(casesDocument());
    expect(caseText(doc, id)).toBe(expected);
    manager.stop();
  });

  it('خارج حاويات Markdown لا يُحوَّل شيء (أرقام الأسطر وشريط اللغات والعناوين)', () => {
    const doc = casesDocument();
    const before = ['blob', 'lang-bar', 'title'].map((id) => doc.querySelector(`[data-case="${id}"]`)?.textContent);
    const { manager } = mount(doc);
    expect(['blob', 'lang-bar', 'title'].map((id) => doc.querySelector(`[data-case="${id}"]`)?.textContent)).toEqual(before);
    manager.stop();
  });

  it('نص <relative-time> وسماته لا تتغير', () => {
    const doc = casesDocument();
    const time = doc.querySelector('[data-digits="relative-time"] relative-time') as Element;
    const html = time.outerHTML;
    const { manager } = mount(doc);
    expect(time.outerHTML).toBe(html);
    manager.stop();
  });

  it('إيقاف الخيار يعيد النص الأصلي حرفيًا بحارس الملكية ويُبلَّغ زمنه', () => {
    const doc = casesDocument();
    const html = doc.body.innerHTML;
    const { manager, reports } = mount(doc);
    expect(caseText(doc, 'prose')).toBe('في المستودع ١٢ ملفًا و٣ مجلدات.');
    manager.stop();
    expect(doc.body.innerHTML).toBe(html);
    const digits = reports.find((r) => r.featureId === DIGITS_FEATURE.id);
    expect(digits?.text?.restored).toBeGreaterThanOrEqual(8);
    expect(digits?.text?.skipped).toEqual([]);
    expect(digits?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('تعليق جديد يُحوَّل، وتحديث GitHub لعقدة محوّلة يُترك كما كتبه ولا يُستعاد فوقه', async () => {
    const doc = casesDocument();
    const { manager, reports } = mount(doc);
    const p = doc.querySelector('[data-digits="prose"] p') as Element;
    (p.firstChild as Text).data = 'عدّل الكاتب التعليق: 7 ملفات';
    doc.querySelector('.Layout-main')?.insertAdjacentHTML('beforeend', '<div class="markdown-body" id="new"><p dir="auto">أضيف 9 اختبارات</p></div>');
    await deliver();
    await deliver();
    expect(doc.querySelector('#new p')?.textContent).toBe('أضيف ٩ اختبارات');
    expect(p.textContent).toBe('عدّل الكاتب التعليق: 7 ملفات');
    manager.stop();
    expect(p.textContent).toBe('عدّل الكاتب التعليق: 7 ملفات');
    expect(doc.querySelector('#new p')?.textContent).toBe('أضيف 9 اختبارات');
    const digits = reports.find((r) => r.featureId === DIGITS_FEATURE.id);
    expect(digits?.text?.skipped.map((s) => s.exception)).toContain('text-foreign-write');
  });

  it('بلا العزل: عقدة فيها موضع عزل لا تُحوَّل كلها (فلا يقسم العزل لاحقًا عقدةً حوّلها المحرك)', () => {
    const { doc, manager } = mount(casesDocument(), [DIRECTION_FEATURE, DIGITS_FEATURE]);
    expect(caseText(doc, 'issue-ref')).toBe('راجع #452 قبل 3 أيام');
    expect(caseText(doc, 'version')).toBe('الإصدار v1.2.3 صدر قبل 3 أيام');
    expect(caseText(doc, 'prose')).toBe('في المستودع ١٢ ملفًا و٣ مجلدات.');
    manager.stop();
  });

  it('مع العزل: الإيقاف لا يترك أرقامًا مشرقية ولا عناصر محقونة، والصفحة حرفيًا كما كانت', () => {
    const doc = casesDocument();
    const html = doc.body.innerHTML;
    const { manager } = mount(doc);
    expect(/[٠-٩]/.test(doc.body.textContent ?? '')).toBe(true);
    manager.stop();
    expect(doc.body.innerHTML).toBe(html);
    expect(/[٠-٩]/.test(doc.body.textContent ?? '')).toBe(false);
  });
});
