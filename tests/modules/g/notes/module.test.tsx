// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// الوحدة (ز) في الصفحة عبر دورة الحياة: البطاقة المطوية في أول حاوية المحتوى، وعلامات الأسطر، والإيقاف النظيف، وتتبع الهاش والتنقل.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOST_TAG, LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { AnchorStore } from '../../../../src/modules/g/anchor';
import { NOTES_LINE_MARKERS_KEY, NOTES_PAGE_CARD_KEY, createModuleG } from '../../../../src/modules/g/notes';
import { SHA, TARGETS, draft, flush, memoryNotes } from './helpers';
import type { MemoryNotes } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));

function load(file: string, url: string, base: 'fixtures' | 'notes' = 'notes'): void {
  const html = fs.readFileSync(base === 'notes' ? path.join(HERE, 'fixtures', file) : path.join(ROOT, 'fixtures', file), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', url);
}

let manager: LifecycleManager | null = null;
let context: MemoryNotes;
const settle = (ms = 30) => act(async () => void (await flush(ms)));

async function start(): Promise<LifecycleManager> {
  context = context ?? (await memoryNotes());
  const module = createModuleG({ context: async () => context, anchors: () => AnchorStore.open(context.store) });
  manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: () => true });
  await act(async () => {
    manager?.start();
    await flush(10);
  });
  await settle();
  return manager;
}

beforeEach(async () => {
  context = await memoryNotes();
});
afterEach(() => {
  act(() => manager?.stop());
  manager = null;
});

const hosts = (name?: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(HOST_TAG)].filter((h) => !name || h.getAttribute('data-mijhar-host') === name);
const cardHost = (): HTMLElement => {
  const host = hosts('g')[0];
  if (!host) throw new Error('لا بطاقة');
  return host;
};
const inCard = <E extends Element = HTMLElement>(selector: string): E => {
  const el = cardHost().shadowRoot?.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر في البطاقة: ${selector}`);
  return el;
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
};

describe('بطاقة الصفحة', () => {
  it('تُدرج مطويةً في أول حاوية المحتوى بعدّاد صفر، وتُفتح بالنقر على مساحة العمل', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo', 'fixtures');
    await start();
    const main = document.querySelector('#repo-content-pjax-container');
    expect(main?.firstElementChild).toBe(cardHost());
    expect(inCard('.card-bar').getAttribute('aria-expanded')).toBe('false');
    expect(inCard('.count').textContent).toBe('0');
    expect(cardHost().shadowRoot?.querySelector('.notes')).toBeNull();
    await click(inCard('.card-bar'));
    expect(inCard('.card-bar').getAttribute('aria-expanded')).toBe('true');
    expect(inCard('.notes textarea')).not.toBeNull();
  });

  it('إنشاء ملاحظة من البطاقة يحدّث العدّاد ويحفظها بهدف المستودع', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo', 'fixtures');
    await start();
    await click(inCard('.card-bar'));
    const textarea = inCard<HTMLTextAreaElement>('.notes textarea');
    await act(async () => {
      textarea.value = 'ملاحظة من الصفحة';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(inCard('[data-action="create"]'));
    await settle();
    expect(inCard('.count').textContent).toBe('1');
    expect(context.repository.list()[0]).toMatchObject({ text: 'ملاحظة من الصفحة', target: { level: 'repo', owner: 'octo', repo: 'demo' } });
  });

  it('إيقاف الوحدة يعيد الصفحة كما كانت حرفيًا ولا يبقى مضيف', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo', 'fixtures');
    const before = document.documentElement.outerHTML;
    const running = await start();
    expect(hosts()).toHaveLength(1);
    act(() => running.stop());
    expect(hosts()).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('صفحات المستويات كلها تُركَّب فيها البطاقة', async () => {
    const cases: Array<[string, string]> = [
      ['pages/issue.html', 'https://github.com/octo/demo/issues/12'],
      ['pages/pr.html', 'https://github.com/octo/demo/pull/42'],
      ['fixture-commit.html', `https://github.com/octo/demo/commit/${SHA}`],
      ['fixture-code-view-drift.html', 'https://github.com/octo/demo/blob/main/lib/response.js'],
    ];
    for (const [file, url] of cases) {
      load(file, url, file.startsWith('pages/') ? 'fixtures' : 'notes');
      const running = await start();
      expect(hosts('g'), url).toHaveLength(1);
      act(() => running.stop());
      expect(hosts(), url).toHaveLength(0);
    }
  });

  it('مفتاح البطاقة يخفيها فورًا ويعيدها', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo', 'fixtures');
    await start();
    expect(cardHost().shadowRoot?.querySelector('.notes-card')).not.toBeNull();
    await act(async () => {
      await context.settings.set(NOTES_PAGE_CARD_KEY, false);
      await flush(4);
    });
    expect(cardHost().shadowRoot?.querySelector('.notes-card')).toBeNull();
    await act(async () => {
      await context.settings.set(NOTES_PAGE_CARD_KEY, true);
      await flush(4);
    });
    expect(cardHost().shadowRoot?.querySelector('.notes-card')).not.toBeNull();
  });

  it('تنقل Turbo إلى صفحة أخرى يعيد التركيب بلا بطاقة مكررة', async () => {
    load('pages/repo.html', 'https://github.com/octo/demo', 'fixtures');
    await start();
    expect(hosts('g')).toHaveLength(1);
    const next = new DOMParser().parseFromString(fs.readFileSync(path.join(ROOT, 'fixtures/pages/issue.html'), 'utf8'), 'text/html');
    window.history.pushState({}, '', '/octo/demo/issues/12');
    await act(async () => {
      document.documentElement.replaceChild(document.adoptNode(next.body), document.body);
      document.dispatchEvent(new Event('turbo:render'));
      document.dispatchEvent(new Event('turbo:load'));
      await flush(20);
    });
    expect(hosts('g')).toHaveLength(1);
    await click(inCard('.card-bar'));
    expect(inCard('.chip[data-level="thread"]')).not.toBeNull();
  });
});

