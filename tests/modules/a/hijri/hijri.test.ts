// TEST-RTL-06 (AC-A6) على Node وjsdom: التلميح الهجري يطابق Intl.DateTimeFormat بتقويم أم القرى على تواريخ مرجعية مع تعديل ±1 و±2،
// ونص <relative-time> وسماته لا تتغير، والتلميح عنصر واحد يُزال بإيقاف الميزة. مطابقة Intl وتوفر التقويم في كل متصفح في
// tests/modules/a/browser/run.mjs.
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { HOST_ATTR } from '../../../../src/core/ui-host/shadow';
import { DEFAULT_HIJRI_OPTIONS, HIJRI_FEATURE, HIJRI_HOST_NAME, availableCalendar, hijriDate, isHijriOptions, offsetLabel } from '../../../../src/modules/a/hijri';
import { createModuleA } from '../../../../src/modules/a/scope';
import { loadFixture } from '../direction/helpers';

/** تواريخ مرجعية (ظهرًا بالتوقيت العالمي فلا تعبر منتصف الليل في منطقة زمنية معقولة) ومقابلها في تقويم أم القرى. */
export const REFERENCE_DATES: ReadonlyArray<readonly [string, string]> = [
  ['2024-03-11T12:00:00Z', 'الاثنين، 1 رمضان 1445 هـ'],
  ['2025-03-01T12:00:00Z', 'السبت، 1 رمضان 1446 هـ'],
  ['2025-06-06T12:00:00Z', 'الجمعة، 10 ذو الحجة 1446 هـ'],
  ['2026-10-23T12:00:00Z', 'الجمعة، 12 جمادى الأولى 1448 هـ'],
];
const OFFSETS = [-2, -1, 0, 1, 2] as const;
const DAY = 86_400_000;

describe('hijriDate', () => {
  it('أم القرى متاح في Node (ICU كامل)', () => {
    expect(availableCalendar()).toBe('islamic-umalqura');
  });

  it.each(REFERENCE_DATES)('%s → %s', (datetime, expected) => {
    expect(hijriDate(datetime)?.text).toBe(expected);
  });

  it('كل تعديل من −2 إلى +2 يطابق Intl على التاريخ المزاح نفسه', () => {
    const intl = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { dateStyle: 'full' });
    for (const [datetime] of REFERENCE_DATES) {
      for (const offset of OFFSETS) {
        expect(hijriDate(datetime, { offset, numerals: 'latn' })?.text).toBe(intl.format(new Date(Date.parse(datetime) + offset * DAY)));
      }
    }
  });

  it('الأرقام المشرقية بخيار numerals', () => {
    expect(hijriDate('2025-03-01T12:00:00Z', { offset: 0, numerals: 'arab' })?.text).toBe('السبت، ١ رمضان ١٤٤٦ هـ');
  });

  it('datetime غير صالحة أو تقويم غير متاح ← null', () => {
    expect(hijriDate('not a date')).toBeNull();
    expect(hijriDate('2025-03-01T12:00:00Z', DEFAULT_HIJRI_OPTIONS, null)).toBeNull();
  });

  it('التحقق من الإعداد', () => {
    expect(isHijriOptions({ offset: 2, numerals: 'arab' })).toBe(true);
    for (const bad of [{ offset: 3, numerals: 'latn' }, { offset: 1.5, numerals: 'latn' }, { offset: 0, numerals: 'x' }, { offset: 0 }, { offset: 0, numerals: 'latn', extra: 1 }]) {
      expect(isHijriOptions(bad)).toBe(false);
    }
    expect([offsetLabel(0), offsetLabel(1), offsetLabel(-2)]).toEqual(['', 'بتعديل +يوم واحد', 'بتعديل −يومين']);
  });
});

describe('التلميح في الصفحة', () => {
  function mount() {
    const dom = loadFixture('https://github.com/octo/mijhar-demo');
    const doc = dom.window.document;
    const detector = new PageDetector({ document: doc, settleMs: 5 });
    const manager = new LifecycleManager({ registry: new ModuleRegistry([createModuleA({ features: [HIJRI_FEATURE] })]), detector, document: doc, isEnabled: () => true });
    manager.start();
    return { dom, doc, manager };
  }
  const tooltip = (doc: Document) => doc.querySelector(`[${HOST_ATTR}="${HIJRI_HOST_NAME}"]`) as HTMLElement | null;

  it('المرور يُظهر التاريخ الهجري لسمة datetime، ونص <relative-time> لا يتغير، والخروج وEscape يخفيانه', () => {
    const { dom, doc, manager } = mount();
    const time = doc.querySelector('relative-time') as Element;
    const html = time.outerHTML;
    time.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    const host = tooltip(doc);
    expect(host?.hasAttribute('data-open')).toBe(true);
    const expected = hijriDate(time.getAttribute('datetime') as string)?.text;
    expect(host?.shadowRoot?.querySelector('.date')?.textContent).toBe(expected);
    expect(host?.shadowRoot?.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(time.outerHTML).toBe(html);
    time.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: doc.body }));
    expect(host?.hasAttribute('data-open')).toBe(false);
    time.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host?.hasAttribute('data-open')).toBe(false);
    manager.stop();
    expect(tooltip(doc)).toBeNull();
    expect(time.outerHTML).toBe(html);
  });

  it('تركيز رابط يحوي التاريخ يُظهره', () => {
    const { dom, doc, manager } = mount();
    const p = doc.querySelector('[data-case="p-relative-time"]') as Element;
    p.insertAdjacentHTML('beforeend', '<a href="#c" id="commit-link"><relative-time datetime="2025-03-01T12:00:00Z">Mar 1, 2025</relative-time></a>');
    const link = doc.getElementById('commit-link') as HTMLElement;
    link.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));
    expect(tooltip(doc)?.shadowRoot?.querySelector('.date')?.textContent).toBe('السبت، 1 رمضان 1446 هـ');
    manager.stop();
  });
});
