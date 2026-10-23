// TEST-RTL-05A إلى 05G (AC-A5) على jsdom بالطريقة المختارة في DEC-02 (أ-2: العارض المعزول وحده):
//  05A إلى 05C: النسخ الجزئي والممتد والغني من العارض يحمل النص المشكول الأصلي في text/plain وtext/html؛ والسحب كذلك.
//  05D و05F و05G: على إعادة تحميل محتوى العارض: ما يكتبه GitHub في الصفحة هو ما يعرضه العارض بعد التحديث بكل التراتيب، ولا يكتب
//  وضع القراءة على عقد GitHub شيئًا غير زره (فلا استعادة فوق تحديث).
//  05E: شريط تلميح البحث في الواجهة لكل متصفح؛ والقياس الفعلي في المتصفحات في tests/modules/a/browser/run.mjs.
// ومعها البند ٤ و٥: اقتباس الرد (يقرأ نص DOM) وأزرار النسخ ومصدر Markdown والحقول لا تتغير، واللقطة منظَّفة بقائمة السماح.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { LifecycleManager, MemoryStorageArea, ModuleRegistry, PageDetector, SettingsRegistry, SettingsStore, Store } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { HOST_ATTR } from '../../../../src/core/ui-host/shadow';
import { FONTS_FEATURE } from '../../../../src/modules/a/fonts';
import {
  READING_HOST_NAME,
  READING_OPEN_MESSAGE,
  READING_OPTIONS_KEY,
  READING_SNAPSHOT_MESSAGE,
  createReadingFeature,
  isSnapshot,
  readerUrl,
  openReaderFor,
  snapshotContainers,
  sourceTabFrom,
  takeSnapshot,
} from '../../../../src/modules/a/reading';
import type { ReadingSnapshot, SnapshotResponse } from '../../../../src/modules/a/reading';
import { ReaderApp } from '../../../../src/modules/a/reading/reader/ReaderApp';
import { DiacriticsView, SEARCH_HINTS, bindClipboard, originalSlice, realign, renderSnapshot, stripDiacritics, stripWithOffsets } from '../../../../src/modules/a/reading/reader/view';
import { createModuleA, defineModuleASettings } from '../../../../src/modules/a/scope';
import type { ModuleAFeature } from '../../../../src/modules/a/scope';
import { ROOT } from '../../../setup/paths';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const DIACRITIC = /[ً-ٰٟ]/;
const LIVE = fs.readFileSync(path.join(ROOT, 'fixtures/spikes/fixture-diacritics-live.html'), 'utf8');
const SHAKKALA = fs.readFileSync(path.join(ROOT, 'fixtures/spikes/gh-readme-shakkala.html'), 'utf8');

type Listener = (message: unknown, sender: { tab?: { id?: number; index?: number } }, sendResponse: (response?: unknown) => void) => unknown;

function fakeApi() {
  const listeners = new Set<Listener>();
  const sent: unknown[] = [];
  const created: Array<Record<string, unknown>> = [];
  const api = {
    runtime: {
      getURL: (p: string) => `chrome-extension://mijhar/${p}`,
      sendMessage: async (message: unknown) => {
        sent.push(message);
      },
      onMessage: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) },
    },
    tabs: {
      create: async (props: Record<string, unknown>) => {
        created.push(props);
        return { id: 99 };
      },
      sendMessage: async () => undefined,
      query: async () => [],
    },
  } as unknown as ExtensionApi;
  const request = (): SnapshotResponse | undefined => {
    let response: unknown;
    for (const listener of listeners) listener({ type: READING_SNAPSHOT_MESSAGE }, {}, (r) => (response = r));
    return response as SnapshotResponse | undefined;
  };
  return { api, listeners, sent, created, request };
}

const GH = (doc: Document) => ({
  node: (id: string) => doc.querySelector(`#${id} p`)?.firstChild as Text,
  update(id: string, text: string) {
    this.node(id).nodeValue = text;
  },
  text: (id: string) => doc.querySelector(`#${id} p`)?.textContent ?? '',
});

function mountLive(features?: (api: ExtensionApi) => ModuleAFeature[]) {
  const dom = new JSDOM(LIVE, { url: 'https://github.com/octo/demo/issues/1', pretendToBeVisual: true });
  const doc = dom.window.document;
  const fake = fakeApi();
  const module = createModuleA({ features: features ? features(fake.api) : [createReadingFeature({ api: () => fake.api })] });
  const detector = new PageDetector({ document: doc, settleMs: 5 });
  const manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector, document: doc, isEnabled: () => true });
  manager.start();
  return { dom, doc, manager, ...fake };
}

