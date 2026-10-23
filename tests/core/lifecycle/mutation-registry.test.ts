// MutationRecorder: كل عملية تُعكس بترتيب معاكس، وفحص الملكية يترك ما غيّره طرف آخر ويسجّله.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { MutationRecorder, RESTORE_EXCEPTION_IDS } from '../../../src/core';

const page = () => {
  const dom = new JSDOM('<!doctype html><body><main id="m"><p id="p" class="a" title="t">نص</p><span id="s"></span></main></body>');
  const doc = dom.window.document;
  return { doc, main: doc.getElementById('m') as HTMLElement, p: doc.getElementById('p') as HTMLElement, s: doc.getElementById('s') as HTMLElement };
};

describe('الاستعادة النظيفة لكل عملية', () => {
  it('insert: يُزال العنصر المحقون ويعود DOM كما كان', () => {
    const { doc, main } = page();
    const before = main.outerHTML;
    const rec = new MutationRecorder('t');
    rec.insert(main, doc.createElement('div'));
    rec.insert(main, doc.createElement('b'), main.firstChild);
    expect(main.outerHTML).not.toBe(before);
    const report = rec.restore();
    expect(main.outerHTML).toBe(before);
    expect(report).toMatchObject({ restored: 2, alreadyGone: 0, skipped: [] });
  });

  it('setAttribute على سمة موجودة وغائبة', () => {
    const { p } = page();
    const before = p.outerHTML;
    const rec = new MutationRecorder('t');
    rec.setAttribute(p, 'title', 'جديد');
    rec.setAttribute(p, 'data-x', '1');
    rec.restore();
    expect(p.outerHTML).toBe(before);
  });

  it('removeAttribute يعيد السمة بقيمتها الأصلية', () => {
    const { p } = page();
    const before = p.outerHTML;
    const rec = new MutationRecorder('t');
    rec.removeAttribute(p, 'title');
    rec.removeAttribute(p, 'غائبة');
    expect(p.hasAttribute('title')).toBe(false);
    expect(rec.size).toBe(1);
    rec.restore();
    expect(p.outerHTML).toBe(before);
  });

  it('addClass لا يزيل عند العكس صنفًا كان موجودًا؛ وclass الفارغة تُزال إن لم تكن موجودة أصلًا', () => {
    const { p, s } = page();
    const rec = new MutationRecorder('t');
    rec.addClass(p, 'a', 'b');
    rec.addClass(s, 'x');
    expect(p.className).toBe('a b');
    rec.restore();
    expect(p.className).toBe('a');
    expect(s.outerHTML).toBe('<span id="s"></span>');
  });

  it('removeClass يعيد الأصناف المزالة فقط', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.removeClass(p, 'a', 'غائب');
    expect(p.className).toBe('');
    rec.restore();
    expect(p.className).toBe('a');
  });

  it('setStyle يعيد القيمة السابقة أو يزيل الخاصية والسمة style الفارغة', () => {
    const { p, s } = page();
    s.setAttribute('style', 'color: red');
    const rec = new MutationRecorder('t');
    rec.setStyle(p, 'direction', 'rtl');
    rec.setStyle(s, 'color', 'blue', 'important');
    expect(p.getAttribute('style')).toContain('direction: rtl');
    rec.restore();
    expect(p.hasAttribute('style')).toBe(false);
    expect(s.getAttribute('style')).toBe('color: red;');
    expect(s.style.getPropertyPriority('color')).toBe('');
  });

  it('replace يعيد العقدة الأصلية في موضعها', () => {
    const { doc, main, p } = page();
    const before = main.outerHTML;
    const rec = new MutationRecorder('t');
    rec.replace(p, doc.createElement('em'));
    expect(main.querySelector('#p')).toBeNull();
    rec.restore();
    expect(main.outerHTML).toBe(before);
    expect(main.querySelector('#p')).toBe(p);
  });

  it('custom يُنفَّذ ضمن الترتيب المعاكس مع غيره', () => {
    const { doc, main } = page();
    const log: string[] = [];
    const rec = new MutationRecorder('t');
    rec.custom('أولى', () => log.push('أولى'));
    rec.insert(main, doc.createElement('i'));
    rec.custom('ثانية', () => log.push(`ثانية:${main.querySelectorAll('i').length}`));
    rec.restore();
    expect(log).toEqual(['ثانية:1', 'أولى']);
  });

  it('الترتيب المعاكس يعيد الكتابات المتتابعة على السمة نفسها إلى الأصل', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.setAttribute(p, 'title', 'أول');
    rec.setAttribute(p, 'title', 'ثان');
    rec.setAttribute(p, 'title', 'ثالث');
    rec.restore();
    expect(p.getAttribute('title')).toBe('t');
  });
});

