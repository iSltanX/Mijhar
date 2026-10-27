// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/octo/demo/issues/1"}
// معالجة تدقيقي 2026-10-27 — الدفعة D: الخصوصية والتخزين والترجمة وRTL والإتاحة وبقية البنود.
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ModuleRegistry, MutationRecorder, PageDetector, SelectorsRegistry } from '../../src/core';
import { createShadowHost } from '../../src/core/ui-host/shadow';
import { MemoryStorageArea, Store } from '../../src/core/storage';
import { scanText, mergeOverlapping } from '../../src/modules/e/privacy-check/scan';
import { sanitize } from '../../src/modules/e/context/sanitize';
import { selectionTarget } from '../../src/modules/c/ui/selection';
import { relationTo } from '../../src/modules/g/notes/targets';
import { pageInfoFromUrl } from '../../src/shared/page/page-info';
import { realign } from '../../src/modules/a/reading/reader/view';
import { locateEntry } from '../../src/modules/b/search/locate';
import { ExplainOverlay } from '../../src/modules/b/card/overlay';
import { GLOSSARY_ENTRIES } from '../../src/modules/b/card/entries';
import { scanDocsFolder } from '../../src/modules/h/readme-detector/docs-scan';
import { planImport } from '../../src/modules/g/export/plan';
import { HIJRI_FEATURE } from '../../src/modules/a/hijri/feature';
import { createModuleA } from '../../src/modules/a/scope/module';
import { DIRECTION_FEATURE } from '../../src/modules/a/direction/feature';
import { DirectionProcessor, DIR_ATTR } from '../../src/modules/a/direction/processor';
import { DIRECTION_SELECTORS } from '../../src/modules/a/direction/selectors';
import { ManagedTranslationEngine } from '../../src/modules/c/model-manager/managed-engine';
import { detectProtected } from '../../src/modules/c/masking/detect';
import { isSnapshot } from '../../src/modules/a/reading/snapshot';
import { AnchorStore } from '../../src/modules/g/anchor/store';
import { NotesBroker } from '../../src/modules/g/notes/broker';
import { NOTES_WRITE_MESSAGE } from '../../src/modules/g/notes/writer';
import type { NotesWriter } from '../../src/modules/g/notes/writer';
import { defaultAnalysisDeps } from '../../src/modules/d/analysis/controller';
import { gatedFetch } from '../../src/modules/e/provider/gate';
import type { GlossaryEntry } from '../../src/data/glossary/types';
import type { ExtensionModule } from '../../src/core';
import { fakeAccess } from '../modules/h/helpers';