function reader(snapshot: ReadingSnapshot) {
  const dom = new JSDOM('<!doctype html><html><body><article id="r" dir="ltr"></article></body></html>');
  const doc = dom.window.document;
  const article = doc.getElementById('r') as HTMLElement;
  renderSnapshot(article, snapshot);
  const view = new DiacriticsView(article);
  return { dom, doc, article, view };
}

function liveSnapshot(): ReadingSnapshot {
  const doc = new JSDOM(LIVE, { url: 'https://github.com/octo/demo/issues/1' }).window.document;
  return takeSnapshot(doc, snapshotContainers(doc, '.markdown-body'));
}

describe('اللقطة', () => {
  it('منظَّفة بقائمة السماح: لا سكربت ولا زر ولا مرساة، وروابط https مطلقة فقط، والصور نص بديل، والنص حرفيًا بتشكيله', () => {
    const dom = new JSDOM(
      `<div class="markdown-body"><p dir="auto">نَصٌّ <a href="/octo/x">رابط نسبي</a> <a href="javascript:alert(1)">خبيث</a> <img src="https://camo.githubusercontent.com/x" alt="شعار"> <button>زر</button><script>alert(1)</script><span onclick="x()">مُفكَّك</span></p><div class="markdown-heading"><h2 dir="auto">عنوان</h2><a class="anchor" href="#t"><svg></svg></a></div><ul><li><input type="checkbox" checked disabled> مهمة</li></ul></div>`,
      { url: 'https://github.com/octo/demo' },
    );
    const doc = dom.window.document;
    const html = doc.body.innerHTML;
    const snapshot = takeSnapshot(doc, snapshotContainers(doc, '.markdown-body'));
    expect(doc.body.innerHTML).toBe(html);
    const json = JSON.stringify(snapshot);
    for (const banned of ['script', 'alert', 'button', 'onclick', 'svg', 'anchor', 'javascript:', 'camo']) expect(json).not.toContain(banned);
    expect(json).toContain('https://github.com/octo/x');
    expect(json).toContain('نَصٌّ');
    expect(json).toContain('مُفكَّك');
    expect(json).toContain('شعار');
    expect(json).toContain('☑ ');
    expect(isSnapshot(snapshot)).toBe(true);
  });

  it('README حقيقي مشكول (Shakkala): نصه كله في اللقطة بالترتيب، والصفحة لم تتغير', () => {
    const doc = new JSDOM(SHAKKALA, { url: 'https://github.com/Barqawiz/Shakkala' }).window.document;
    const html = doc.body.innerHTML;
    const containers = snapshotContainers(doc, '.markdown-body');
    const snapshot = takeSnapshot(doc, containers);
    expect(doc.body.innerHTML).toBe(html);
    const flat = (nodes: readonly unknown[]): string => nodes.map((n) => (typeof n === 'string' ? n : flat((n as { c?: unknown[] }).c ?? []))).join('');
    const text = snapshot.sections.map((s) => flat(s.nodes)).join('');
    expect(text.match(/[ً-ٰٟ]/g)?.length).toBeGreaterThan(50);
    expect(snapshot.truncated).toBe(false);
  });

  it('رسائل العارض: عنوانه برقم المصدر، وقراءة الرقم من العنوان', () => {
    expect(readerUrl((p) => `ext://${p}`, 12)).toBe('ext://reader.html?tab=12');
    expect([sourceTabFrom('?tab=12'), sourceTabFrom('?tab=x'), sourceTabFrom('')]).toEqual([12, null, null]);
  });
});