describe('فحص الملكية: ما غيّره طرف آخر لا يُلمس ويُسجَّل', () => {
  it('سمة غيّرها GitHub بعد الكتابة', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.setAttribute(p, 'title', 'من الإضافة');
    p.setAttribute('title', 'كتبها GitHub');
    const report = rec.restore();
    expect(p.getAttribute('title')).toBe('كتبها GitHub');
    expect(report.skipped).toEqual([{ exception: 'external-attribute-change', detail: expect.stringContaining('title') }]);
  });

  it('سمة حذفها طرف آخر', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.setAttribute(p, 'data-x', '1');
    p.removeAttribute('data-x');
    expect(rec.restore().skipped.map((x) => x.exception)).toEqual(['external-attribute-change']);
  });

  it('سمة أزالتها الإضافة ثم أعاد طرف آخر كتابتها', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.removeAttribute(p, 'title');
    p.setAttribute('title', 'عادت');
    const report = rec.restore();
    expect(p.getAttribute('title')).toBe('عادت');
    expect(report.skipped.map((x) => x.exception)).toEqual(['external-attribute-change']);
  });

  it('خاصية style غيّرها طرف آخر', () => {
    const { p } = page();
    const rec = new MutationRecorder('t');
    rec.setStyle(p, 'direction', 'rtl');
    p.style.setProperty('direction', 'ltr');
    const report = rec.restore();
    expect(p.style.direction).toBe('ltr');
    expect(report.skipped.map((x) => x.exception)).toEqual(['external-style-change']);
  });

  it('عنصر محقون أزاله الصفحة: لا شيء يُعاد ويُعدّ alreadyGone لا استثناء', () => {
    const { doc, main } = page();
    const rec = new MutationRecorder('t');
    const injected = rec.insert(main, doc.createElement('div'));
    injected.remove();
    expect(rec.restore()).toMatchObject({ restored: 0, alreadyGone: 1, skipped: [] });
  });

  it('عقدة بديلة فصلها GitHub: يُعتمد ما صنعه ولا يُدرَج الأصل', () => {
    const { doc, main, p } = page();
    const rec = new MutationRecorder('t');
    const replacement = doc.createElement('em');
    rec.replace(p, replacement);
    replacement.remove();
    const report = rec.restore();
    expect(main.querySelector('#p')).toBeNull();
    expect(report.skipped.map((x) => x.exception)).toEqual(['replaced-node-lost']);
  });

  it('أعادت الصفحة العقدة الأصلية بنفسها: لا يُكتب فوقها وتُزال البديلة', () => {
    const { doc, main, p } = page();
    const rec = new MutationRecorder('t');
    const replacement = doc.createElement('em');
    rec.replace(p, replacement);
    replacement.replaceWith(p);
    const report = rec.restore();
    expect(main.querySelectorAll('#p')).toHaveLength(1);
    expect(report.skipped.map((x) => x.exception)).toEqual(['replaced-original-reattached']);
  });

  it('custom يرمي: يُسجَّل ولا يوقف بقية الاستعادة', () => {
    const { doc, main } = page();
    const rec = new MutationRecorder('t');
    const el = rec.insert(main, doc.createElement('div'));
    rec.custom('تالفة', () => {
      throw new Error('انفجرت');
    });
    const report = rec.restore();
    expect(el.isConnected).toBe(false);
    expect(report.restored).toBe(1);
    expect(report.skipped).toEqual([{ exception: 'custom-undo-failed', detail: 'تالفة: انفجرت' }]);
  });

  it('عملية DOM داخلية ترمي وقت الاستعادة: تُسجَّل undo-threw وتستمر بقية الاستعادة', () => {
    const { doc, main, p } = page();
    const rec = new MutationRecorder('t');
    const injected = rec.insert(main, doc.createElement('aside'));
    const replacement = doc.createElement('em');
    rec.replace(p, replacement);
    // الصفحة نقلت البديلة داخل الأصل المفصول: إدراج الأصل في نفسه يخرق التسلسل الهرمي (HierarchyRequestError).
    p.appendChild(replacement);
    const report = rec.restore();
    expect(report.skipped).toEqual([{ exception: 'undo-threw', detail: expect.stringContaining('replace') }]);
    expect(injected.isConnected).toBe(false);
    expect(RESTORE_EXCEPTION_IDS).toContain('undo-threw');
  });
});

describe('الإغلاق وحراس الإدخال', () => {
  it('restore مرتين: الثاني فارغ', () => {
    const { doc, main } = page();
    const rec = new MutationRecorder('t');
    rec.insert(main, doc.createElement('div'));
    expect(rec.restore().restored).toBe(1);
    expect(rec.restore()).toMatchObject({ restored: 0, alreadyGone: 0, skipped: [] });
    expect(rec.closed).toBe(true);
  });

  it('كتابة بعد الإغلاق تُرفض ولا تمس DOM وتُعدّ', () => {
    const { doc, main, p } = page();
    const before = main.outerHTML;
    const rec = new MutationRecorder('t');
    rec.restore();
    rec.insert(main, doc.createElement('div'));
    rec.setAttribute(p, 'x', '1');
    rec.addClass(p, 'z');
    rec.setStyle(p, 'color', 'red');
    rec.custom('x', () => {});
    expect(main.outerHTML).toBe(before);
    expect(rec.size).toBe(0);
  });

  it('insert يرفض عقدة مرتبطة بأب وDocumentFragment؛ replace يرفض أصلًا بلا أب', () => {
    const { doc, main, p } = page();
    const rec = new MutationRecorder('t');
    expect(() => rec.insert(main, p)).toThrow(/مرتبطة بأب/);
    expect(() => rec.insert(main, doc.createDocumentFragment())).toThrow(/DocumentFragment/);
    expect(() => rec.replace(doc.createElement('x'), doc.createElement('y'))).toThrow(/أب/);
    expect(rec.size).toBe(0);
  });

  it('معرّف الوحدة والمدة في التقرير', () => {
    const rec = new MutationRecorder('وحدة-س', () => 5);
    expect(rec.restore()).toMatchObject({ moduleId: 'وحدة-س', durationMs: 0 });
  });
});
