// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-NOTE-02 (e2e على DOM): زر «أكمل لاحقًا» في الصفحة يحفظ الحقول المعرّفة كلها، ويُحرَّر وسم الحالة والوسوم والملاحظة؛ ومركز
// «ملاحظاتي وأكمل لاحقًا» في اللوحة يبحث ويصفّي ويفرز؛ ولا طلب شبكي في أي من ذلك؛ والإيقاف يعيد الصفحة كما كانت.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_TAG, LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { MemoryStorageArea, Store } from '../../../../src/core';
import { BOOKMARKS_PAGE_BUTTON_KEY, CENTER_PAGE_SIZE, LATER_PANEL_VIEWS, LATER_SETTINGS_SECTION, bookmarkRecordName, buildIndex, connectLater, createBookmarksModule, createLaterView, queryCenter } from '../../../../src/modules/g/bookmarks';
import { noteRecordName } from '../../../../src/modules/g/notes';
import { SETTINGS_SECTIONS } from '../../../../src/options/sections';
import { pageInfoFromUrl } from '../../../../src/shared/page';
import type { PageSource } from '../../../../src/shared/page';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { flush, memoryLater, notesSet } from './helpers';
import type { MemoryLater } from './helpers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

function load(file: string, url: string): void {
  const html = fs.readFileSync(file.startsWith('pages/') ? path.join(ROOT, 'fixtures', file) : path.join(HERE, '../notes/fixtures', file), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', url);
}

let later: MemoryLater;
let manager: LifecycleManager | null = null;
const fetchSpy = vi.fn(async () => new Response(''));
const settle = async (ms = 8) => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
};
const input = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const choose = async (el: HTMLSelectElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(async () => {
  later = await memoryLater();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  act(() => manager?.stop());
  manager = null;
  vi.unstubAllGlobals();
  connectLater(null);
});

async function start(): Promise<void> {
  const module = createBookmarksModule({ context: async () => later });
  manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: () => true });
  await act(async () => {
    manager?.start();
    await flush(10);
  });
  await settle();
}

const host = (): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>(HOST_TAG)].find((h) => h.getAttribute('data-mijhar-host') === 'g-bookmarks');
  if (!found) throw new Error('لا شريط');
  return found;
};
const inBar = <E extends Element = HTMLElement>(selector: string): E => {
  const el = host().shadowRoot?.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};