describe('الميزة في صفحة GitHub', () => {
  it('زر واحد قبل أول حاوية يطلب فتح العارض، ومستجيب للقطة، والإيقاف يزيلهما', () => {
    const { doc, manager, sent, listeners, request } = mountLive();
    const hosts = doc.querySelectorAll(`[${HOST_ATTR}="${READING_HOST_NAME}"]`);
    expect(hosts.length).toBe(1);
    expect(hosts[0]?.nextElementSibling?.id).toBe('c1');
    (hosts[0]?.shadowRoot?.querySelector('button') as HTMLButtonElement).click();
    expect(sent).toEqual([{ type: READING_OPEN_MESSAGE }]);
    const response = request();
    expect(response?.ok).toBe(true);
    expect(response && response.ok ? response.snapshot.sections.length : 0).toBe(7);
    manager.stop();
    expect(doc.querySelector(`[${HOST_ATTR}]`)).toBeNull();
    expect(listeners.size).toBe(0);
  });

  it('البندان ٤ و٥: نص DOM الذي يقرؤه اقتباس الرد بتشكيله، ولا تُمس الحقول ولا شيء في الصفحة غير الزر', async () => {
    const dom = new JSDOM(LIVE, { url: 'https://github.com/octo/demo/issues/1', pretendToBeVisual: true });
    const doc = dom.window.document;
    const before = doc.body.innerHTML;
    const records: MutationRecord[] = [];
    new dom.window.MutationObserver((r) => records.push(...r)).observe(doc, { subtree: true, childList: true, characterData: true, attributes: true });
    const fake = fakeApi();
    const manager = new LifecycleManager({
      registry: new ModuleRegistry([createModuleA({ features: [createReadingFeature({ api: () => fake.api })] })]),
      detector: new PageDetector({ document: doc, settleMs: 5 }),
      document: doc,
      isEnabled: () => true,
    });
    manager.start();
    fake.request();
    await deliver();
    // اقتباس الرد يقرأ النص المعروض من DOM: يبقى مشكولًا.
    expect(doc.querySelector('#c2 p')?.textContent).toBe('كَتَبَ المُطَوِّرُ الشِّيفْرَةَ بِعِنَايَةٍ ثُمَّ رَاجَعَهَا الفَرِيقُ.');
    expect(records.filter((r) => r.type !== 'childList' || ![...r.addedNodes].every((n) => (n as Element).getAttribute?.(HOST_ATTR) === READING_HOST_NAME))).toEqual([]);
    expect((doc.getElementById('drop') as HTMLTextAreaElement).value).toBe('');
    manager.stop();
    expect(doc.body.innerHTML).toBe(before);
  });

  it('الخلفية تفتح العارض بجوار التبويب المصدر وبرقمه', async () => {
    const fake = fakeApi();
    expect(openReaderFor(fake.api, { type: READING_OPEN_MESSAGE }, { tab: { id: 7, index: 2 } as never })).toBe(true);
    expect(openReaderFor(fake.api, { type: 'other' }, { tab: { id: 7, index: 2 } as never })).toBe(false);
    await deliver();
    expect(fake.created).toEqual([{ url: 'chrome-extension://mijhar/reader.html?tab=7', index: 3, openerTabId: 7, active: true }]);
  });
});

