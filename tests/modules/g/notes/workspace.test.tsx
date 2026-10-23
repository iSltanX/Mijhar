// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-NOTE-01 (AC-G1): إنشاء الملاحظة وتحريرها وعرضها وحذفها على المستويات الخمسة بمساحة العمل نفسها (بطاقة الصفحة واللوحة)،
// وبقاؤها محفوظة حين يتعذّر تحديد موضعها، وحالة المرساة حقل منفصل عن النص.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea, StorageQuotaError } from '../../../../src/core';
import { NotesWorkspace } from '../../../../src/modules/g/notes';
import type { Note, NoteLevel } from '../../../../src/modules/g/notes';
import { pageInfoFromUrl } from '../../../../src/shared/page';
import type { PageInfo } from '../../../../src/shared/page';
import { SHA, TARGETS, draft, flush, memoryNotes } from './helpers';

const BASE = 'https://github.com/octo/demo';
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

const $ = <E extends Element = HTMLElement>(selector: string, root: ParentNode = container): E => {
  const el = root.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const settle = (ms = 4) => act(async () => void (await flush(ms)));
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(2);
  });
};
const noteTexts = (): string[] => [...container.querySelectorAll('.note .note-text')].map((n) => n.textContent ?? '');

const page = (url: string, patch: Partial<PageInfo> = {}): PageInfo => ({ ...pageInfoFromUrl(url, 'عنوان'), ...patch });
const mountWorkspace = async (info: PageInfo, mode: 'card' | 'panel' = 'card', ctx?: Awaited<ReturnType<typeof memoryNotes>>, locate?: (t: never) => boolean) => {
  const context = ctx ?? (await memoryNotes());
  await act(async () => {
    render(<NotesWorkspace repository={context.repository} page={info} mode={mode} {...(locate ? { locate: locate as never } : {})} />, container);
  });
  return context;
};

interface LevelCase {
  readonly level: NoteLevel;
  readonly name: string;
  readonly info: PageInfo;
  readonly expect: Record<string, unknown>;
}

const CASES: readonly LevelCase[] = [
  { level: 'repo', name: 'المستودع', info: page(BASE), expect: { level: 'repo', owner: 'octo', repo: 'demo' } },
  { level: 'thread', name: 'طلب دمج', info: page(`${BASE}/pull/42`), expect: { level: 'thread', kind: 'pr', number: 42 } },
  { level: 'thread', name: 'مشكلة', info: page(`${BASE}/issues/12`), expect: { level: 'thread', kind: 'issue', number: 12 } },
  { level: 'commit', name: 'التزام', info: page(`${BASE}/commit/${SHA}`), expect: { level: 'commit', sha: SHA } },
  { level: 'file', name: 'ملف', info: page(`${BASE}/blob/main/lib/response.js`), expect: { level: 'file', ref: 'main', path: 'lib/response.js' } },
  { level: 'line', name: 'سطر/نطاق في ملف', info: page(`${BASE}/blob/main/lib/response.js#L3-L5`), expect: { level: 'line', view: 'blob', start: 3, end: 5 } },
  {
    level: 'line',
    name: 'سطر في فروق طلب دمج',
    info: page(`${BASE}/pull/42/files#diff-ab12R5`, { diffPath: 'src/app.js' }),
    expect: { level: 'line', view: 'diff', context: { kind: 'pr', number: 42 }, side: 'R', start: 5 },
  },
];

