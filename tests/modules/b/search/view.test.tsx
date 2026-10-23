// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// واجهة البحث في القاموس (AC-B6): بحث فوري بالعربية والإنجليزية والمرادفات، وتصفية بالتصنيف بأعداد معلنة، وقراءة الشرح في موضعه، ورابط
// docs.github.com، وزر «أبرز الموضع» بحالاته، وتركيز الخانة عند أمر فتح القاموس. الجسر وهمي هنا؛ الجسر الحقيقي (رسائل اللوحة والدرج) في highlight.test.tsx وe2e.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, PANEL_REQUEST_KEY, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import type { LocateBridge, LocateResult } from '../../../../src/modules/b/search';
import { CATEGORY_IDS, CATEGORY_LABELS, GlossarySearchView, PAGE_SIZE, buildSearchIndex, countLabel, search } from '../../../../src/modules/b/search';
import { GLOSSARY_ENTRIES } from '../../../../src/modules/b/card';
import { flush } from '../card/helpers';

const open = async (): Promise<SettingsStore> => {
  const area = new MemoryStorageArea();
  return SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry());
};

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  act(() => void render(null, container));
  container.remove();
});

const bridgeOf = (result: LocateResult | ((id: string) => LocateResult)): LocateBridge & { locate: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> } => ({
  locate: vi.fn(async (id: string) => (typeof result === 'function' ? result(id) : result)),
  clear: vi.fn(async () => {}),
});

async function mountView(bridge: LocateBridge = bridgeOf({ status: 'unavailable' })): Promise<SettingsStore> {
  const settings = await open();
  await act(async () => {
    render(<GlossarySearchView settings={settings} surface="native" bridge={bridge} />, container);
    await flush();
  });
  return settings;
}

const input = (): HTMLInputElement => container.querySelector<HTMLInputElement>('input[type="search"]')!;
const items = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.result')];
const titles = (): string[] => items().map((el) => el.dataset.entry as string);
const chip = (id: string): HTMLButtonElement => container.querySelector<HTMLButtonElement>(`.chip-btn[data-category="${id}"]`)!;
const status = (): string => container.querySelector('.count')!.textContent!.replace(/\s+/g, ' ').trim();
async function type(text: string): Promise<void> {
  await act(async () => {
    const field = input();
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  });
}
const click = async (el: Element | null): Promise<void> => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush();
  });
};

describe('البنية والوصول', () => {
  it('عنوان وخانة بحث بتسمية وصول وتصفية بالتصنيف في مجموعة مسمّاة وحالة تُعلَن', async () => {
    await mountView();
    expect(container.querySelector('h3')?.textContent).toBe('البحث في القاموس');
    const field = input();
    expect(field.getAttribute('dir')).toBe('auto');
    expect(field.id).toBe('mj-gs-input');
    expect(container.querySelector(`label[for="${field.id}"]`)?.textContent).toBe('ابحث في القاموس');
    expect(container.querySelector('[role="search"]')).not.toBeNull();
    expect(container.querySelector('[role="group"][aria-label="تصفية بالتصنيف"]')).not.toBeNull();
    expect(container.querySelector('.count')?.getAttribute('role')).toBe('status');
    expect(container.querySelector('.count')?.getAttribute('aria-live')).toBe('polite');
    expect(container.textContent).toContain('Alt+K');
  });

  it('الأزرار: «الكل» وسبعة تصنيفات بأسمائها وأعدادها، ومضغوط واحد فقط', async () => {
    await mountView();
    const chips = [...container.querySelectorAll<HTMLButtonElement>('.chip-btn')];
    expect(chips.map((c) => c.dataset.category)).toEqual(['all', ...CATEGORY_IDS]);
    expect(chip('all').getAttribute('aria-pressed')).toBe('true');
    expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    for (const id of CATEGORY_IDS) {
      const expected = GLOSSARY_ENTRIES.filter((e) => e.category === id).length;
      expect(chip(id).textContent).toContain(CATEGORY_LABELS[id]);
      expect(chip(id).textContent).toContain(`(${expected})`);
    }
  });
});

