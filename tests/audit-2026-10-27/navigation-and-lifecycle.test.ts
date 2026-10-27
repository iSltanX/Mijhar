// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/octo/demo/issues/1"}
// معالجة تدقيقي 2026-10-27 — الدفعة B: التنقل وهوية الصفحة ودورة الحياة غير المتزامنة.
//  - GEMINI-001: تنقل أُعلن ولم يصل DOM صفحته (بقي عنصر هوية الصفحة السابقة) يُعاد إعلانه حين يصل خلال النافذة، ولا إعادة لإعادة رسم عادية
//    (ولا لإعادة رسم عنصر الهوية بمحتواه نفسه خلال النافذة بعد تنقل وصل DOM فيه قبل الرابط: مراجعة 2026-10-28، الحالة أ6).
//  - GEMINI-002: بيانات react-app.embeddedData الباقية من ملف سابق لا تطغى على رابط الملف الحالي.
//  - CODEX-004: ترجمة فقرة تغيّرت أو أُزيلت أثناء انتظار المحرك لا تُعرض ولا تخفي النص الجديد، والجلسة لا تبقى «جارية».
//  - GEMINI-009: «الترجمة فقط» لا تخفي الكتل المتداخلة في اقتباس، وتخفي النص المباشر بعد قائمة فرعية.
//  - CODEX-005: زر الاتجاه وزر المساعد يتبعان الحقل الحالي، ويعودان إلى شريط حي أُزيلا منه، ولا يتكرران عند وصول الشريط متأخرًا.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../src/core';
import type { ExtensionModule, ModuleContext } from '../../src/core';
import { LATE_DOM_WINDOW_MS } from '../../src/core/detector/detector';
import { createModuleA } from '../../src/modules/a/scope/module';
import { createEditorFeature } from '../../src/modules/a/editor/feature';
import { createComposerModule } from '../../src/modules/f/composer/module';
import { TranslationSession } from '../../src/modules/c/ui/session';
import type { TranslationService } from '../../src/modules/c/ui/service';
import { TranslationBar } from '../../src/modules/c/ui/bar';
import { enrichFromDocument, pageInfoFromUrl } from '../../src/shared/page/page-info';
import { render, h } from 'preact';

let manager: LifecycleManager | undefined;
const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
function mount(modules: ExtensionModule[], settleMs = 2): void {
  manager = new LifecycleManager({ registry: new ModuleRegistry(modules), detector: new PageDetector({ document, settleMs }), document, isEnabled: () => true });
  manager.start();
}
afterEach(() => {
  manager?.stop();
  manager = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
  window.history.replaceState({}, '', '/octo/demo/issues/1');
});