describe('الإنشاء والتحرير والحذف على كل مستوى', () => {
  for (const c of CASES) {
    it(`${c.name}: تُنشأ وتُعرض وتُعدَّل وتُحذف`, async () => {
      const context = await mountWorkspace(c.info);
      const chip = $(`.chip[data-level="${c.level}"]`);
      await click(chip);
      expect(chip.getAttribute('aria-pressed')).toBe('true');

      await type($('textarea'), `ملاحظة ${c.name}`);
      await click($('[data-action="create"]'));
      await settle();
      expect(noteTexts()).toEqual([`ملاحظة ${c.name}`]);
      expect(context.repository.list()).toHaveLength(1);
      expect(context.repository.list()[0]?.target).toMatchObject(c.expect);
      expect(($('textarea') as HTMLTextAreaElement).value).toBe('');
      expect($(`.chip[data-level="${c.level}"]`).textContent).toContain('(1)');

      await click($('[data-action="edit"]'));
      await type($('.note textarea'), 'نص معدّل');
      await click($('[data-action="save-edit"]'));
      await settle();
      expect(noteTexts()).toEqual(['نص معدّل']);
      expect(context.repository.list()[0]?.text).toBe('نص معدّل');

      await click($('[data-action="delete"]'));
      expect(context.repository.size).toBe(1);
      await click($('[data-action="confirm-delete"]'));
      await settle();
      expect(context.repository.size).toBe(0);
      expect(noteTexts()).toEqual([]);
      expect(container.querySelector('[data-notes-empty="level"]')).not.toBeNull();
    });
  }

  it('إلغاء الحذف والتعديل لا يغيّران شيئًا', async () => {
    const context = await mountWorkspace(page(BASE));
    await context.repository.create(draft(TARGETS.repo!, 'باقية'));
    await settle();
    await click($('[data-action="delete"]'));
    await click($('[data-action="cancel-delete"]'));
    await click($('[data-action="edit"]'));
    await type($('.note textarea'), 'لن تُحفظ');
    await click($('[data-action="cancel-edit"]'));
    expect(noteTexts()).toEqual(['باقية']);
    expect(context.repository.list()[0]?.text).toBe('باقية');
  });
});

describe('الملاحظة محفوظة حتى لو تعذّر تحديد موضعها، وحالة المرساة حقل مستقل', () => {
  const lineInfo = page(`${BASE}/blob/main/lib/response.js#L7`);

  it('سطر لا يظهر في الصفحة: يُحفظ بحالة «غير مثبتة» ونصه كاملًا', async () => {
    const context = await mountWorkspace(lineInfo, 'card', undefined, () => false);
    await type($('textarea'), 'ملاحظة على سطر غير ظاهر');
    await click($('[data-action="create"]'));
    await settle();
    const [saved] = context.repository.list();
    expect(saved).toMatchObject({ text: 'ملاحظة على سطر غير ظاهر', anchorStatus: 'unanchored' });
    expect(noteTexts()).toEqual(['ملاحظة على سطر غير ظاهر']);
    expect($('.anchor').getAttribute('data-anchor-status')).toBe('unanchored');
    expect($('.anchor').textContent).toBe('غير مثبتة');
  });

  it('سطر ظاهر: «موضع غير متحقق منه»؛ واللوحة بلا DOM تعامل الموضع كذلك', async () => {
    const shown = await mountWorkspace(lineInfo, 'card', undefined, () => true);
    await type($('textarea'), 'أ');
    await click($('[data-action="create"]'));
    await settle();
    expect(shown.repository.list()[0]?.anchorStatus).toBe('unverified');
    render(null, container);
    const panel = await mountWorkspace(lineInfo, 'panel');
    await type($('textarea'), 'ب');
    await click($('[data-action="create"]'));
    await settle();
    expect(panel.repository.list()[0]?.anchorStatus).toBe('unverified');
  });

  it('تعديل النص من الواجهة لا يغيّر حالة المرساة', async () => {
    const context = await mountWorkspace(lineInfo, 'card', undefined, () => false);
    await type($('textarea'), 'قبل');
    await click($('[data-action="create"]'));
    await settle();
    await click($('[data-action="edit"]'));
    await type($('.note textarea'), 'بعد');
    await click($('[data-action="save-edit"]'));
    await settle();
    expect(context.repository.list()[0]).toMatchObject({ text: 'بعد', anchorStatus: 'unanchored' });
  });

  it('ملف بلا تحديد أسطر: لا تُنشأ ملاحظة سطر والسبب ظاهر', async () => {
    await mountWorkspace(page(`${BASE}/blob/main/lib/response.js`));
    await click($('.chip[data-level="line"]'));
    expect($('textarea').hasAttribute('disabled')).toBe(true);
    expect($('[data-reason]').textContent).toMatch(/رقم السطر/);
    expect($('[data-action="create"]').hasAttribute('disabled')).toBe(true);
  });
});

