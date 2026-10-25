// @vitest-environment jsdom
/**
 * MJ-TA-03 (Codex): تعديلان من نافذتين لرابط «أكمل لاحقًا» واحد كانا يضيّعان أحدهما، وتعديل متأخر كان يعيد رابطًا حُذف. سببان منفصلان:
 *  (١) المحرر يرسل الحقول الثلاثة كلها بقيمها حين فُتح، فيمحو حفظُه حقلًا عدّلته نافذة أخرى ولم يُلمس فيه؛
 *  (٢) كل سياق يقرأ السجل ويكتبه بمخزنه، فلا يتوالى التعديل مع حذف من سياق آخر.
 * الإصلاح: المحرر يرسل ما غيّره المستخدم وحده، والخلفية الكاتب الوحيد لسجلات bookmarks.* (NotesBroker، كما للملاحظات AD-25).
 * محاكاة محلية: منطقة تخزين ذاكرية تؤجل كل عملية (فتتداخل عمليات السياقين كما في المتصفح)، ووسيط في «الخلفية»، ورسائل تعبر JSON.
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea, Store } from '../../../src/core';
import type { StorageValues } from '../../../src/core';
import { BookmarkNotFoundError, BookmarksRepository } from '../../../src/modules/g/bookmarks';
import type { BookmarkDraft } from '../../../src/modules/g/bookmarks';
import { BookmarkEditor } from '../../../src/modules/g/bookmarks/ui/BookmarkEditor';
import { NotesBroker, runtimeNotesWriter } from '../../../src/modules/g/notes';

const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class YieldingArea extends MemoryStorageArea {
  override async get(keys: string | string[] | null): Promise<StorageValues> {
    await flush();
    return super.get(keys);
  }
  override async set(items: StorageValues): Promise<void> {
    await flush();
    return super.set(items);
  }
  override async remove(keys: string | string[]): Promise<void> {
    await flush();
    return super.remove(keys);
  }
}

const opened: Store[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.dispose();
});

async function openStore(area: MemoryStorageArea, migrate = false): Promise<Store> {
  const store = await Store.open({ area, changes: area, locks: null, migrate });
  opened.push(store);
  return store;
}

const draft: BookmarkDraft = { url: 'https://github.com/audit/synthetic/issues/1', title: 'Synthetic bookmark', owner: 'audit', repo: 'synthetic', branch: null, refKind: 'unknown', level: 'thread', position: null };

/** خلفية بوسيطها، ونافذتان (لوحتان) تفتحان المستودع كما يفتحه laterContext: بكاتب الخلفية. */
async function windows() {
  const area = new YieldingArea();
  const background = await openStore(area, true);
  const broker = NotesBroker.forStore(background);
  const runtime = { sendMessage: async (message: unknown) => broker.handle(JSON.parse(JSON.stringify(message))) };
  const panel = async () => BookmarksRepository.open(await openStore(area), { writer: runtimeNotesWriter(runtime) });
  const a = await panel();
  const b = await panel();
  const read = async (id: string) => (await openStore(area)).read<Record<string, unknown> | null>(`bookmarks.${id}`, null);
  return { a, b, read };
}

describe('MJ-TA-03: تعديلات «أكمل لاحقًا» المتزامنة', () => {
  it('تعديلان متزامنان لحقلين مختلفين من نافذتين يبقيان كلاهما', async () => {
    const { a, b, read } = await windows();
    const first = await a.create(draft);
    await flush(4);
    await Promise.all([a.update(first.id, { note: 'new synthetic note' }), b.update(first.id, { status: 'done' })]);
    expect(await read(first.id)).toMatchObject({ note: 'new synthetic note', status: 'done' });
  });

  it('تعديل بدأ قبل الحذف من نافذة أخرى لا يعيد الرابط بعد اكتمال الحذف', async () => {
    // ترتيب Codex: A يقرأ السجل ليعدّله، ثم يحذفه B، ثم يكتب A ما عدّله.
    const { a, b, read } = await windows();
    const first = await a.create(draft);
    await flush(4);
    const results = await Promise.allSettled([a.update(first.id, { note: 'late synthetic note' }), b.remove(first.id)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await read(first.id)).toBeNull();
    await flush(4);
    expect(a.get(first.id)).toBeUndefined();
  });

  it('تعديل بعد الحذف من نافذة أخرى يُرفض بأنه غير موجود ولا يعيده', async () => {
    const { a, b, read } = await windows();
    const first = await a.create(draft);
    await flush(4);
    const results = await Promise.allSettled([b.remove(first.id), a.update(first.id, { note: 'late synthetic note' })]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(BookmarkNotFoundError);
    expect(await read(first.id)).toBeNull();
  });

  it('محرران مفتوحان على الرابط نفسه: حفظ الوسم في الثاني لا يمحو الملاحظة التي حُفظت في الأول', async () => {
    const { a, b, read } = await windows();
    const first = await a.create(draft);
    await flush(4);
    const containers = [document.createElement('div'), document.createElement('div')];
    for (const c of containers) document.body.append(c);
    try {
      // كلا المحررين فُتحا والرابط بلا ملاحظة.
      await act(async () => {
        render(<BookmarkEditor bookmark={first} repository={a} idPrefix="a" />, containers[0] as HTMLElement);
        render(<BookmarkEditor bookmark={first} repository={b} idPrefix="b" />, containers[1] as HTMLElement);
      });
      const [ca, cb] = containers as unknown as [HTMLElement, HTMLElement];
      const note = ca.querySelector<HTMLTextAreaElement>('textarea');
      if (!note) throw new Error('لا حقل ملاحظة');
      await act(async () => {
        note.value = 'note written in window A';
        note.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        ca.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush(20);
      });
      await act(async () => {
        cb.querySelector<HTMLButtonElement>('[data-status="done"]')?.click();
      });
      await act(async () => {
        cb.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush(20);
      });
      expect(await read(first.id)).toMatchObject({ note: 'note written in window A', status: 'done' });
    } finally {
      for (const c of containers) {
        render(null, c);
        c.remove();
      }
    }
  });
});
describe('MJ-TA-03: حراسة ساكنة للكاتب الوحيد', () => {
  it('فتح BookmarksRepository خارج الوسيط يمرّر writer', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '../../../src');
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const calls = walk(root).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return [...text.matchAll(/BookmarksRepository\.open\(([^)]*)\)/g)].map((m) => ({ file: path.relative(root, file), args: m[1] ?? '' }));
    });
    const outside = calls.filter((c) => c.file !== path.join('modules', 'g', 'notes', 'broker.ts'));
    expect(outside.length).toBeGreaterThanOrEqual(1);
    for (const c of outside) expect(c.args, c.file).toMatch(/\bwriter\b/);
  });
});