describe('GEMINI-001: إعلان سبق DOM التنقل يُصحَّح حين يصل', () => {
  function track() {
    window.history.replaceState({}, '', '/org/repo/issues/1');
    document.body.innerHTML = '<main><div class="gh-header-show"><h1 id="issue-title">Issue 1</h1></div></main>';
    const detector = new PageDetector({ document });
    const seen: Array<{ path: string; title: string | null }> = [];
    detector.subscribe((state) => void seen.push({ path: new URL(state.href).pathname, title: document.getElementById('issue-title')?.textContent ?? null }));
    detector.start();
    return { detector, seen, main: document.querySelector('main')! };
  }

  it('المسار يتغير ثم مؤشر تحميل في main ثم يصل DOM الصفحة الثانية: إعلان ثانٍ على DOM الجديد', async () => {
    vi.useFakeTimers();
    const { detector, seen, main } = track();
    window.history.pushState({}, '', '/org/repo/issues/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    const spinner = document.createElement('div');
    spinner.textContent = 'Loading...';
    main.appendChild(spinner);
    await vi.advanceTimersByTimeAsync(150);
    // الإعلان المبكر نفسه باقٍ (DOM الصفحة الأولى ما زال ظاهرًا)…
    expect(seen.at(-1)).toEqual({ path: '/org/repo/issues/2', title: 'Issue 1' });
    main.innerHTML = '<div class="gh-header-show"><h1 id="issue-title">Issue 2</h1></div>';
    await vi.advanceTimersByTimeAsync(250);
    // …ثم يُعاد الإعلان حين يصل DOM الصفحة الثانية، فتُركَّب الوحدات عليه.
    expect(seen.at(-1)).toEqual({ path: '/org/repo/issues/2', title: 'Issue 2' });
    expect(seen).toHaveLength(3);
    detector.stop();
  });

  it('إعادة رسم داخل الصفحة نفسها (بلا تنقل) لا تعيد الإعلان، ولا بعد انقضاء النافذة', async () => {
    vi.useFakeTimers();
    const { detector, seen, main } = track();
    main.innerHTML = '<div class="gh-header-show"><h1 id="issue-title">Issue 1 (re-render)</h1></div>';
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toHaveLength(1);
    // تنقل مبكر ثم وصول DOM بعد النافذة: لا إعادة تركيب متأخرة (تتكفل بها سطوح keepAttached).
    window.history.pushState({}, '', '/org/repo/issues/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    main.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(150);
    expect(seen).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(LATE_DOM_WINDOW_MS + 10);
    main.innerHTML = '<div class="gh-header-show"><h1 id="issue-title">Issue 2</h1></div>';
    await vi.advanceTimersByTimeAsync(300);
    expect(seen).toHaveLength(2);
    detector.stop();
  });

  it('DOM وصل قبل الرابط وبقي عنصر الهوية، ثم أعادت الصفحة رسمه بمحتواه نفسه بلا تنقل خلال النافذة: لا إعادة تركيب، ولوحة المساعد وحالتها باقية', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/org/repo/issues/1');
    document.body.innerHTML =
      '<main><div data-testid="issue-viewer-issue-container"><h1 data-testid="issue-title">Issue 1</h1></div><form><markdown-toolbar for="new_comment_field"></markdown-toolbar><textarea id="new_comment_field"></textarea></form></main>';
    const reconciles: string[] = [];
    manager = new LifecycleManager({
      registry: new ModuleRegistry([createComposerModule({ debounceMs: 2 })]),
      detector: new PageDetector({ document, settleMs: 2 }),
      document,
      isEnabled: () => true,
      onReconcile: (result) => void reconciles.push(new URL(result.page.href).pathname),
    });
    manager.start();
    await vi.advanceTimersByTimeAsync(50);
    const container = document.querySelector('[data-testid="issue-viewer-issue-container"]')!;
    // مسار «DOM أولًا» (تبويبات طلب الدمج في T-1.2): React يضع محتوى الصفحة الجديدة في العقدة نفسها ثم يغيّر الرابط، فيُعلن التنقل على DOM الجديد.
    container.querySelector('h1')!.textContent = 'Issue 2';
    await vi.advanceTimersByTimeAsync(10);
    window.history.pushState({}, '', '/org/repo/issues/2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(50);
    expect(reconciles).toEqual(['/org/repo/issues/1', '/org/repo/issues/2']);
    // المستخدم يكتب في حقل GitHub ويفتح المساعد ويكتب في أحد حقوله.
    const field = document.querySelector<HTMLTextAreaElement>('#new_comment_field')!;
    field.value = 'مسودة المستخدم';
    document.querySelector('[data-mijhar-host="f.composer.button"]')!.shadowRoot!.querySelector('button')!.click();
    await vi.advanceTimersByTimeAsync(20);
    const panel = document.querySelector('[data-mijhar-host="f.composer.panel"]')!;
    expect(panel).not.toBeNull();
    const actual = panel.shadowRoot!.getElementById('mj-composer-actual') as HTMLTextAreaElement;
    actual.value = 'Fixes the toggle';
    actual.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(20);
    // بعد 3 ثوانٍ (داخل LATE_DOM_WINDOW_MS) تستبدل الصفحة حاوية المشكلة بنسخة بمحتواها نفسه: إعادة رسم، لا وصول صفحة.
    await vi.advanceTimersByTimeAsync(3000);
    container.replaceWith(container.cloneNode(true));
    await vi.advanceTimersByTimeAsync(LATE_DOM_WINDOW_MS);
    expect(reconciles).toHaveLength(2);
    expect(document.querySelector('[data-mijhar-host="f.composer.panel"]')).toBe(panel);
    expect((panel.shadowRoot!.getElementById('mj-composer-actual') as HTMLTextAreaElement).value).toBe('Fixes the toggle');
    expect(field.value).toBe('مسودة المستخدم');
  });
});

describe('GEMINI-002: embeddedData القديمة لا تطغى على رابط الملف', () => {
  const embed = (layout: unknown): void => {
    document.body.innerHTML = `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({ payload: { codeViewLayoutRoute: layout } })}</script>`;
  };

  it('بعد التنقل إلى ملف آخر يبقى المسار من الرابط، لا من بيانات الملف السابق', () => {
    embed({ refInfo: { name: 'main' }, path: 'src/old-file.ts' });
    const info = enrichFromDocument(pageInfoFromUrl('https://github.com/org/repo/blob/main/src/new-file.ts'), document);
    expect(info.path).toBe('src/new-file.ts');
    expect(info.blobRest).toBe('main/src/new-file.ts');
  });

  it('وحين تصف البيانات الرابط نفسه تُعتمد لتقسيم فرع فيه شرطة مائلة', () => {
    embed({ refInfo: { name: 'feature/x' }, path: 'src/a.ts' });
    const info = enrichFromDocument(pageInfoFromUrl('https://github.com/org/repo/blob/feature/x/src/a.ts'), document);
    expect(info).toMatchObject({ ref: 'feature/x', path: 'src/a.ts', refKind: 'ref', blobRest: 'feature/x/src/a.ts' });
    embed({ refInfo: { name: 'feature/x' } });
    expect(enrichFromDocument(pageInfoFromUrl('https://github.com/org/repo/blob/feature/x/src/a.ts'), document)).toMatchObject({ ref: 'feature/x', path: 'src/a.ts' });
    // مرجع البيانات لا يسبق ما بعد blob/ في الرابط: تُهمل.
    expect(enrichFromDocument(pageInfoFromUrl('https://github.com/org/repo/blob/main/src/a.ts'), document)).toMatchObject({ ref: 'main', path: 'src/a.ts' });
  });
});

function sessionFixture(html: string, mode: 'both' | 'translation', translate?: (text: string) => Promise<string>) {
  document.body.innerHTML = `<main><article class="markdown-body">${html}</article></main>`;
  let context!: ModuleContext;
  mount([{ id: 'audit-session', title: 'اختبار', pages: '*', mount(ctx) { context = ctx; } }]);
  const pending: Array<(text: string) => void> = [];
  const service: TranslationService = {
    id: 'audit',
    label: 'اصطناعي',
    availability: async () => ({ state: 'ready' }),
    translate: translate ?? (async () => new Promise<string>((r) => void pending.push(r))),
  };
  const body = document.querySelector('article')!;
  const snapshots: unknown[] = [];
  const session = new TranslationSession(context, body, service, (s) => void snapshots.push(s), { mode });
  return { body, session, resolveNext: (text: string) => pending.shift()?.(text), translationsShown: () => [...body.querySelectorAll('mijhar-host')].map((h) => h.shadowRoot?.querySelector('.tr-body')?.textContent ?? null) };
}

describe('CODEX-004: صلاحية فقرة الترجمة بعد انتظار المحرك', () => {
  for (const mode of ['both', 'translation'] as const) {
    it(`(${mode}) تغيّر نص الفقرة أثناء الترجمة: لا ترجمة قديمة، ولا إخفاء للنص الجديد، والحالة منتهية وتطلب إعادة`, async () => {
      const f = sessionFixture('<p>The original old explanation has several English words.</p>', mode);
      const running = f.session.run();
      const p = f.body.querySelector('p')!;
      p.textContent = 'A new explanation with a completely different meaning.';
      f.resolveNext('الشرح الأصلي القديم');
      await running;
      expect(p.style.display).not.toBe('none');
      expect(f.translationsShown()).toEqual([]);
      expect(f.session.snapshot).toMatchObject({ phase: 'done', stale: 1 });
    });

    it(`(${mode}) إزالة الفقرة أثناء الترجمة: لا رفض غير معالج ولا «جارٍ» عالقة`, async () => {
      const f = sessionFixture('<p>The original old explanation has several English words.</p>', mode);
      const running = f.session.run();
      f.body.querySelector('p')!.remove();
      f.resolveNext('الشرح الأصلي القديم');
      await expect(running).resolves.toBeUndefined();
      expect(f.session.snapshot.phase).toBe('done');
      expect(f.session.snapshot.stale).toBe(1);
    });
  }

  it('استبدال الفقرة بعقدة جديدة أثناء الترجمة يُعامل كإزالة، وفقرة لم تتغير تُترجم كما كانت', async () => {
    const f = sessionFixture('<p id="a">First stable English paragraph here.</p><p id="b">Second English paragraph that will be replaced.</p>', 'translation');
    const running = f.session.run();
    f.resolveNext('الأولى');
    await wait(0);
    const b = f.body.querySelector('#b')!;
    const replacement = document.createElement('p');
    replacement.textContent = 'Second English paragraph that will be replaced.';
    b.replaceWith(replacement);
    f.resolveNext('الثانية القديمة');
    await running;
    expect(f.translationsShown()).toEqual(['الأولى']);
    expect(replacement.style.display).not.toBe('none');
    expect(f.session.snapshot).toMatchObject({ phase: 'done', done: 2, stale: 1 });
  });

  it('الشريط يعرض «أعد الترجمة» حين بقيت فقرات تغيّرت، وحين تعذّرت فقرة بعد ترجمة غيرها', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const props = { kind: 'readme' as const, unavailable: null, engineLabel: 'اصطناعي', onTranslate: () => {}, onCancel: () => {}, onMode: () => {} };
    render(h(TranslationBar, { ...props, snapshot: { phase: 'done', mode: 'both', total: 3, done: 3, kept: 0, skipped: 0, truncated: false, stale: 1 } }), container);
    expect(container.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(container.textContent).toContain('تغيّرت 1 أثناء الترجمة');
    render(h(TranslationBar, { ...props, snapshot: { phase: 'error', mode: 'both', total: 3, done: 1, kept: 0, skipped: 0, truncated: false, error: 'فشل مؤقت' } }), container);
    expect(container.querySelector('[data-action="retry"]')).not.toBeNull();
    render(h(TranslationBar, { ...props, snapshot: { phase: 'done', mode: 'both', total: 3, done: 3, kept: 0, skipped: 0, truncated: false, stale: 0 } }), container);
    expect(container.querySelector('[data-action="retry"]')).toBeNull();
    render(null, container);
  });
});

describe('GEMINI-009: «الترجمة فقط» مع المحتوى المتداخل', () => {
  const echo = async (text: string): Promise<string> => `AR(${text})`;
  const visible = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) if ((node as HTMLElement).style?.display === 'none') return false;
    return true;
  };

  it('اقتباس فيه نص مباشر وفقرة وشيفرة: تبقى الشيفرة وترجمة الفقرة ظاهرتين، ويُخفى النص المباشر وحده', async () => {
    const f = sessionFixture('<blockquote>Summary: of the change<p>Nested paragraph text here.</p><pre><code>npm test</code></pre></blockquote>', 'translation', echo);
    await f.session.run();
    const quote = f.body.querySelector('blockquote')!;
    expect(visible(quote)).toBe(true);
    expect(visible(quote.querySelector('pre')!)).toBe(true);
    const hosts = [...quote.querySelectorAll('mijhar-host')];
    expect(hosts.every((host) => visible(host))).toBe(true);
    expect(f.translationsShown()).toHaveLength(2);
    const wrapped = [...quote.querySelectorAll('mijhar-original')];
    expect(wrapped.map((w) => w.textContent?.trim())).toEqual(['Summary: of the change']);
    // الرجوع إلى الأصل يعيد الاقتباس حرفيًا.
    f.session.cancel();
    expect(quote.innerHTML).toBe('Summary: of the change<p>Nested paragraph text here.</p><pre><code>npm test</code></pre>');
  });

  it('عنصر قائمة فيه نص بعد قائمة فرعية: يُخفى النص قبلها وبعدها وتبقى الفرعية', async () => {
    const f = sessionFixture('<ul><li id="top">Intro words here<ul><li>Sub item text</li></ul>Trailing English text</li></ul>', 'translation', echo);
    await f.session.run();
    const top = f.body.querySelector('#top')!;
    const wrapped = [...top.children].filter((c) => c.localName === 'mijhar-original').map((w) => w.textContent?.trim());
    expect(wrapped).toEqual(['Intro words here', 'Trailing English text']);
    expect(visible(top.querySelector('ul')!)).toBe(true);
    f.session.cancel();
    expect(top.innerHTML).toBe('Intro words here<ul><li>Sub item text</li></ul>Trailing English text');
  });
});