describe('علامات الأسطر', () => {
  const FILE_URL = 'https://github.com/octo/demo/blob/main/lib/response.js';
  const markerHosts = (): HTMLElement[] => hosts('g-line-marker');
  const markerOn = (n: number): HTMLElement | undefined => markerHosts().find((h) => h.parentElement?.getAttribute('data-line-number') === String(n));

  it('علامة بجوار رقم السطر لملاحظة سطر على المرجع نفسه، وتُزال بالإيقاف', async () => {
    load('fixture-code-view-drift.html', FILE_URL);
    await context.repository.create(draft(TARGETS.blobLine!, 'على الأسطر ٣–٥'));
    const running = await start();
    expect(markerHosts()).toHaveLength(1);
    expect(markerOn(3)?.shadowRoot?.querySelector('.line-marker')?.getAttribute('aria-label')).toBe('ملاحظة خاصة على هذا السطر');
    expect(markerOn(4)).toBeUndefined();
    act(() => running.stop());
    expect(markerHosts()).toHaveLength(0);
    expect(document.querySelector('[data-line-number="3"]')?.children).toHaveLength(0);
  });

  it('نقر العلامة يفتح البطاقة ويبرز الملاحظة', async () => {
    load('fixture-code-view-drift.html', FILE_URL);
    const note = await context.repository.create(draft(TARGETS.blobLine!, 'أبرزني'));
    await start();
    expect(inCard('.card-bar').getAttribute('aria-expanded')).toBe('false');
    await click(markerOn(3)!.shadowRoot!.querySelector('.line-marker')!);
    expect(inCard('.card-bar').getAttribute('aria-expanded')).toBe('true');
    expect(inCard(`.note[data-note-id="${note.id}"]`).hasAttribute('data-flash')).toBe(true);
  });

  it('ملاحظة سطر محفوظة على مرجع آخر لا تُلصق بسطر هذه الصفحة', async () => {
    load('fixture-code-view-drift.html', FILE_URL);
    await context.repository.create(draft({ ...TARGETS.blobLine, ref: 'dev' } as never, 'من فرع آخر'));
    await start();
    expect(markerHosts()).toHaveLength(0);
  });

  it('ملاحظتان على السطر نفسه: علامة واحدة بعدّاد', async () => {
    load('fixture-code-view-drift.html', FILE_URL);
    await context.repository.create(draft(TARGETS.blobLine!, 'أ'));
    await context.repository.create(draft({ ...TARGETS.blobLine, end: 3 } as never, 'ب'));
    await start();
    expect(markerHosts()).toHaveLength(1);
    expect(markerOn(3)?.shadowRoot?.querySelector('.line-marker')?.textContent).toBe('2');
  });

  it('مفتاح العلامات، وملاحظة تُضاف أو تُحذف تحدّث العلامات', async () => {
    load('fixture-code-view-drift.html', FILE_URL);
    await start();
    expect(markerHosts()).toHaveLength(0);
    const note = await context.repository.create(draft(TARGETS.blobLine!));
    await settle(220);
    expect(markerHosts()).toHaveLength(1);
    await act(async () => {
      await context.settings.set(NOTES_LINE_MARKERS_KEY, false);
      await flush(220);
    });
    expect(markerHosts()).toHaveLength(0);
    await act(async () => {
      await context.settings.set(NOTES_LINE_MARKERS_KEY, true);
      await flush(220);
    });
    expect(markerHosts()).toHaveLength(1);
    await context.repository.remove(note.id);
    await settle(220);
    expect(markerHosts()).toHaveLength(0);
  });

  it('سطر غير ظاهر في الصفحة (عرض Markdown) لا علامة له والملاحظة محفوظة', async () => {
    load('fixture-blob-markdown.html', 'https://github.com/octo/demo/blob/main/README.md');
    await context.repository.create(draft({ ...TARGETS.blobLine, path: 'README.md' } as never, 'بلا موضع مرئي'));
    await start();
    expect(markerHosts()).toHaveLength(0);
    expect(context.repository.size).toBe(1);
  });

  it('علامة لسطر في فروق طلب دمج داخل ملفه المقصود وبجهته', async () => {
    load('fixture-pr-files.html', 'https://github.com/octo/demo/pull/42/files');
    await context.repository.create(draft(TARGETS.diffLine!, 'على فرق'));
    await start();
    expect(markerHosts()).toHaveLength(1);
    const cell = markerHosts()[0]?.parentElement;
    expect(cell?.id).toMatch(/R5$/);
    expect(cell?.closest('[data-tagsearch-path]')?.getAttribute('data-tagsearch-path')).toBe('src/app.js');
  });
});