describe('العارض: إخفاء التشكيل والنسخ', () => {
  it('الإخفاء ثم الإظهار يعيدان النص حرفيًا، والكود لا يُمس', () => {
    const { article, view } = reader(liveSnapshot());
    const original = article.textContent;
    expect(view.hide()).toBeGreaterThanOrEqual(10);
    expect(article.textContent).toBe(stripDiacritics(original ?? '').replace(/x/g, 'x'));
    expect(article.querySelector('code')?.textContent).toBe('npm install');
    view.show();
    expect(article.textContent).toBe(original);
  });

  it('مصفوفة الإزاحة والمحاذاة', () => {
    const { stripped, offsets } = stripWithOffsets('كَتَبَ المُطَوِّرُ');
    expect(stripped).toBe('كتب المطور');
    expect(offsets.length).toBe(stripped.length + 1);
    const start = stripped.indexOf('المطور');
    expect(originalSlice('كَتَبَ المُطَوِّرُ', offsets, start, start + 6)).toBe('المُطَوِّرُ');
    expect(realign('كتب\nالمطور', 'كَتَبَ المُطَوِّرُ')).toBe('كَتَبَ\nالمُطَوِّرُ');
  });

  it('05A: نسخ جزئي داخل عقدة يحمل الكلمة بحركاتها', () => {
    const { doc, article, view } = reader(liveSnapshot());
    view.hide();
    const node = article.querySelectorAll('.markdown-body')[1]?.querySelector('p')?.firstChild as Text;
    const start = node.data.indexOf('المطور');
    const range = doc.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 6);
    const data = view.clipboard(range);
    expect(data?.plain).toBe('المُطَوِّرُ');
    expect(data?.html).toBe('المُطَوِّرُ');
  });

  it('05B و05C: تحديد ممتد عبر p وstrong وcode وa وli: text/plain مطابق للنص الظاهر بالتشكيل، وtext/html بوسومه وحركاته', () => {
    const { doc, article, view } = reader(liveSnapshot());
    const section = article.querySelectorAll('.markdown-body')[2] as Element;
    const first = section.querySelector('p')?.firstChild as Text;
    const last = section.querySelector('p:last-of-type')?.firstChild as Text;
    const originals = { first: first.data, last: last.data };
    view.hide();
    const range = doc.createRange();
    range.setStart(first, 2);
    range.setEnd(last, 5);
    const data = view.clipboard(range);
    view.show();
    const shown = doc.createRange();
    shown.setStart(first, stripWithOffsets(originals.first).offsets[2] as number);
    shown.setEnd(last, stripWithOffsets(originals.last).offsets[5] as number);
    expect(data?.plain).toBe(shown.toString());
    expect(data?.plain).toContain('npm install');
    expect(data?.plain).toContain('الدَّلِيلَ الرَّسْمِيَّ');
    for (const tag of ['<strong>', '<code>', '<a ', '<li>']) expect(data?.html).toContain(tag);
    expect(data?.html).toContain('التَّجْرِبَةَ');
  });

  it('لا تدخل حين يكون التشكيل ظاهرًا أو لا يمس التحديد عقدة أُخفي تشكيلها', () => {
    const { doc, article, view } = reader(liveSnapshot());
    const node = article.querySelector('code')?.firstChild as Text;
    const range = doc.createRange();
    range.selectNodeContents(node);
    expect(view.clipboard(range)).toBeNull();
    view.hide();
    expect(view.clipboard(range)).toBeNull();
  });

  it('حدثا copy وdragstart: يُكتب الأصل في القناتين ويُمنع الافتراضي في النسخ فقط', () => {
    const { dom, doc, article, view } = reader(liveSnapshot());
    view.hide();
    const counters = { copy: 0, drag: 0 };
    const unbind = bindClipboard(doc, view, counters);
    const node = article.querySelectorAll('.markdown-body')[1]?.querySelector('p')?.firstChild as Text;
    const selection = doc.getSelection() as Selection;
    const range = doc.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 3);
    selection.removeAllRanges();
    selection.addRange(range);
    const fire = (type: string) => {
      const store = new Map<string, string>();
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      const transfer = { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? '' };
      Object.defineProperty(event, type === 'copy' ? 'clipboardData' : 'dataTransfer', { value: transfer });
      node.parentElement?.dispatchEvent(event);
      return { store, prevented: event.defaultPrevented };
    };
    const copy = fire('copy');
    expect(copy.store.get('text/plain')).toBe('كَتَبَ');
    expect(copy.store.get('text/html')).toBe('كَتَبَ');
    expect(copy.prevented).toBe(true);
    const drag = fire('dragstart');
    expect(drag.store.get('text/plain')).toBe('كَتَبَ');
    expect(drag.prevented).toBe(false);
    expect(counters).toEqual({ copy: 1, drag: 1 });
    unbind();
    expect(fire('copy').store.size).toBe(0);
  });
});

describe('05D و05F و05G: تحديث GitHub الحي وإعادة تحميل العارض', () => {
  const snapshotText = (response: SnapshotResponse | undefined, index: number): string => {
    if (!response?.ok) return '';
    const flat = (nodes: readonly unknown[]): string => nodes.map((n) => (typeof n === 'string' ? n : flat((n as { c?: unknown[] }).c ?? []))).join('');
    return flat(response.snapshot.sections[index]?.nodes ?? []).trim();
  };

  it('05D: نص مختلف: الصفحة تحمل ما كتبه GitHub، والعارض بعد التحديث يعرضه', () => {
    const { doc, manager, request } = mountLive();
    const gh = GH(doc);
    request();
    gh.update('c1', 'النَّصُّ الجَدِيدُ المُحَدَّثُ');
    const after = request();
    expect(snapshotText(after, 0)).toBe('النَّصُّ الجَدِيدُ المُحَدَّثُ');
    manager.stop();
    expect(gh.text('c1')).toBe('النَّصُّ الجَدِيدُ المُحَدَّثُ');
  });

  it('05F: نص يساوي المنزوع: يبقى في الصفحة كما كتبه GitHub، ويعرضه العارض ولو أُظهر التشكيل', () => {
    const { doc, manager, request } = mountLive();
    const gh = GH(doc);
    const original = gh.text('c4');
    gh.update('c4', stripDiacritics(original));
    const response = request();
    manager.stop();
    expect(gh.text('c4')).toBe(stripDiacritics(original));
    const { article, view } = reader((response as { snapshot: ReadingSnapshot }).snapshot);
    view.hide();
    view.show();
    expect(article.querySelectorAll('.markdown-body')[3]?.textContent?.trim()).toBe(stripDiacritics(original));
  });

  it('05G: ثلاث كتابات × ستة تراتيب × أربعة مواضع لإيقاف الميزة: النص النهائي آخر ما كتبه GitHub، ولقطة ما قبل الإيقاف تطابق الصفحة', () => {
    const writes: Array<readonly [string, string]> = [
      ['c5', 'كتابة أولى من GitHub'],
      ['c6', 'كتابة ثانية من GitHub'],
      ['c5', 'كتابة ثالثة من GitHub على العقدة نفسها'],
    ];
    const perms = (arr: number[]): number[][] => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
    let runs = 0;
    for (const order of perms([0, 1, 2])) {
      for (let at = 0; at <= order.length; at += 1) {
        const { doc, manager, request } = mountLive();
        const gh = GH(doc);
        const expected: Record<string, string> = { c5: gh.text('c5'), c6: gh.text('c6'), c7: gh.text('c7') };
        order.forEach((w, i) => {
          if (i === at) {
            expect(snapshotText(request(), 4)).toBe(gh.text('c5'));
            manager.stop();
          }
          const [id, text] = writes[w] as readonly [string, string];
          gh.update(id, text);
          expected[id] = text;
        });
        if (at === order.length) {
          expect(snapshotText(request(), 5)).toBe(gh.text('c6'));
          manager.stop();
        }
        expect({ c5: gh.text('c5'), c6: gh.text('c6'), c7: gh.text('c7') }).toEqual(expected);
        runs += 1;
      }
    }
    expect(runs).toBe(24);
  });
});

