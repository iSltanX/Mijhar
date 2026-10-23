// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// اللوحة الأصلية على فرع في اسمه «/» (VR-10): الرابط وحده لا يفصل الفرع عن المسار، فتطلب اللوحة وصف الصفحة من سكربت المحتوى في
// التبويب (جسر tabs.sendMessage)، وإن تعذّر الجسر لا تعرض هدف ملف ولا سطر ولا تحفظ تقسيم الرابط. يحل محل F-001 من المراجعة.
import { JSDOM } from 'jsdom';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectLater, createLaterView } from '../../../../src/modules/g/bookmarks';
import { connectNotes, createNotesView, targetOptions } from '../../../../src/modules/g/notes';
import { PAGE_INFO_MESSAGE, respondPageInfo, tabsPageSource } from '../../../../src/shared/page';
import type { ActiveTabsApi } from '../../../../src/shared/page';
import { memoryLater } from '../bookmarks/helpers';
import { flush, memoryNotes } from './helpers';

const BRANCH = 'chore/v2-pnpm-monorepo';
const URL_LINE = `https://github.com/octo/demo/blob/${BRANCH}/README.md#L5`;
const URL_FILE = `https://github.com/octo/demo/blob/${BRANCH}/README.md`;

/** صفحة ملف كما يرسمها GitHub: المرجع والمسار في بيانات react-app.embeddedData (evidence/T-0.4). */
const blobPage = (url: string, ref = BRANCH, path = 'README.md') =>
  new JSDOM(
    `<!doctype html><html><head><meta name="octolytics-dimension-repository_nwo" content="octo/demo"><title>README.md at ${ref}</title></head><body>` +
      `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({ payload: { codeViewLayoutRoute: { refInfo: { name: ref, currentOid: 'a'.repeat(40) }, path } } })}</script></body></html>`,
    { url },
  ).window.document;

type Listener = (message: unknown, sender: object, reply: (response?: unknown) => void) => unknown;

/** تبويب نشط وسكربت محتوى فيه يجيب بالمستجيب الفعلي، أو جسر معطّل (لا سكربت محتوى في التبويب). */
function activeTab(url: string, options: { doc?: Document; broken?: boolean } = {}): ActiveTabsApi & { asked: unknown[] } {
  const listeners: Listener[] = [];
  if (!options.broken) respondPageInfo({ onMessage: { addListener: (l: Listener) => void listeners.push(l), removeListener: () => {} } }, options.doc ?? blobPage(url));
  const asked: unknown[] = [];
  return {
    asked,
    query: async () => [{ id: 7, url, title: 'README.md' }],
    sendMessage: (tabId: number, message: unknown) => {
      asked.push({ tabId, message });
      if (options.broken) return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
      return new Promise((resolve) => {
        let answered = false;
        for (const listener of listeners) {
          if (listener(message, {}, (response) => ((answered = true), resolve(response))) === true || answered) return;
        }
        resolve(undefined);
      });
    },
  };
}

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  connectNotes(null);
  connectLater(null);
});

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const settle = async (ms = 8) => {
  for (let i = 0; i < 4; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
  await settle();
};
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('مصدر التبويبات في صفحة ملف (VR-10)', () => {
  it('الجسر ناجح: المرجع والمسار من الصفحة نفسها لا من تقسيم الرابط', async () => {
    const tabs = activeTab(URL_LINE);
    const page = await tabsPageSource(tabs)!.read();
    expect(tabs.asked).toEqual([{ tabId: 7, message: { type: PAGE_INFO_MESSAGE } }]);
    expect(page).toMatchObject({ type: 'blob', ref: BRANCH, path: 'README.md', refKind: 'ref', lines: { start: 5, end: 5 }, href: URL_LINE });
  });

  it('الجسر معطّل أو يجيب عن ملف آخر: لا مرجع ولا مسار، ولا هدف ملف ولا سطر، والمستودع متاح', async () => {
    for (const tabs of [activeTab(URL_LINE, { broken: true }), activeTab(URL_LINE, { doc: blobPage(URL_LINE, 'main', 'other.md') })]) {
      const page = (await tabsPageSource(tabs)!.read())!;
      expect(page).toMatchObject({ type: 'blob', ref: null, path: null, refKind: 'unknown' });
      const options = targetOptions(page);
      expect(options.find((o) => o.level === 'repo')?.target).toMatchObject({ level: 'repo', owner: 'octo', repo: 'demo' });
      for (const level of ['file', 'line'] as const) {
        const option = options.find((o) => o.level === level)!;
        expect(option.target).toBeNull();
        expect(option.reason).toContain('أنشئها من بطاقة');
      }
    }
  });

  it('صفحة غير صفحة ملف لا تطلب الجسر', async () => {
    const tabs = activeTab('https://github.com/octo/demo/issues/3');
    expect(await tabsPageSource(tabs)!.read()).toMatchObject({ type: 'issue', number: 3 });
    expect(tabs.asked).toEqual([]);
  });
});

describe('ملاحظات اللوحة على فرع فيه «/» (VR-10)', () => {
  it('الجسر ناجح: ملاحظة الملف وملاحظة السطر تُحفظان بالفرع والمسار الصحيحين', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const View = createNotesView({ source: () => tabsPageSource(activeTab(URL_LINE)) });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    for (const level of ['line', 'file'] as const) {
      await click($(`.chip[data-level="${level}"]`));
      await type($('textarea'), `على ${level}`);
      await click($('[data-action="create"]'));
    }
    const saved = Object.fromEntries(context.repository.list().map((n) => [n.target.level, n.target]));
    expect(saved.line).toMatchObject({ view: 'blob', ref: BRANCH, path: 'README.md', refKind: 'ref', start: 5, end: 5 });
    expect(saved.file).toMatchObject({ ref: BRANCH, path: 'README.md', refKind: 'ref' });
  });

  it('الجسر معطّل: لا يُعرض هدف ملف ولا سطر ويظهر السبب، ومستوى المستودع يعمل', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const View = createNotesView({ source: () => tabsPageSource(activeTab(URL_LINE, { broken: true })) });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    for (const level of ['line', 'file'] as const) {
      await click($(`.chip[data-level="${level}"]`));
      expect($<HTMLTextAreaElement>('textarea').disabled).toBe(true);
      expect($('[data-reason]').textContent).toContain('أنشئها من بطاقة');
    }
    await click($('.chip[data-level="repo"]'));
    await type($('textarea'), 'على المستودع');
    await click($('[data-action="create"]'));
    expect(context.repository.list().map((n) => n.target)).toEqual([{ level: 'repo', owner: 'octo', repo: 'demo' }]);
  });
});

describe('الحفظ السريع في اللوحة على فرع فيه «/» (VR-10)', () => {
  const mount = async (tabs: ActiveTabsApi) => {
    const later = await memoryLater();
    connectLater(async () => later);
    const View = createLaterView({ source: () => tabsPageSource(tabs), now: () => new Date('2026-10-23T12:00:00Z') });
    await act(async () => render(<View settings={later.settings} surface="native" />, container));
    await settle(30);
    await click($('[data-action="quick-save"]'));
    return later.bookmarks.findByPage(URL_FILE);
  };

  it('الجسر ناجح: الفرع الكامل', async () => {
    expect(await mount(activeTab(URL_FILE))).toMatchObject({ branch: BRANCH, refKind: 'ref', level: 'file' });
  });

  it('الجسر معطّل: لا يُحفظ فرع من تقسيم الرابط', async () => {
    expect(await mount(activeTab(URL_FILE, { broken: true }))).toMatchObject({ branch: null, refKind: 'unknown', level: 'file' });
  });
});
