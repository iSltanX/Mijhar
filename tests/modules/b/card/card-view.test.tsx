// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-GLOSS-02 (AC-B2): مستويات الشرح الثلاثة قابلة للتبديل لكل مدخل، ومثال عملي لكل مدخل في قائمة المصطلحات الأساسية.
// TEST-GLOSS-03 (AC-B3): الإنجليزي بجوار العربي في البطاقة وفي كل مستوى، dir="ltr"، ولا خيار لإخفائه.
// TEST-GLOSS-06 (AC-B4): بطاقة بيانات القرار بحقولها الخمسة؛ لا حقل فارغ ولا قيمة خارج المجموعة المعتمدة؛ «غير محدد في المصدر» بدل التخمين.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CORE_TERM_IDS, DEFAULT_LEVEL, ExplainCard, GLOSSARY_ENTRIES, LEVELS, LEVEL_LABELS, NOT_SPECIFIED, PERMISSION_LABELS, decisionFields, docsLink, isUnverified } from '../../../../src/modules/b/card';
import type { GlossaryEntry } from '../../../../src/data/glossary/types';
import { PERMISSION_LEVELS, REVERSIBILITY, SAFETY_LEVELS } from '../../../../src/data/glossary/schema.mjs';
import { testEntry } from './helpers';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => {
  act(() => void render(null, container));
  container.remove();
});

const show = (entry: GlossaryEntry): HTMLElement => {
  act(() => void render(<ExplainCard entry={entry} onClose={() => undefined} />, container));
  return container.querySelector('.card') as HTMLElement;
};
const tab = (level: string): HTMLButtonElement => container.querySelector(`[role="tab"]#mj-card-tab-${level}`) as HTMLButtonElement;
const entryById = (id: string): GlossaryEntry => GLOSSARY_ENTRIES.find((e) => e.id === id) as GlossaryEntry;
const clean = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('مستويات الشرح الثلاثة (AC-B2)', () => {
  it('ثلاثة تبويبات بالأسماء المعتمدة، والافتراضي المتوسط، والتبديل يعرض نص المستوى المختار من المدخل', () => {
    const entry = entryById('squash_merge');
    show(entry);
    expect(LEVELS.map((l) => LEVEL_LABELS[l])).toEqual(['مختصر', 'متوسط', 'مفصّل']);
    expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['مختصر', 'متوسط', 'مفصّل']);
    expect(DEFAULT_LEVEL).toBe('medium');
    expect(tab('medium').getAttribute('aria-selected')).toBe('true');
    for (const level of ['detailed', 'brief', 'medium'] as const) {
      act(() => void tab(level).click());
      expect(tab(level).getAttribute('aria-selected')).toBe('true');
      const text = container.querySelector('[data-level-text]') as HTMLElement;
      expect(text.dataset.levelText).toBe(level);
      expect(clean(text)).toBe(entry[level]);
    }
  });

  it('كل مدخل في القاموس الفعلي يعرض مستوياته الثلاثة غير فارغة وبنصها', () => {
    for (const entry of GLOSSARY_ENTRIES) {
      show(entry);
      for (const level of LEVELS) {
        act(() => void tab(level).click());
        expect(clean(container.querySelector('[data-level-text]')), `${entry.id}.${level}`).toBe(entry[level].replace(/\s+/g, ' ').trim());
        expect(entry[level].trim().length, `${entry.id}.${level}`).toBeGreaterThan(9);
      }
    }
  });

  it('مثال عملي لكل مدخل في «قائمة المصطلحات الأساسية» (وتشمل كل حساس أو خطر)، ويظهر في البطاقة', () => {
    expect(CORE_TERM_IDS.size).toBeGreaterThanOrEqual(52);
    for (const entry of GLOSSARY_ENTRIES) {
      if (entry.safety !== 'آمن') expect(CORE_TERM_IDS.has(entry.id), `${entry.id} حساس أو خطر خارج الأساسية`).toBe(true);
    }
    for (const id of CORE_TERM_IDS) {
      const entry = entryById(id);
      expect(entry, id).toBeDefined();
      show(entry);
      const example = container.querySelector('[data-section="example"]');
      expect(example, `${id} بلا مثال`).not.toBeNull();
      expect(clean(example?.querySelector('p')).length, id).toBeGreaterThan(9);
    }
  });

  it('مدخل بلا مثال (غير أساسي) لا يعرض قسم مثال فارغًا', () => {
    const entry = GLOSSARY_ENTRIES.find((e) => !CORE_TERM_IDS.has(e.id) && !e.example) as GlossaryEntry;
    expect(entry).toBeDefined();
    show(entry);
    expect(container.querySelector('[data-section="example"]')).toBeNull();
  });
});