const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
let manager: LifecycleManager | undefined;
function mount(modules: ExtensionModule[], detector = new PageDetector({ document, settleMs: 2 })): void {
  manager = new LifecycleManager({ registry: new ModuleRegistry(modules), detector, document, isEnabled: () => true });
  manager.start();
}
afterEach(() => {
  manager?.stop();
  manager = undefined;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-color-mode');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const FAKE_GH = `ghp_${'A1b2C3d4E5f6G7h8I9j0'}${'KlMnOpQrStUv'}`;
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln';

describe('GEMINI-013: كشف Bearer وعدّ الأسرار المتراكبة', () => {
  it('bearer بأي حالة أحرف يُرصد', () => {
    for (const header of [`authorization: bearer ${FAKE_JWT}abcdefgh`, `Authorization: BEARER abcdef0123456789abcdef0123456789`, `Authorization: Bearer abcdef0123456789abcdef`]) {
      expect(scanText(header).map((f) => f.patternId), header).toContain('bearer');
    }
  });

  it('«Bearer ghp_…» سرّ واحد: موضع واحد في التنبيه، وقناع واحد وعدّ واحد في التنقيح (mask وflag)', () => {
    const text = `Authorization: Bearer ${FAKE_GH}`;
    expect(scanText(text)).toHaveLength(2);
    expect(mergeOverlapping(scanText(text))).toHaveLength(1);
    const source = { kind: 'issue', url: 'https://github.com/o/r/issues/1', repo: 'o/r', number: 1, title: 'T', state: 'open', author: 'u', labels: [], description: text, comments: [], errorExcerpt: [], log: null, changes: null, missing: [] } as never;
    const masked = sanitize(source, [], { secrets: 'mask' });
    expect(masked.secrets.total).toBe(1);
    expect(masked.description).not.toContain(FAKE_GH);
    const flagged = sanitize(source, [], { secrets: 'flag' });
    expect(flagged.secrets.total).toBe(1);
    expect(flagged.description).toContain(FAKE_GH);
  });
});

describe('GEMINI-010: ترجمة المحدد لا تشمل الشيفرة', () => {
  const select = (node: Node, start: number, end: number): void => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  it('تحديد داخل pre/code أو [translate="no"]: لا هدف للترجمة؛ ونثر إنجليزي: هدف', () => {
    document.body.innerHTML = '<div class="markdown-body"><pre><code id="c">const value = computeResult(input);</code></pre><p id="p">This paragraph explains the change.</p><p translate="no" id="n">Keep this English text as is.</p><p id="i">Run <code id="ic">npm test --watch</code> now please.</p></div>';
    select(document.getElementById('c')!.firstChild!, 0, 20);
    expect(selectionTarget(document)).toBeNull();
    select(document.getElementById('n')!.firstChild!, 0, 20);
    expect(selectionTarget(document)).toBeNull();
    select(document.getElementById('ic')!.firstChild!, 0, 8);
    expect(selectionTarget(document)).toBeNull();
    select(document.getElementById('p')!.firstChild!, 0, 20);
    expect(selectionTarget(document)).not.toBeNull();
  });
});

describe('GEMINI-007: ملاحظة ملف لا تظهر على ملف آخر بالاسم نفسه في الفرع نفسه', () => {
  const note = (ref: string, path: string) => ({ id: 'n', text: 'x', tag: null, createdAt: 'a', updatedAt: 'a', target: { level: 'file', owner: 'acme', repo: 'repo', ref, path } }) as never;

  it('README.md على main لا يقابل main/packages/core/README.md، ويقابل الملف نفسه على فرع آخر', () => {
    expect(relationTo(note('main', 'README.md'), pageInfoFromUrl('https://github.com/acme/repo/blob/main/packages/core/README.md'))).toBeNull();
    expect(relationTo(note('main', 'README.md'), pageInfoFromUrl('https://github.com/acme/repo/blob/main/README.md'))).toBe('exact');
    expect(relationTo(note('main', 'README.md'), pageInfoFromUrl('https://github.com/acme/repo/blob/dev/README.md'))).toBe('other-ref');
    expect(relationTo(note('main', 'README.md'), pageInfoFromUrl('https://github.com/acme/repo/blob/feature/x/README.md'))).toBe('other-ref');
  });
});

describe('GEMINI-008: نسخ وضع القراءة يحفظ الحركات بعد حدّ وسم', () => {
  it('تسلسل يبدأ بحركة: تُحفظ كل الحركات', () => {
    expect(realign('تب الكتاب', 'َتَبَ الكِتَابَ')).toBe('َتَبَ الكِتَابَ');
    expect(realign('كتب', 'كَتَبَ')).toBe('كَتَبَ');
  });
});

describe('GEMINI-011: «أرني موضعه» يفاضل بين مدخلات القاموس كلها', () => {
  const entry = (id: string): GlossaryEntry => ({ id, en: 'New', ar: id, category: 'Navigation', kind: 'element', safety: 'آمن', permission: 'Read', where: 'Repo', levels: { summary: 'أ', impact: 'أ', example: 'أ' }, signature: { labels: ['New'], roles: ['button'], pages: ['any'] } }) as unknown as GlossaryEntry;

  it('عنصر يتنازعه مدخلان بالتساوي: ليس موضعًا لأحدهما؛ ومدخل وحيد بتسميته: موضعه', () => {
    document.body.innerHTML = '<button type="button">New</button>';
    const a = entry('entry-a');
    const b = entry('entry-b');
    const page = { type: 'repo' as const, href: 'https://github.com/org/repo' };
    expect(locateEntry(a, document, page, [a, b]).result.status).not.toBe('found');
    expect(locateEntry(a, document, page, [a]).result.status).toBe('found');
  });
});

describe('GEMINI-012: البطاقة المفتوحة تبقى حين يخرج عنصرها من النافذة بالتمرير', () => {
  it('عنصر فوق حافة النافذة والبطاقة مفتوحة: تبقى البطاقة، ويغلقها Escape', async () => {
    const target = document.createElement('button');
    target.textContent = 'x';
    document.body.append(target);
    const glossary = GLOSSARY_ENTRIES.find((e) => e.kind === 'element' && e.signature)!;
    const container = document.createElement('div');
    document.body.append(container);
    const onClose = vi.fn();
    const props = { matches: [{ element: target, entry: glossary, score: 1, label: 'x' }], viewport: { width: 1000, height: 800 }, openIndex: 0, active: true, onOpen: () => {}, onClose, onStop: () => {} };
    act(() => render(h(ExplainOverlay, { ...props, rectOf: () => ({ left: 100, top: 100, width: 28, height: 28 }) }), container));
    expect(container.querySelector('.card')).not.toBeNull();
    act(() => render(h(ExplainOverlay, { ...props, rectOf: () => ({ left: 100, top: -60, width: 28, height: 28 }) }), container));
    expect(container.querySelector('.badge')).toBeNull();
    const card = container.querySelector<HTMLElement>('.card');
    expect(card).not.toBeNull();
    act(() => void card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledWith('keyboard');
    render(null, container);
  });
});

describe('GEMINI-014: ما وُجد في docs/ لا يُسقط حين لا يكتمل فحص المجلدات', () => {
  const listing = [
    { name: 'README.ar.md', path: 'docs/README.ar.md', type: 'file', html_url: 'https://github.com/o/r/blob/main/docs/README.ar.md' },
    // مجلدات لغة يطابقها الفحص (ar وarabic وar-xx): ثلاثة بعد قائمة docs تتجاوز حد الطلبات الثلاثة.
    { name: 'ar', path: 'docs/ar', type: 'dir' },
    { name: 'arabic', path: 'docs/arabic', type: 'dir' },
    { name: 'ar-sa', path: 'docs/ar-sa', type: 'dir' },
  ];

  it('README عربي في docs/ ثم تعذّر مجلد لغة: «وُجد» مع بيان عدم الاكتمال', async () => {
    const access = fakeAccess((path) => (path.endsWith('/contents/docs') ? { body: listing } : { status: 500 }));
    const result = await scanDocsFolder(access, 'o', 'r');
    expect(result.state).toBe('found');
    if (result.state === 'found') {
      expect(result.matches.map((m) => m.name)).toContain('README.ar.md');
      expect(result.partial).toBeTruthy();
    }
  });

  it('وبنفاد حد الطلبات قبل فتح كل المجلدات: «وُجد» كذلك؛ وبلا شيء موجود يبقى «لم يكتمل»', async () => {
    const access = fakeAccess((path) => (path.endsWith('/contents/docs') ? { body: listing } : { body: [] }));
    const result = await scanDocsFolder(access, 'o', 'r');
    expect(result.state).toBe('found');
    const empty = fakeAccess((path) => (path.endsWith('/contents/docs') ? { body: listing.slice(1) } : { status: 500 }));
    expect((await scanDocsFolder(empty, 'o', 'r')).state).toBe('incomplete');
  });
});

describe('GEMINI-015: الاستيراد بالدمج لا يُبقي مرساة يتيمة', () => {
  it('نسخة أحدث من الملاحظة صارت على المستودع بلا مرساة: تُزال مرساتها المحلية', () => {
    const lineNote = { id: 'n1', text: 'old', tag: null, createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', target: { level: 'line', view: 'blob', owner: 'org', repo: 'repo', ref: 'main', path: 'src/a.ts', start: 10, end: 10 } };
    const anchor = { version: 1, noteId: 'n1', owner: 'org', repo: 'repo', path: 'src/a.ts', ref: 'main', commitSha: null, branchUrl: 'https://github.com/org/repo/blob/main/src/a.ts#L10', permalinkUrl: null, start: 10, end: 10, lineCount: 1, privateRepo: false, fingerprint: { targetHash: 'h', beforeHashes: [], afterHashes: [], length: 1, indent: 0 }, snippet: null, capturedAt: '2026-04-01T00:00:00Z' };
    const current = { notes: new Map([['n1', lineNote]]), anchors: new Map([['n1', anchor]]), bookmarks: new Map(), salt: null, names: { notes: ['note:n1'], anchors: ['anchor:n1'], bookmarks: [] }, corrupted: { notes: 0, anchors: 0, bookmarks: 0 } };
    const bundle = { schema: 'mijhar-g-export', version: 1, exportedAt: '2026-04-02T00:00:00Z', scope: { kind: 'all' }, includeAnchors: true, counts: { notes: 1, anchors: 0, bookmarks: 0 }, salt: null, notes: [{ ...lineNote, text: 'new', updatedAt: '2026-04-02T00:00:00Z', target: { level: 'repo', owner: 'org', repo: 'repo' } }], anchors: [], bookmarks: [] };
    const plan = planImport(current as never, bundle as never, 'merge');
    expect(plan.summary.notes.updated).toBe(1);
    expect(plan.removes.some((name) => name.includes('n1') && name.includes('anchor'))).toBe(true);
    expect(plan.summary.anchors.removed).toBe(1);
    // ملاحظة سطر ما زالت سطرًا ولم يحمل الملف مرساتها (تصدير بلا مراسٍ): تبقى المرساة المحلية.
    const keep = planImport(current as never, { ...bundle, notes: [{ ...lineNote, text: 'new', updatedAt: '2026-04-02T00:00:00Z' }] } as never, 'merge');
    expect(keep.removes).toEqual([]);
  });
});

describe('GEMINI-016: تلميح التاريخ الهجري بلوحة المفاتيح وفي النوافذ الضيقة', () => {
  it('المفتوح بالتركيز لا يغلقه mouseout غير متعلق، ولا يخرج عن يسار نافذة ضيقة', async () => {
    document.body.innerHTML = '<main><p>نص <relative-time id="t" datetime="2026-10-27T10:00:00Z" tabindex="0">Oct 27</relative-time> ثم <span id="other">آخر</span></p></main>';
    vi.stubGlobal('innerWidth', 200);
    mount([createModuleA({ features: [HIJRI_FEATURE] })]);
    await wait(10);
    const time = document.getElementById('t')!;
    time.focus();
    time.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const host = () => document.querySelector<HTMLElement>('[data-mijhar-host="a.hijri"]');
    expect(host()?.hasAttribute('data-open')).toBe(true);
    document.getElementById('other')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(host()?.hasAttribute('data-open')).toBe(true);
    expect(parseFloat(host()!.style.getPropertyValue('--mj-left'))).toBeGreaterThanOrEqual(8);
    time.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host()?.hasAttribute('data-open')).toBe(false);
  });
});

describe('GEMINI-018: السمة تتبع تبديل GitHub بين الفاتح والداكن', () => {
  it('مضيف أُنشئ فاتحًا يصير داكنًا بتبديل data-color-mode، وauto يعيده لتفضيل النظام؛ والسمة المفروضة لا تتغير', async () => {
    document.documentElement.setAttribute('data-color-mode', 'light');
    const follow = createShadowHost(document, { name: 'audit.follow' });
    const fixed = createShadowHost(document, { name: 'audit.fixed', theme: 'light' });
    document.body.append(follow.host, fixed.host);
    expect(follow.root.getAttribute('data-theme')).toBe('light');
    document.documentElement.setAttribute('data-color-mode', 'dark');
    await wait(0);
    expect(follow.root.getAttribute('data-theme')).toBe('dark');
    expect(fixed.root.getAttribute('data-theme')).toBe('light');
    document.documentElement.setAttribute('data-color-mode', 'auto');
    await wait(0);
    expect(follow.root.hasAttribute('data-theme')).toBe(false);
  });
});

describe('GEMINI-019: حد إدخال الفقرة بعد تنزيل الحزمة ليس امتلاء قرص', () => {
  it('QuotaExceededError والحزمة صارت موجودة: لا «مساحة التخزين» ولا سحب للموافقة', async () => {
    let calls = 0;
    const managed = new ManagedTranslationEngine(
      { id: 'translator-api', label: 'Translator API', availability: async () => ({ state: 'ready' }), translate: async () => { calls += 1; const err = new Error('Input too large'); err.name = 'QuotaExceededError'; throw err; } },
      async () => (calls === 0 ? 'downloadable' : 'available'),
      { stallMs: 0 },
    );
    expect((await managed.availability()).state).toBe('consent');
    managed.grantConsent();
    const error = await managed.translate('very long first paragraph').catch((e: unknown) => e);
    expect((error as { code?: string }).code).not.toBe('storage');
    expect((await managed.availability()).state).toBe('ready');
  });
});

describe('GEMINI-020: قوائم عربية بعناصر rtl أصلية، وترقيم بعد الأوامر، ورابط القارئ', () => {
  it('قائمة كل عناصرها عربية وأحدها dir="rtl": تُقلب القائمة', () => {
    document.body.innerHTML = '<div class="markdown-body"><ul id="l"><li dir="rtl">البند الأول بالعربية</li><li>البند الثاني بالعربية</li></ul></div>';
    new DirectionProcessor({ document, selectors: new SelectorsRegistry(DIRECTION_SELECTORS), mutations: new MutationRecorder('a.direction') }).scan(document);
    expect(document.getElementById('l')!.getAttribute(DIR_ATTR)).toBe('rtl');
  });

  it('«(git checkout --branch=main).»: الأمر بلا القوس والنقطة', () => {
    const text = 'Run (git checkout --branch=main).';
    const cmd = detectProtected(text, []).find((d) => d.type === 'CMD')!;
    expect(text.slice(cmd.start, cmd.end)).toBe('git checkout --branch=main');
  });

  it('لقطة القارئ برابط غير http(s) مرفوضة', () => {
    const snap = { version: 1, url: 'https://github.com/o/r', title: 't', sections: [], truncated: false };
    expect(isSnapshot(snap)).toBe(true);
    expect(isSnapshot({ ...snap, url: 'javascript:alert(1)' })).toBe(false);
    expect(isSnapshot({ ...snap, url: 'data:text/html,x' })).toBe(false);
  });
});

describe('CODEX-008: اتجاه RTL يُراجع بعد تعديل النص', () => {
  it('عنوان عربي ← إنجليزي ← عربي على العقدة نفسها، والنص وdir الأصلي كما هما', async () => {
    document.body.innerHTML = '<main><h1 data-testid="issue-title" dir="auto">هذا عنوان عربي واضح</h1></main>';
    mount([createModuleA({ features: [DIRECTION_FEATURE] })]);
    const title = document.querySelector('h1')!;
    await wait(5);
    const initial = title.getAttribute(DIR_ATTR);
    title.firstChild!.textContent = 'An entirely English issue title';
    await wait();
    expect(title.getAttribute(DIR_ATTR)).toBeNull();
    expect(title.getAttribute('dir')).toBe('auto');
    title.firstChild!.textContent = 'عاد العنوان عربيًا من جديد';
    await wait();
    expect(title.getAttribute(DIR_ATTR)).toBe(initial);
    expect(title.textContent).toBe('عاد العنوان عربيًا من جديد');
  });

  it('عنوان بلا dir: يُزال القلب حين يصير إنجليزيًا ويعود حين يعود عربيًا', async () => {
    document.body.innerHTML = '<main><h1 data-testid="issue-title">هذا عنوان عربي واضح</h1></main>';
    mount([createModuleA({ features: [DIRECTION_FEATURE] })]);
    const title = document.querySelector('h1')!;
    expect(title.getAttribute(DIR_ATTR)).toBe('rtl');
    title.firstChild!.textContent = 'An entirely English issue title';
    await wait();
    expect(title.getAttribute(DIR_ATTR)).toBeNull();
    title.firstChild!.textContent = 'عاد العنوان عربيًا من جديد';
    await wait();
    expect(title.getAttribute(DIR_ATTR)).toBe('rtl');
    manager?.stop();
    manager = undefined;
    expect(title.hasAttribute(DIR_ATTR)).toBe(false);
  });

  it('قائمة مقلوبة صار أحد عناصرها إنجليزيًا: تُعاد القائمة ويبقى العنصر العربي مقلوبًا', async () => {
    document.body.innerHTML = '<main><div class="markdown-body"><ul id="l"><li id="a">البند الأول بالعربية</li><li id="b">البند الثاني بالعربية</li></ul></div></main>';
    mount([createModuleA({ features: [DIRECTION_FEATURE] })]);
    const list = document.getElementById('l')!;
    expect(list.getAttribute(DIR_ATTR)).toBe('rtl');
    document.getElementById('b')!.firstChild!.textContent = 'Second item in English only';
    await wait();
    expect(list.getAttribute(DIR_ATTR)).toBeNull();
    expect(document.getElementById('a')!.getAttribute(DIR_ATTR)).toBe('rtl');
  });
});

describe('CODEX-007: ملح البصمات واحد لسياقين متسابقين', () => {
  it('مخزنان يكتبان عبر الخلفية نفسها ويبدآن بلا ملح: الملح نفسه لكليهما، وملح موجود لا يتغير', async () => {
    const area = new MemoryStorageArea();
    const background = await Store.open({ area, changes: area, locks: null });
    const broker = NotesBroker.forStore(background);
    const writer = { ensureSalt: async () => (await broker.handle({ type: NOTES_WRITE_MESSAGE, op: 'salt-ensure' }) as { value: string }).value } as unknown as NotesWriter;
    const one = await Store.open({ area, changes: area, migrate: false, locks: null });
    const two = await Store.open({ area, changes: area, migrate: false, locks: null });
    const first = await AnchorStore.open(one, { writer });
    const second = await AnchorStore.open(two, { writer });
    try {
      const salts = await Promise.all([first.ensureSalt(), second.ensureSalt()]);
      expect(salts[0]).toMatch(/^[0-9a-f]{64}$/);
      expect(salts[1]).toBe(salts[0]);
      expect(await first.salt()).toBe(salts[0]);
      expect(await second.ensureSalt()).toBe(salts[0]);
    } finally {
      first.dispose();
      second.dispose();
      one.dispose();
      two.dispose();
      background.dispose();
    }
  });
});

describe('CODEX-009: قارئ حد الأسطر لا يترك مستمعي تخزين بعد انتهاء الدورة', () => {
  it('ثلاثون دورة تستعمل القارئ ثم الإيقاف: يعود عدد المستمعين إلى الصفر، والإعداد يُقرأ حيًّا أثناء الدورة', async () => {
    const area = new MemoryStorageArea({ initial: { 'mijhar:meta': { schemaVersion: 1, createdAt: '2026-10-27T00:00:00Z' } } });
    const listeners = new Set<unknown>();
    vi.stubGlobal('browser', { storage: { local: area, onChanged: { addListener: (l: unknown) => void listeners.add(l), removeListener: (l: unknown) => void listeners.delete(l) } } });
    document.body.innerHTML = '<main><h1 data-testid="issue-title">Test issue</h1></main>';
    const detector = new PageDetector({ document, observeDom: false });
    const limits: number[] = [];
    mount([{ id: 'audit-line-limit', title: 'اختبار', pages: '*', mount(ctx) { const deps = defaultAnalysisDeps(ctx.signal); limits.push(deps.lineLimit!()); } }], detector);
    await wait(5);
    for (let i = 2; i <= 30; i += 1) {
      window.history.pushState({}, '', `/octo/demo/issues/${i}`);
      detector.check(true);
      await wait(2);
    }
    expect(listeners.size).toBeLessThanOrEqual(1);
    manager?.stop();
    manager = undefined;
    await wait(5);
    expect(listeners.size).toBe(0);
    expect(area.writes).toBe(0);
    window.history.replaceState({}, '', '/octo/demo/issues/1');
  });

  it('إيقاف الوحدة قبل اكتمال فتح التخزين: تُطلق موارده فور اكتماله', async () => {
    const area = new MemoryStorageArea({ initial: { 'mijhar:meta': { schemaVersion: 1, createdAt: '2026-10-27T00:00:00Z' } } });
    const listeners = new Set<unknown>();
    vi.stubGlobal('browser', { storage: { local: area, onChanged: { addListener: (l: unknown) => void listeners.add(l), removeListener: (l: unknown) => void listeners.delete(l) } } });
    const controller = new AbortController();
    const deps = defaultAnalysisDeps(controller.signal);
    deps.lineLimit!();
    controller.abort();
    await wait(10);
    expect(listeners.size).toBe(0);
  });
});

describe('تحصين بوابة المزوّد: لا تُتبع التحويلات', () => {
  it('طلب المزوّد يُرسل بـredirect: error ولا يحمل اعتمادات', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    const send = gatedFetch({ host: 'generativelanguage.googleapis.com', origin: 'https://generativelanguage.googleapis.com/*' }, { permissions: { contains: async () => true } as never, fetch: fetch as never });
    await send('/v1beta/models', { method: 'GET', headers: { 'x-goog-api-key': 'SYNTHETIC-KEY' } });
    expect(fetch).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models', expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
  });
});