describe('العرض', () => {
  it('الزر معطّل لنص فارغ أو فراغات', async () => {
    await mountWorkspace(page(BASE));
    expect($('[data-action="create"]').hasAttribute('disabled')).toBe(true);
    await type($('textarea'), '   ');
    expect($('[data-action="create"]').hasAttribute('disabled')).toBe(true);
    await type($('textarea'), 'ح');
    expect($('[data-action="create"]').hasAttribute('disabled')).toBe(false);
  });

  it('خارج مستودع: رسالة إرشاد بلا نموذج', async () => {
    await mountWorkspace(page('https://github.com/'));
    expect(container.querySelector('[data-notes-empty="no-repo"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('ملاحظة ملف محفوظة على مرجع آخر تُعلَن ولا تُعرض كأنها في موضعها', async () => {
    const context = await memoryNotes();
    await context.repository.create(draft(TARGETS.file!, 'من main'));
    await mountWorkspace(page(`${BASE}/blob/dev/lib/response.js`), 'card', context);
    await click($('.chip[data-level="file"]'));
    expect($('[data-other-ref]').textContent).toContain('main');
  });

  it('اللوحة تعرض ملاحظات المستودع الأخرى (مستويات ليست في الصفحة) بتحريرها وحذفها', async () => {
    const context = await memoryNotes();
    await context.repository.create(draft(TARGETS.pr!, 'على PR'));
    await context.repository.create(draft(TARGETS.commit!, 'على التزام'));
    await mountWorkspace(page(BASE), 'panel', context);
    const others = [...container.querySelectorAll('section[aria-label="ملاحظات أخرى في هذا المستودع"] .note-text')].map((n) => n.textContent);
    expect(others.sort()).toEqual(['على PR', 'على التزام']);
    await click($('section[aria-label="ملاحظات أخرى في هذا المستودع"] [data-action="delete"]'));
    await click($('section[aria-label="ملاحظات أخرى في هذا المستودع"] [data-action="confirm-delete"]'));
    await settle();
    expect(context.repository.size).toBe(1);
    expect(container.querySelector('[data-action="open"]')?.getAttribute('target')).toBe('_blank');
  });

  it('البطاقة لا تعرض «افتح الصفحة»؛ فهي في الصفحة نفسها', async () => {
    const context = await memoryNotes();
    await context.repository.create(draft(TARGETS.repo!));
    await mountWorkspace(page(BASE), 'card', context);
    expect(container.querySelector('[data-action="open"]')).toBeNull();
  });

  it('ملاحظة تصل من سياق آخر تظهر فورًا', async () => {
    const context = await mountWorkspace(page(BASE));
    const other = await context.reopen();
    await act(async () => {
      await other.repository.create(draft(TARGETS.repo!, 'من نافذة أخرى'));
      await flush(4);
    });
    expect(noteTexts()).toEqual(['من نافذة أخرى']);
  });

  it('النص يُعرض نصًّا لا HTML', async () => {
    const context = await mountWorkspace(page(BASE));
    await context.repository.create(draft(TARGETS.repo!, '<img src=x onerror=alert(1)> **غامق**'));
    await settle();
    expect(container.querySelector('.note img')).toBeNull();
    expect(noteTexts()[0]).toBe('<img src=x onerror=alert(1)> **غامق**');
  });
});

describe('الأخطاء', () => {
  it('فشل الحفظ بسبب الحصة يظهر تنبيهًا ويبقى النص في الحقل', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 3000 });
    const context = await memoryNotes(area);
    await mountWorkspace(page(BASE), 'card', context);
    await type($('textarea'), 'ط'.repeat(4000));
    await click($('[data-action="create"]'));
    await settle();
    expect($('[role="alert"]')).not.toBeNull();
    expect(($('textarea') as HTMLTextAreaElement).value).toHaveLength(4000);
    expect(context.repository.size).toBe(0);
    expect(StorageQuotaError).toBeDefined();
  });

  it('ملاحظة تُحذف من نافذة أخرى أثناء تحريرها تختفي من القائمة ولا يبقى تعديل معلّق', async () => {
    const context = await mountWorkspace(page(BASE));
    const created: Note = await context.repository.create(draft(TARGETS.repo!, 'ستُحذف'));
    await settle();
    await click($('[data-action="edit"]'));
    const other = await context.reopen();
    await act(async () => {
      await other.repository.remove(created.id);
      await flush(4);
    });
    expect(noteTexts()).toEqual([]);
    expect(container.querySelector('.note textarea')).toBeNull();
    expect(container.querySelector('[data-notes-empty="level"]')).not.toBeNull();
  });
});