describe('المصطلح الإنجليزي بجوار العربي (AC-B3)', () => {
  it('العنوان «العربي (English)» والإنجليزي dir=ltr lang=en، وهو ظاهر في كل مستوى', () => {
    const entry = entryById('fork');
    show(entry);
    for (const level of LEVELS) {
      act(() => void tab(level).click());
      const title = container.querySelector('h2') as HTMLElement;
      expect(clean(title)).toBe(`${entry.ar} (${entry.en})`);
      const en = title.querySelector('bdi.term-en') as HTMLElement;
      expect(en.getAttribute('dir')).toBe('ltr');
      expect(en.getAttribute('lang')).toBe('en');
      expect(en.textContent).toBe(entry.en);
    }
  });

  it('كل مصطلح إنجليزي بين قوسين داخل نص الشرح معزول dir=ltr في المستويات الثلاثة', () => {
    const entry = entryById('repository');
    show(entry);
    for (const level of LEVELS) {
      act(() => void tab(level).click());
      const text = container.querySelector('[data-level-text]') as HTMLElement;
      for (const match of entry[level].matchAll(/\(([A-Za-z][^()؀-ۿ]*)\)/g)) {
        const isolated = [...text.querySelectorAll('bdi[dir="ltr"]')].some((b) => b.textContent === match[0]);
        expect(isolated, `${level}: ${match[0]}`).toBe(true);
      }
    }
  });

  it('على المداخل كلها: الاسم الإنجليزي ظاهر في عنوان البطاقة معزولًا، ولا عنصر تحكم لإخفائه', () => {
    for (const entry of GLOSSARY_ENTRIES) {
      show(entry);
      const title = container.querySelector('h2') as HTMLElement;
      expect(title.querySelector('bdi[dir="ltr"]')?.textContent, entry.id).toBe(entry.en);
      expect(clean(title), entry.id).toBe(`${entry.ar} (${entry.en})`);
      const controls = [...container.querySelectorAll('button, input, select, [role="switch"], [role="checkbox"]')].map((c) => `${clean(c)} ${c.getAttribute('aria-label') ?? ''}`);
      expect(controls.some((text) => /إخفاء|hide|اخفاء|toggle english/i.test(text)), entry.id).toBe(false);
    }
  });
});