describe('تحديد الأسطر من الرابط', () => {
  it('الهاش يفعّل مستوى السطر في البطاقة وحالة «غير مثبتة» حين لا يظهر السطر', async () => {
    load('fixture-blob-markdown.html', 'https://github.com/octo/demo/blob/main/README.md#L2');
    await start();
    await click(inCard('.card-bar'));
    expect(inCard('.chip[data-level="line"]').getAttribute('aria-pressed')).toBe('true');
    const textarea = inCard<HTMLTextAreaElement>('.notes textarea');
    await act(async () => {
      textarea.value = 'سطر في Markdown';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(inCard('[data-action="create"]'));
    await settle();
    expect(context.repository.list()[0]).toMatchObject({ text: 'سطر في Markdown', anchorStatus: 'unanchored', target: { level: 'line', start: 2, path: 'README.md' } });
  });

  it('تغيّر الهاش يحدّث هدف السطر دون إعادة تركيب', async () => {
    load('fixture-code-view-drift.html', 'https://github.com/octo/demo/blob/main/lib/response.js#L2');
    await start();
    await click(inCard('.card-bar'));
    expect(inCard('label.field').textContent).toContain('(2)');
    await act(async () => {
      window.location.hash = '#L8-L9';
      window.dispatchEvent(new Event('hashchange'));
      await flush(120);
    });
    expect(inCard('label.field').textContent).toContain('(8–9)');
    expect(hosts('g')).toHaveLength(1);
  });
});