describe('زر «أكمل لاحقًا» في الصفحة (AC-G2)', () => {
  it('نقرة واحدة تحفظ الرابط والعنوان وowner/repo والفرع والسطر والتاريخ والحالة الافتراضية', async () => {
    load('fixture-code-view-drift.html', 'https://github.com/octo/demo/blob/main/lib/response.js#L10-L12');
    await start();
    expect(document.querySelector('#repo-content-pjax-container')?.firstElementChild).toBe(host());
    await click(inBar('[data-action="quick-save"]'));
    const [saved] = later.bookmarks.list();
    expect(saved).toMatchObject({
      url: 'https://github.com/octo/demo/blob/main/lib/response.js#L10-L12',
      title: 'response.js at main · octo/demo',
      owner: 'octo',
      repo: 'demo',
      branch: 'main',
      refKind: 'ref',
      level: 'line',
      position: { kind: 'lines', start: 10, end: 12 },
      status: 'reading',
      tags: [],
      note: '',
    });
    expect(saved?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(inBar('[data-saved]').textContent).toContain('قيد القراءة');
    // المحرر مفتوح بعد الحفظ: وسم الحالة والوسوم والملاحظة السريعة.
    await click(inBar('[data-status="review"]'));
    await input(inBar<HTMLInputElement>('#mj-later-page-tags'), 'مراجعة، أداء');
    await input(inBar<HTMLTextAreaElement>('#mj-later-page-note'), 'أكمل من دالة json');
    await click(inBar('[data-action="save-bookmark"]'));
    await settle();
    expect(later.bookmarks.list()[0]).toMatchObject({ status: 'review', tags: ['مراجعة', 'أداء'], note: 'أكمل من دالة json' });
    expect(inBar('[data-saved]').textContent).toContain('للمراجعة');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('موضع التمرير يُحفظ حين لا سطر محدد، و«انتقل إلى موضعي» يعيده', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo');
    await start();
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    await click(inBar('[data-action="quick-save"]'));
    expect(later.bookmarks.list()[0]).toMatchObject({ level: 'repo', position: { kind: 'scroll', y: 900 } });
    await click(inBar('[data-action="cancel-bookmark"]'));
    await click(inBar('[data-action="jump"]'));
    expect(scrollTo).toHaveBeenCalledWith({ top: expect.any(Number), behavior: 'auto' });
  });

  it('«حدّث الموضع» يحدّث السطر المحفوظ، و«أزل» يطلب تأكيدًا', async () => {
    load('fixture-code-view-drift.html', 'https://github.com/octo/demo/blob/main/lib/response.js#L5');
    await start();
    await click(inBar('[data-action="quick-save"]'));
    await click(inBar('[data-action="cancel-bookmark"]'));
    await act(async () => {
      window.history.replaceState({}, '', 'https://github.com/octo/demo/blob/main/lib/response.js#L16-L20');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await flush(80);
    });
    await settle();
    await click(inBar('[data-action="refresh-position"]'));
    expect(later.bookmarks.list()[0]?.position).toEqual({ kind: 'lines', start: 16, end: 20 });
    await click(inBar('[data-action="remove-bookmark"]'));
    expect(later.bookmarks.size).toBe(1);
    await click(inBar('[data-action="confirm-remove"]'));
    expect(later.bookmarks.size).toBe(0);
    expect(inBar('[data-action="quick-save"]')).toBeTruthy();
  });

  it('مفتاح الإعداد يخفي الزر، والإيقاف يعيد الصفحة كما كانت حرفيًا', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo');
    const before = document.documentElement.outerHTML;
    await start();
    expect(host().shadowRoot?.querySelector('[data-action="quick-save"]')).not.toBeNull();
    await act(async () => {
      await later.settings.set(BOOKMARKS_PAGE_BUTTON_KEY, false);
      await flush(4);
    });
    expect(host().shadowRoot?.querySelector('[data-action="quick-save"]')).toBeNull();
    act(() => manager?.stop());
    manager = null;
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('مركز «ملاحظاتي وأكمل لاحقًا» في اللوحة', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.className = 'mj-root';
    document.body.append(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });
  const $ = <E extends Element = HTMLElement>(selector: string): E => {
    const el = container.querySelector<E>(selector);
    if (!el) throw new Error(`لا عنصر: ${selector}`);
    return el;
  };
  const source = (href: string): PageSource => ({ read: async () => pageInfoFromUrl(href, 'عنوان التبويب'), subscribe: () => () => {} });

  async function mount(href: string) {
    connectLater(async () => later);
    const View = createLaterView({ source: () => source(href), now: () => new Date('2026-10-23T12:00:00Z') });
    await act(async () => {
      render(<View settings={later.settings} surface="native" />, container);
      await flush(8);
    });
    await settle();
  }

  it('يحفظ التبويب النشط، ويبحث في الملاحظات والروابط معًا ويصفّي ويفرز', async () => {
    await later.notes.create({ target: { level: 'repo', owner: 'octo', repo: 'demo' }, text: 'راجع ذاكرة التخزين المؤقت', url: 'https://github.com/octo/demo' });
    await later.bookmarks.create({ url: 'https://github.com/pallets/flask/pull/9', title: 'إصلاح المهلة', owner: 'pallets', repo: 'flask', branch: 'fix/timeout', refKind: 'ref', level: 'thread', position: null, status: 'awaiting', tags: ['أداء'] });
    await mount('https://github.com/octo/demo/issues/3');
    await click($('[data-action="quick-save"]'));
    expect(later.bookmarks.findByPage('https://github.com/octo/demo/issues/3')).toMatchObject({ title: 'عنوان التبويب', level: 'thread', branch: null });
    await click($('[data-action="cancel-bookmark"]'));
    expect($('[data-result-count]').getAttribute('data-result-count')).toBe('3');

    await input($<HTMLInputElement>('#mj-later-search'), 'التخزين');
    expect([...container.querySelectorAll('[data-entry-kind]')].map((e) => e.getAttribute('data-entry-kind'))).toEqual(['note']);
    await input($<HTMLInputElement>('#mj-later-search'), '');
    await choose($<HTMLSelectElement>('#mj-later-status'), 'awaiting');
    expect(container.querySelectorAll('[data-entry-kind="bookmark"]')).toHaveLength(1);
    expect($('[data-entry-kind="bookmark"]').textContent).toContain('إصلاح المهلة');
    await choose($<HTMLSelectElement>('#mj-later-status'), 'all');
    await choose($<HTMLSelectElement>('#mj-later-repo'), 'pallets/flask');
    expect($('[data-result-count]').getAttribute('data-result-count')).toBe('1');
    await choose($<HTMLSelectElement>('#mj-later-repo'), '');
    await choose($<HTMLSelectElement>('#mj-later-tag'), 'أداء');
    expect($('[data-result-count]').getAttribute('data-result-count')).toBe('1');
    await choose($<HTMLSelectElement>('#mj-later-tag'), '');
    await choose($<HTMLSelectElement>('#mj-later-level'), 'repo');
    expect($('[data-result-count]').getAttribute('data-result-count')).toBe('1');
    await choose($<HTMLSelectElement>('#mj-later-level'), 'all');
    await choose($<HTMLSelectElement>('#mj-later-sort'), 'oldest');
    expect(container.querySelector('[data-entry-kind]')?.getAttribute('data-entry-kind')).toBe('note');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('تحرير رابط وإزالته من المركز', async () => {
    const saved = await later.bookmarks.create({ url: 'https://github.com/octo/demo', title: 'demo', owner: 'octo', repo: 'demo', branch: null, refKind: 'unknown', level: 'repo', position: null });
    await mount('about:blank');
    expect(container.querySelector('[data-action="quick-save"]')).toBeNull();
    await click($('[data-entry-kind="bookmark"] [data-action="edit-bookmark"]'));
    await click($('[data-entry-kind="bookmark"] [data-status="done"]'));
    await click($('[data-entry-kind="bookmark"] [data-action="save-bookmark"]'));
    expect(later.bookmarks.get(saved.id)?.status).toBe('done');
    await click($('[data-entry-kind="bookmark"] [data-action="remove-bookmark"]'));
    await click($('[data-entry-kind="bookmark"] [data-action="confirm-remove"]'));
    await settle();
    expect(later.bookmarks.size).toBe(0);
    expect($('[data-result-count]').textContent).toContain('لا ملاحظات ولا روابط');
  });

  it('PB-04 حتى ظهور النتائج: 500 عنصر، والنتائج تُرسم دفعات من 50 مع «اعرض المزيد»', async () => {
    const area = new MemoryStorageArea();
    const seed = await Store.open({ area, changes: area, locks: null });
    const set = notesSet();
    for (const note of set.notes) await seed.write(noteRecordName(note.id), note);
    for (const bookmark of set.bookmarks) await seed.write(bookmarkRecordName(bookmark.id), bookmark);
    later = await memoryLater(area);
    await mount('about:blank');
    expect($('[data-result-count]').getAttribute('data-result-count')).toBe('500');
    expect(container.querySelectorAll('[data-entry-kind]')).toHaveLength(CENTER_PAGE_SIZE);
    await click($('[data-action="show-more"]'));
    expect(container.querySelectorAll('[data-entry-kind]')).toHaveLength(CENTER_PAGE_SIZE * 2);

    const index = buildIndex(set.notes, set.bookmarks);
    const search = $<HTMLInputElement>('#mj-later-search');
    const timings: Array<{ text: string; results: number; medianMs: number; p90Ms: number }> = [];
    for (const text of ['ا', 'cache', 'الاداء مراجعة', 'refactor router', 'test']) {
      const runs: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        act(() => {
          search.value = '';
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const t0 = performance.now();
        act(() => {
          search.value = text;
          search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        runs.push(performance.now() - t0);
      }
      const expected = queryCenter(index, { text }).length;
      expect($('[data-result-count]').getAttribute('data-result-count')).toBe(String(expected));
      expect(container.querySelectorAll('[data-entry-kind]').length).toBe(Math.min(expected, CENTER_PAGE_SIZE));
      runs.sort((a, b) => a - b);
      timings.push({ text, results: expected, medianMs: Number(runs[6]!.toFixed(2)), p90Ms: Number(runs[10]!.toFixed(2)) });
    }
    if (process.env.MIJHAR_EVIDENCE === '1') {
      const out = path.join(ROOT, 'evidence/T-8.2/pb04-render-jsdom.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ budget: 'PB-04 < 15ms (إدخال ← ظهور النتائج)', env: 'jsdom (أبطأ من المتصفح)، الدفعة الأولى 50', items: 500, timings }, null, 2) + '\n');
    }
    for (const t of timings) expect(t.medianMs).toBeLessThan(15);
  });

  it('مسجَّل في تبويب «ملاحظاتي»: اللوحة الأصلية وحدها، وفي الدرج رسالة بديلة؛ وقسم الإعدادات يبيّن ما يُحفظ من السطر', () => {
    expect(PANEL_VIEWS).toEqual(expect.arrayContaining([...LATER_PANEL_VIEWS]));
    expect(LATER_PANEL_VIEWS.map((v) => [v.id, v.tab, v.surfaces])).toEqual([
      ['g-later', 'notes', ['native']],
      ['g-later-drawer', 'notes', ['drawer']],
    ]);
    expect(SETTINGS_SECTIONS).toContain(LATER_SETTINGS_SECTION);
  });
});