describe('بطاقة بيانات القرار (AC-B4)', () => {
  it('الحقول الخمسة بترتيبها: متى تُستخدم، الأثر، الحساسية، الصلاحية، التراجع وحدوده', () => {
    const entry = entryById('delete_repo');
    show(entry);
    const rows = [...container.querySelectorAll('[data-section="decision"] > div')];
    expect(rows.map((r) => r.getAttribute('data-field'))).toEqual(['whenToUse', 'impact', 'safety', 'permission', 'reversal']);
    expect(rows.map((r) => clean(r.querySelector('dt')))).toEqual(['متى تُستخدم', 'الأثر', 'الحساسية', 'الصلاحية', 'إمكانية التراجع وحدوده']);
    const value = (field: string) => clean(container.querySelector(`[data-field="${field}"] .value`));
    expect(value('whenToUse')).toBe(entry.whenToUse);
    expect(value('impact')).toBe(entry.brief);
    expect(value('safety')).toBe('خطر');
    expect(value('permission')).toBe(PERMISSION_LABELS.Admin);
    expect(value('reversal')).toBe(`جزئيًا — ${entry.reversalLimits}`);
    expect(clean(container.querySelector('[data-field="permission"] .detail'))).toBe(entry.permissionNote);
  });

  it('على كل مدخل: خمسة حقول بقيمة نصية غير فارغة، والحساسية والصلاحية والتراجع من المجموعات المضبوطة', () => {
    for (const entry of GLOSSARY_ENTRIES) {
      const fields = decisionFields(entry);
      expect(fields.map((f) => f.id), entry.id).toEqual(['whenToUse', 'impact', 'safety', 'permission', 'reversal']);
      for (const field of fields) {
        expect(field.value.trim().length, `${entry.id}.${field.id}`).toBeGreaterThan(0);
        expect(field.specified, `${entry.id}.${field.id}`).toBe(true);
      }
      expect(SAFETY_LEVELS).toContain(fields[2]?.value);
      expect(Object.values(PERMISSION_LABELS)).toContain(fields[3]?.value);
      expect(REVERSIBILITY.some((r) => fields[4]?.value.startsWith(`${r} — `)), entry.id).toBe(true);
      expect(PERMISSION_LEVELS).toContain(entry.permission);
    }
  });

  it('قيمة ناقصة أو خارج المجموعة المعتمدة تُكتب «غير محدد في المصدر» لا تخمينًا ولا حقلًا فارغًا', () => {
    const bad = testEntry('bad', 'Bad', ['button'], ['any'], {
      safety: 'مجهول' as never,
      permission: 'SuperAdmin' as never,
      reversible: 'ربما' as never,
      reversalLimits: '   ',
      whenToUse: '',
      brief: '' as never,
    });
    const fields = Object.fromEntries(decisionFields(bad).map((f) => [f.id, f]));
    expect(NOT_SPECIFIED).toBe('غير محدد في المصدر');
    for (const id of ['whenToUse', 'impact', 'safety', 'permission', 'reversal']) {
      expect(fields[id]?.value, id).toBe(NOT_SPECIFIED);
      expect(fields[id]?.specified, id).toBe(false);
    }
    show(bad);
    const rows = [...container.querySelectorAll('[data-section="decision"] > div')];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(clean(row.querySelector('.value'))).toBe(NOT_SPECIFIED);
      expect(row.getAttribute('data-specified')).toBe('false');
    }
  });

  it('جزء من التراجع معروف والباقي لا: كل جزء يظهر بقيمته أو «غير محدد في المصدر»', () => {
    const onlyLimits = decisionFields(testEntry('a', 'A', ['button'], ['any'], { reversible: 'ربما' as never }));
    expect(onlyLimits[4]?.value).toBe(`${NOT_SPECIFIED} — حدود التراجع للمدخل a في مثال اختباري.`);
    const onlyFlag = decisionFields(testEntry('b', 'B', ['button'], ['any'], { reversalLimits: '' }));
    expect(onlyFlag[4]?.value).toBe(`نعم — ${NOT_SPECIFIED}`);
  });

  it('ما لم يُطابَق على الوثائق يحمل تنبيهًا، والمطابَق لا يحمله', () => {
    const verified = GLOSSARY_ENTRIES.find((e) => e.verification.status === 'verified') as GlossaryEntry;
    const unverified = GLOSSARY_ENTRIES.find((e) => e.verification.status === 'unverified') as GlossaryEntry;
    expect(isUnverified(verified)).toBe(false);
    show(verified);
    expect(container.querySelector('[data-notice="unverified"]')).toBeNull();
    expect(isUnverified(unverified)).toBe(true);
    show(unverified);
    expect(clean(container.querySelector('[data-notice="unverified"]'))).toContain('لم تُطابَق');
  });

  it('رابط الوثيقة من docs.github.com وحده ويفتح بـnoopener', () => {
    show(entryById('repository'));
    const link = container.querySelector('a[data-action="docs"]') as HTMLAnchorElement;
    expect(link.href.startsWith('https://docs.github.com/en/')).toBe(true);
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
    const foreign = testEntry('x', 'X', ['button'], ['any'], { docsUrl: 'https://evil.example/doc' });
    expect(docsLink(foreign)).toBeNull();
    show(foreign);
    expect(container.querySelector('a[data-action="docs"]')).toBeNull();
    for (const e of GLOSSARY_ENTRIES) if (e.docsUrl) expect(docsLink(e), e.id).not.toBeNull();
  });
});

describe('أمان العرض', () => {
  it('نص القاموس يُرسم نصًا لا HTML: وسم داخل مدخل لا ينتج عنصرًا', () => {
    const hostile = testEntry('hostile', 'Hostile', ['button'], ['any'], { medium: 'نص <img src=x onerror=alert(1)> وبقية الجملة الطويلة بما يكفي (Entry hostile) للحد الأدنى للطول.' });
    show(hostile);
    expect(container.querySelector('.card img')).toBeNull();
    expect(clean(container.querySelector('[data-level-text]'))).toContain('<img src=x onerror=alert(1)>');
  });
});