describe('واجهة العارض (05E: شريط التلميح)', () => {
  async function app(target: 'chromium' | 'firefox', response: SnapshotResponse | Error) {
    const area = new MemoryStorageArea();
    const store = await Store.open({ area, changes: area });
    const registry = new SettingsRegistry();
    defineModuleASettings(registry, [createReadingFeature({ api: () => null }), FONTS_FEATURE]);
    const settings = await SettingsStore.open(store, registry);
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'chrome-extension://mijhar/reader.html?tab=5', pretendToBeVisual: true });
    const doc = dom.window.document;
    const calls: unknown[] = [];
    const api = {
      tabs: {
        sendMessage: async (tabId: number, message: unknown) => {
          calls.push([tabId, message]);
          if (response instanceof Error) throw response;
          return response;
        },
      },
    } as unknown as Pick<ExtensionApi, 'tabs'>;
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, window: g.window };
    g.document = doc;
    g.window = dom.window;
    await act(async () => {
      render(<ReaderApp settings={settings} api={api} target={target} tabId={5} document={doc} />, doc.getElementById('app') as Element);
    });
    for (let i = 0; i < 5; i += 1) await act(deliver);
    return { doc, settings, calls, restore: () => Object.assign(g, saved) };
  }

  it('يطلب اللقطة من التبويب المصدر ويعرضها مخفية التشكيل افتراضًا مع تلميح البحث لهذا المتصفح، والمفتاح يظهره ويُحفظ', async () => {
    const { doc, settings, calls, restore } = await app('chromium', { ok: true, snapshot: liveSnapshot() });
    try {
      expect(calls).toEqual([[5, { type: READING_SNAPSHOT_MESSAGE }]]);
      const article = doc.querySelector('.reader-article') as Element;
      expect(DIACRITIC.test(article.textContent ?? '')).toBe(false);
      expect(article.textContent).toContain('npm install');
      expect(doc.querySelector('.reader-hint')?.textContent).toContain(SEARCH_HINTS.chromium);
      expect(doc.getElementById('mijhar-reader-styles')?.textContent).toContain('@font-face');
      await act(() => (doc.getElementById('mj-hide-diacritics') as HTMLInputElement).click());
      for (let i = 0; i < 3; i += 1) await act(deliver);
      expect(DIACRITIC.test(article.textContent ?? '')).toBe(true);
      expect(settings.get(READING_OPTIONS_KEY)).toEqual({ hideDiacritics: false });
    } finally {
      restore();
    }
  });

  it('Firefox: تلميح Match Diacritics؛ وتعذّر الوصول إلى المصدر رسالة واضحة', async () => {
    const { doc, restore } = await app('firefox', new Error('Could not establish connection'));
    try {
      expect(doc.querySelector('.reader-hint')?.textContent).toContain('Match Diacritics');
      expect(doc.querySelector('[role="alert"]')?.textContent).toContain('تعذّر الوصول إلى الصفحة الأصلية');
    } finally {
      restore();
    }
  });
});