describe('CODEX-005: أزرار المحرر تتبع الهدف الحالي', () => {
  const editorHosts = () => [...document.querySelectorAll('[data-mijhar-host="a.editor-toggle"]')];
  const composerHosts = () => [...document.querySelectorAll('[data-mijhar-host="f.composer.button"]')];

  it('textarea استُبدلت والشريط باقٍ (ثلاث مرات): زر واحد يبدّل اتجاه الحقل الحالي، والمسودة كما هي', async () => {
    document.body.innerHTML = '<main><form><markdown-toolbar for="comment-body"></markdown-toolbar><textarea id="comment-body"></textarea></form></main>';
    mount([createModuleA({ features: [createEditorFeature({ target: 'chromium' })] })]);
    for (let round = 0; round < 3; round += 1) {
      const old = document.querySelector('textarea')!;
      const replacement = document.createElement('textarea');
      replacement.id = old.id;
      replacement.value = `new draft ${round}`;
      old.replaceWith(replacement);
      await wait();
      expect(editorHosts()).toHaveLength(1);
      editorHosts()[0]!.shadowRoot!.querySelector('button')!.click();
      expect(replacement.getAttribute('dir')).toBe('rtl');
      expect(replacement.value).toBe(`new draft ${round}`);
    }
  });

  it('إزالة أزرار الإضافة وحدها من شريط حي: يعود زر الاتجاه وزر المساعد، كلٌّ مرة واحدة، وأزرار GitHub كما هي', async () => {
    document.body.innerHTML = '<main><form><markdown-toolbar for="comment-body"></markdown-toolbar><textarea id="comment-body"></textarea></form></main>';
    mount([createModuleA({ features: [createEditorFeature({ target: 'chromium' })] }), createComposerModule({ debounceMs: 2 })]);
    const toolbar = document.querySelector('markdown-toolbar')!;
    expect(toolbar.querySelectorAll('mijhar-host')).toHaveLength(2);
    const github = document.createElement('button');
    toolbar.replaceChildren(github);
    await wait();
    expect(toolbar.querySelectorAll('[data-mijhar-host="a.editor-toggle"]')).toHaveLength(1);
    expect(toolbar.querySelectorAll('[data-mijhar-host="f.composer.button"]')).toHaveLength(1);
    expect(toolbar.firstElementChild).toBe(github);
    // ثم إزالة أزرارنا وحدها بلا أي عنصر من GitHub.
    for (const host of [...toolbar.querySelectorAll('mijhar-host')]) host.remove();
    await wait();
    expect(toolbar.querySelectorAll('mijhar-host')).toHaveLength(2);
  });

  it('وصول الشريط بعد زر المساعد الاحتياطي: يبقى زر واحد للحقل (في الشريط)، ويفتح المساعد للحقل نفسه', async () => {
    document.body.innerHTML = '<main><form><textarea id="issue_body" name="issue[body]"></textarea></form></main>';
    mount([createComposerModule({ debounceMs: 2 })]);
    const field = document.querySelector('textarea')!;
    expect(composerHosts()).toHaveLength(1);
    const toolbar = document.createElement('markdown-toolbar');
    toolbar.setAttribute('for', field.id);
    field.parentElement!.insertBefore(toolbar, field);
    await wait();
    expect(composerHosts()).toHaveLength(1);
    expect(composerHosts()[0]!.parentElement).toBe(toolbar);
    composerHosts()[0]!.shadowRoot!.querySelector('button')!.click();
    await wait(5);
    expect(document.querySelector('[data-mijhar-host="f.composer.panel"]')).not.toBeNull();
  });
});