describe('البحث الفوري', () => {
  it('بلا استعلام: كل المداخل وأول صفحة عشرون و«عرض المزيد»', async () => {
    await mountView();
    expect(status()).toBe(`${GLOSSARY_ENTRIES.length} نتيجة`);
    expect(items()).toHaveLength(PAGE_SIZE);
    const more = container.querySelector<HTMLButtonElement>('[data-action="more"]')!;
    expect(more.textContent).toContain(`(${GLOSSARY_ENTRIES.length - PAGE_SIZE})`);
    await click(more);
    expect(items()).toHaveLength(2 * PAGE_SIZE);
  });

  it('عربي: مستودع ← المستودع أولًا، والحالة تذكر الاستعلام والعدد', async () => {
    await mountView();
    await type('مستودع');
    expect(titles()[0]).toBe('repository');
    expect(status()).toContain('لـ«مستودع»');
    expect(status()).toMatch(/^\d+ نتيجة|نتائج/);
    // data-count العدد الكلي للمطابقات لا ما عُرض في الصفحة الأولى.
    expect(Number(container.querySelector('.count')?.getAttribute('data-count'))).toBe(search(buildSearchIndex(GLOSSARY_ENTRIES), 'مستودع').length);
    expect(items().length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it('إنجليزي بلا حساسية للحالة', async () => {
    await mountView();
    await type('PULL REQUEST');
    expect(titles()[0]).toBe('pull_request');
    expect(items()[0]!.querySelector('bdi[dir="ltr"]')?.textContent).toBe('Pull Request');
  });

  it('مرادف: «كوميت» يصل إلى Commit ويُعلَن أنه مطابقة بمرادف', async () => {
    await mountView();
    await type('كوميت');
    expect(titles()[0]).toBe('commit');
    expect(items()[0]!.dataset.via).toBe('synonym');
    expect(items()[0]!.textContent).toContain('مطابقة بمرادف');
  });

  it('لا نتائج: رسالة بدل قائمة فارغة، ويعلن الحالة «لا نتائج»', async () => {
    await mountView();
    await type('zzqqxx');
    expect(items()).toHaveLength(0);
    expect(container.querySelector('[data-empty-results]')?.textContent).toContain('لا مطابقات');
    expect(status()).toContain('لا نتائج');
    expect(container.querySelector('.results')).toBeNull();
  });

  it('كل نتيجة تعرض المصطلح بصيغة «العربي (English)» والإنجليزي dir=ltr والحساسية والتصنيف والملخص', async () => {
    await mountView();
    await type('commit');
    const first = items()[0]!;
    expect(first.querySelector('.result-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('الالتزام البرمجي (Commit)');
    expect(first.querySelector('bdi.term-en')?.getAttribute('dir')).toBe('ltr');
    expect(first.querySelector('.tag[data-safety]')?.textContent).toBe('آمن');
    expect(first.querySelector('.tag[data-category]')?.textContent).toBe(CATEGORY_LABELS.git);
    expect(first.querySelector('.result-brief')?.textContent?.length).toBeGreaterThan(10);
  });

  it('زر المسح يظهر مع الاستعلام فقط، ويمسح ويعيد التركيز إلى الخانة', async () => {
    await mountView();
    expect(container.querySelector('[data-action="clear"]')).toBeNull();
    await type('فرع');
    const clear = container.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
    expect(clear.getAttribute('aria-label')).toBe('مسح البحث');
    await click(clear);
    expect(input().value).toBe('');
    expect(items()).toHaveLength(PAGE_SIZE);
    expect(container.querySelector('[data-action="clear"]')).toBeNull();
  });
});

describe('التصفية بالتصنيف', () => {
  it('تضيّق القائمة وتُحدّث العدد والزر المضغوط، وتجتمع مع الاستعلام', async () => {
    await mountView();
    await click(chip('security'));
    expect(chip('security').getAttribute('aria-pressed')).toBe('true');
    expect(chip('all').getAttribute('aria-pressed')).toBe('false');
    expect(items().every((el) => el.querySelector('.tag[data-category]')?.getAttribute('data-category') === 'security')).toBe(true);
    expect(status()).toContain(CATEGORY_LABELS.security);
    await type('commit');
    // «commit» في تصنيف الأمان: مدخلات مثل verified_commit فقط، لا commit نفسه.
    expect(titles()).not.toContain('commit');
    expect(titles().every((id) => GLOSSARY_ENTRIES.find((e) => e.id === id)?.category === 'security')).toBe(true);
    await click(chip('git'));
    expect(titles()[0]).toBe('commit');
  });

  it('أعداد الأزرار تتبع الاستعلام (بلا تصفية بالتصنيف)', async () => {
    await mountView();
    await type('merge');
    const total = Number(/\((\d+)\)/.exec(chip('all').textContent!)?.[1]);
    const sum = CATEGORY_IDS.reduce((n, id) => n + Number(/\((\d+)\)/.exec(chip(id).textContent!)?.[1]), 0);
    expect(total).toBeGreaterThan(0);
    expect(sum).toBe(total);
  });

  it('تغيير التصنيف يعيد الصفحة الأولى ويغلق الشرح المفتوح', async () => {
    await mountView();
    await click(container.querySelector('.result [data-action="read"]'));
    expect(container.querySelector('.card')).not.toBeNull();
    await click(chip('repo'));
    expect(container.querySelector('.card')).toBeNull();
  });
});

describe('قراءة الشرح في موضعه', () => {
  it('«اقرأ الشرح» يعرض بطاقة الشرح نفسها بحقولها الخمسة، ويبدّل aria-expanded، وواحد مفتوح فقط', async () => {
    await mountView();
    await type('commit');
    const [first, second] = items() as [HTMLElement, HTMLElement];
    const read = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-action="read"]')!;
    expect(read(first).getAttribute('aria-expanded')).toBe('false');
    await click(read(first));
    expect(read(first).getAttribute('aria-expanded')).toBe('true');
    const card = first.querySelector('.card')!;
    expect(card.querySelectorAll('[data-section="decision"] > div')).toHaveLength(5);
    expect(card.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim()).toContain('(Commit)');
    await click(read(second));
    expect(container.querySelectorAll('.card')).toHaveLength(1);
    expect(second.querySelector('.card')).not.toBeNull();
    expect(first.querySelector('.card')).toBeNull();
    await click(read(second));
    expect(container.querySelector('.card')).toBeNull();
  });
});

describe('روابط الوثائق الرسمية', () => {
  it('كل نتيجة لها رابط docs.github.com يفتح بأمان في تبويب جديد (حيث يثبت المصدر)', async () => {
    await mountView();
    for (const item of items()) {
      const link = item.querySelector<HTMLAnchorElement>('a[data-action="docs"]');
      expect(link, item.dataset.entry).not.toBeNull();
      expect(new URL(link!.href).hostname).toBe('docs.github.com');
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link!.querySelector('bdi')?.getAttribute('dir')).toBe('ltr');
    }
  });
});

describe('أبرز الموضع', () => {
  const locateButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-action="locate"]')!;

  it('found: يُنادى الجسر بمعرّف المدخل وتظهر رسالة النجاح وزر إزالة الإبراز', async () => {
    const bridge = bridgeOf({ status: 'found', count: 2 });
    await mountView(bridge);
    await type('star');
    const first = items()[0]!;
    await click(locateButton(first));
    expect(bridge.locate).toHaveBeenCalledWith('star');
    const note = first.querySelector('.locate-note')!;
    expect(note.getAttribute('data-status')).toBe('found');
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent).toContain('أُبرز الموضع');
    expect(note.textContent).toContain('2 عناصر');
    await click(first.querySelector('[data-action="clear-locate"]'));
    expect(bridge.clear).toHaveBeenCalledTimes(1);
    expect(first.querySelector('.locate-note')).toBeNull();
  });

  it('elsewhere: مسارات التبويب التي يوجد فيها، وتمييز «غاب هنا» من «ليس هنا»', async () => {
    const bridge = bridgeOf((id) => ({ status: 'elsewhere', paths: ['تبويب Settings في المستودع (إعدادات المستودع)', 'تبويب Actions في المستودع'], here: id === 'star' }));
    await mountView(bridge);
    await type('settings');
    const settingsItem = items()[0]!;
    await click(locateButton(settingsItem));
    const note = settingsItem.querySelector('.locate-note')!;
    expect(note.getAttribute('data-status')).toBe('elsewhere');
    expect(note.textContent).toContain('ليس في هذه الصفحة');
    expect([...note.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['تبويب Settings في المستودع (إعدادات المستودع)', 'تبويب Actions في المستودع']);
    await type('star');
    await click(locateButton(items()[0]!));
    expect(items()[0]!.querySelector('.locate-note')?.textContent).toContain('قد يكون غير ظاهر لك');
  });

  it('unavailable (خارج GitHub): يطلب فتح صفحة GitHub ويذكر مسارات وجود العنصر ثابتًا', async () => {
    await mountView(bridgeOf({ status: 'unavailable' }));
    await type('Add new SSH key');
    const first = items()[0]!;
    expect(first.dataset.entry).toBe('settings-ssh-add');
    await click(locateButton(first));
    const note = first.querySelector('.locate-note')!;
    expect(note.getAttribute('data-status')).toBe('unavailable');
    expect(note.textContent).toContain('github.com');
    expect(note.textContent).toContain('إعدادات الحساب');
  });

  it('concept: مصطلح عام لا يقابله عنصر', async () => {
    await mountView(bridgeOf({ status: 'concept' }));
    await type('repository');
    const first = items()[0]!;
    await click(locateButton(first));
    expect(first.querySelector('.locate-note')?.getAttribute('data-status')).toBe('concept');
  });

  it('رفض الجسر يُعامل unavailable ولا يكسر الواجهة', async () => {
    const bridge = bridgeOf({ status: 'found', count: 1 });
    bridge.locate.mockRejectedValueOnce(new Error('boom'));
    await mountView(bridge);
    await type('star');
    await click(locateButton(items()[0]!));
    expect(items()[0]!.querySelector('.locate-note')?.getAttribute('data-status')).toBe('unavailable');
  });

  it('الزر معطّل أثناء الانتظار (لا طلبان متداخلان لمدخل واحد)', async () => {
    let release: (value: LocateResult) => void = () => {};
    const bridge = bridgeOf({ status: 'found', count: 1 });
    bridge.locate.mockImplementationOnce(() => new Promise<LocateResult>((resolve) => (release = resolve)));
    await mountView(bridge);
    await type('star');
    const first = items()[0]!;
    await click(locateButton(first));
    expect(locateButton(first).disabled).toBe(true);
    expect(first.querySelector('.locate-note')?.getAttribute('data-status')).toBe('working');
    await act(async () => {
      release({ status: 'found', count: 1 });
      await flush();
    });
    expect(locateButton(items()[0]!).disabled).toBe(false);
  });
});

describe('أمر فتح القاموس: التركيز في خانة البحث', () => {
  it('طلب حديث للتبويب glossary يركّز الخانة مرة واحدة لكل طلب', async () => {
    const settings = await open();
    await settings.set(PANEL_REQUEST_KEY, { tab: 'glossary', at: Date.now() });
    await act(async () => {
      render(<GlossarySearchView settings={settings} surface="native" bridge={bridgeOf({ status: 'unavailable' })} />, container);
      await flush();
    });
    expect(document.activeElement).toBe(input());
    // إعادة التركيب بالطلب نفسه (تبديل تبويب ثم عودة) لا تسرق التركيز ثانيةً.
    await act(async () => void render(null, container));
    await act(async () => {
      render(<GlossarySearchView settings={settings} surface="native" bridge={bridgeOf({ status: 'unavailable' })} />, container);
      await flush();
    });
    expect(document.activeElement).not.toBe(input());
    // طلب جديد يركّز من جديد.
    await act(async () => {
      await settings.set(PANEL_REQUEST_KEY, { tab: 'glossary', at: Date.now() + 1 });
      await flush();
    });
    expect(document.activeElement).toBe(input());
  });

  it('طلب قديم أو لتبويب آخر لا يركّز', async () => {
    const settings = await open();
    await settings.set(PANEL_REQUEST_KEY, { tab: 'glossary', at: Date.now() - 60_000 });
    await act(async () => {
      render(<GlossarySearchView settings={settings} surface="native" bridge={bridgeOf({ status: 'unavailable' })} />, container);
      await flush();
    });
    expect(document.activeElement).not.toBe(input());
    await act(async () => {
      await settings.set(PANEL_REQUEST_KEY, { tab: 'notes', at: Date.now() });
      await flush();
    });
    expect(document.activeElement).not.toBe(input());
  });
});

describe('countLabel', () => {
  it('صيغ العدد بالعربية', () => {
    expect([0, 1, 2, 3, 10, 11, 112].map(countLabel)).toEqual(['لا نتائج', 'نتيجة واحدة', 'نتيجتان', '3 نتائج', '10 نتائج', '11 نتيجة', '112 نتيجة']);
  });
});
