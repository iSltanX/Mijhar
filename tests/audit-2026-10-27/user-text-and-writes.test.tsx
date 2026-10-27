// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/compare/main...feature"}
// معالجة تدقيقي 2026-10-27 — الدفعة A: حماية نص المستخدم ونتائج الكتابة غير المؤكدة.
//  - GEMINI-004: خطة «أدرج تحت عناوين القالب» تُحسب فهارسها على مسودة؛ نص تغيّر بعدها لا تُطبَّق عليه، والمعاينة تتبع الحقل.
//  - GEMINI-017: لوحة المساعد على Issue Form تأخذ التركيز عند فتحها فيبلغها Escape.
//  - GEMINI-005: انقطاع أو خطأ خادم بعد إرسال خطوة كتابة «غير مؤكد» في الملخص والجدول معًا، وما بعدها «لم يُرسل».
//  - CODEX-006: حد الطلبات (403 ثانوي أو 429 أو نفاد) ليس نقص صلاحيات، ويُحترم Retry-After فلا إرسال قبله.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionService, writeRateLimit } from '../../src/modules/f/execution/service';
import { planFill } from '../../src/modules/f/template';
import { ROOT, click, field, flush, loadHtml, mountComposer, panelHost, panelRoot, triggerFor } from '../modules/f/composer/helpers';
import type { Live } from '../modules/f/composer/helpers';
import { ExecutionPath } from '../../src/modules/f/execution';
import type { ExecutionDeps, PathPage } from '../../src/modules/f/execution';
import { trustedClick } from '../shared/trusted-click';
import { BASE_SHA, OWNER, README, REPO, execSystem } from '../modules/f/execution/helpers';
import type { ExecSystemOptions } from '../modules/f/execution/helpers';

const TEMPLATES = path.join(ROOT, 'fixtures/templates');
const go = (url: string): void => window.history.replaceState({}, '', url);
let live: Live | null = null;
afterEach(() => {
  live?.manager.stop();
  live = null;
  vi.unstubAllGlobals();
});

const need = <E extends Element = HTMLElement>(selector: string): E => {
  const el = panelRoot().querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر في اللوحة: ${selector}`);
  return el;
};
const typeInPanel = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(4);
  });
};

describe('GEMINI-004: لا تُطبَّق فهارس خطة قديمة على نص تغيّر والمساعد مفتوح', () => {
  it('الخطة تحمل المسودة التي حُسبت عليها', () => {
    const draft = '## Description\n\n## How to test\n';
    const plan = planFill(draft, { expected: '', actual: 'x', steps: '', environment: '', evidence: '' }, { kind: 'pr', language: 'en' });
    expect(plan.draft).toBe(draft);
  });

  it('تعديل الحقل بلا حدث input ثم «أدرج تحت عناوين القالب»: لا إدراج، والنص كما كتبه المستخدم، والمعاينة تُحدَّث، ثم الإدراج يقع تحت العناوين الصحيحة', async () => {
    loadHtml(path.join(TEMPLATES, 'markdown-template.html'));
    go('https://github.com/octo/demo/compare/main...feature');
    field('pull_request_body').value = fs.readFileSync(path.join(TEMPLATES, 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
    live = await mountComposer();
    await click(triggerFor('pull_request_body'), 8);
    await typeInPanel(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Fixes the sidebar toggle');
    // GitHub (أو برنامج آخر) يغيّر نص الحقل دون input: تبقى المعاينة على المسودة القديمة.
    const intro = 'سطر تمهيدي أضافه المستخدم\n';
    const textarea = field('pull_request_body');
    const typed = intro + textarea.value;
    textarea.value = typed;
    await click(need('[data-action="insert-template"]'), 8);
    expect(textarea.value).toBe(typed);
    expect(need('.status').textContent).toContain('تغيّر نص الحقل بعد آخر معاينة');
    // المعاينة أعيد رسمها على النص الحالي، فالإدراج الآن يحفظ السطر التمهيدي كاملًا ويقع تحت «Description».
    await click(need('[data-action="insert-template"]'), 8);
    expect(textarea.value.startsWith(intro)).toBe(true);
    expect(textarea.value).toContain('## Description\n\nFixes the sidebar toggle\n');
    expect(textarea.value).not.toContain('المس\n');
  });

  it('كتابة المستخدم في الحقل (حدث input) تعيد رسم المعاينة، فلا تقطع الخطة كلماته', async () => {
    loadHtml(path.join(TEMPLATES, 'markdown-template.html'));
    go('https://github.com/octo/demo/compare/main...feature');
    field('pull_request_body').value = fs.readFileSync(path.join(TEMPLATES, 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
    live = await mountComposer();
    await click(triggerFor('pull_request_body'), 8);
    await typeInPanel(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Fixes it');
    const textarea = field('pull_request_body');
    const intro = 'سطر تمهيدي أضافه المستخدم\n';
    await act(async () => {
      textarea.value = intro + textarea.value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await flush(4);
    });
    expect(need('[data-preview]').textContent!.startsWith(intro)).toBe(true);
    await click(need('[data-action="insert-template"]'), 8);
    expect(textarea.value.startsWith(intro)).toBe(true);
    expect(textarea.value).toContain('## Description\n\nFixes it\n');
  });
});

describe('GEMINI-017: لوحة المساعد على Issue Form تأخذ التركيز ويغلقها Escape', () => {
  it('التركيز داخل اللوحة بعد الفتح، وEscape يغلقها ويعيده إلى زر المساعد', async () => {
    loadHtml(path.join(TEMPLATES, 'issue-form.html'));
    go('https://github.com/octo/demo/issues/new?template=bug_report.yml');
    live = await mountComposer();
    await click(triggerFor('issue_form_steps'), 8);
    expect(need('section.panel').dataset.template).toBe('issue-form');
    const active = panelRoot().activeElement as HTMLElement | null;
    expect(active).not.toBeNull();
    expect(need('section.panel').contains(active)).toBe(true);
    await act(async () => {
      active!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      await flush(4);
    });
    expect(panelHost()).toBeNull();
  });
});

describe('GEMINI-005: خطوة أُرسلت ولم يثبت ردّها غير مؤكدة في الملخص والجدول', () => {
  const PAGE: PathPage = { owner: OWNER, repo: REPO, type: 'issue', path: null, ref: null, refKind: 'unknown', number: 3 };
  let container: HTMLElement | null = null;
  afterEach(() => {
    if (container) render(null, container);
    container?.remove();
    container = null;
  });

  /** المسار كاملًا عبر الواجهة والخلفية الفعليتين: اقتراح فمعاينة فتعديل فموافقتان بنقر موثوق فتنفيذ. */
  async function runThroughUi(override: ExecSystemOptions['override']) {
    const sys = await execSystem({ override });
    const deps: ExecutionDeps = { api: sys.panel.api, exec: sys.panel.exec, copy: vi.fn(async () => true), openSettings: vi.fn(), now: () => Date.UTC(2026, 9, 27, 9, 30) };
    container = document.createElement('div');
    container.className = 'mj-root';
    document.body.append(container);
    render(<ExecutionPath page={PAGE} deps={deps} />, container);
    await flush();
    const root = container;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    q('[data-action="exec-prepare"]')!.click();
    await flush(40);
    const content = q('[data-field="content"]') as HTMLTextAreaElement;
    content.value = README.replace('yarn install && yarn dev', 'pnpm install && pnpm dev');
    content.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(10);
    q('[data-action="exec-next"]')!.click();
    await flush(10);
    trustedClick(q('[data-consent="exec-scope"]')!);
    await flush(10);
    trustedClick(q('[data-consent="exec-run"]')!);
    await flush(60);
    return { sys, q, text: () => root.textContent!.replace(/\s+/g, ' ') };
  }

  it('انقطاع الشبكة بعد إرسال الملف: الفرع أُنشئ، والملف غير مؤكد، والطلب لم يُرسل؛ ولا «لم يُكتب غير ما في الجدول»', async () => {
    const ui = await runThroughUi((call) => {
      if (call.method === 'PUT') throw new TypeError('Failed to fetch');
      return null;
    });
    expect(ui.sys.writesOnly().map((c) => c.method)).toEqual(['POST', 'PUT']);
    expect(ui.q('[data-uncertain]')).not.toBeNull();
    expect(ui.text()).not.toContain('لم يُكتب غير ما في الجدول');
    expect(ui.q('[data-happened-branch]')!.getAttribute('data-happened-branch')).toBe('created');
    expect(ui.q('[data-happened-commit]')!.getAttribute('data-happened-commit')).toBe('uncertain');
    expect(ui.q('[data-happened-commit]')!.textContent).toContain('غير مؤكد');
    expect(ui.q('[data-happened-commit]')!.textContent).not.toContain('لم يُكتب الملف');
    expect(ui.q('[data-happened-pull]')!.getAttribute('data-happened-pull')).toBe('not-sent');
    expect(ui.q('[data-happened-pull]')!.textContent).toBe('لم يُرسل.');
  });

  it('خطأ خادم 502 عند فتح الطلب غير مؤكد كذلك؛ ورفض 422 للفرع مؤكد ويبقى «لم يُنشأ»', async () => {
    const gateway = await runThroughUi((call) => (call.method === 'POST' && call.path.endsWith('/pulls') ? { status: 502, body: { message: 'Bad Gateway' } } : null));
    expect(gateway.q('[data-happened-pull]')!.getAttribute('data-happened-pull')).toBe('uncertain');
    expect(gateway.q('[data-uncertain]')!.textContent).toContain('لا يُعرف إن نُفّذت');
    render(null, container!);
    container!.remove();
    container = null;
    const rejected = await runThroughUi((call) => (call.method === 'POST' && call.path.endsWith('/git/refs') ? { status: 422, body: { message: 'Reference already exists' } } : null));
    expect(rejected.q('[data-uncertain]')).toBeNull();
    expect(rejected.q('[data-happened-branch]')!.textContent).toBe('لم يُنشأ.');
    expect(rejected.text()).toContain('لم يُكتب غير ما في الجدول');
  });
});

describe('CODEX-006: حد طلبات الكتابة ليس نقص صلاحيات، ويُحترم Retry-After', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it('تصنيف الردود: 403 ثانوي بموعد، و429، ونفاد الحد الأساسي حدود؛ و403 للوصول بلا ترويسات رفض', () => {
    const now = 1_000_000;
    expect(writeRateLimit(403, headers({ 'retry-after': '120', 'x-ratelimit-remaining': '4999' }), 'You have exceeded a secondary rate limit', now)).toEqual({ retryAt: now + 120_000 });
    expect(writeRateLimit(429, headers({}), '', now)).toEqual({ retryAt: now + 60_000 });
    expect(writeRateLimit(403, headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 300) }), 'API rate limit exceeded', now)).toEqual({ retryAt: now + 300_000 });
    expect(writeRateLimit(403, headers({ 'x-ratelimit-remaining': '4000' }), 'Resource not accessible by personal access token', now)).toBeNull();
  });

  it('403 ثانوي بـRetry-After: لا حكم «ينقصه صلاحية»، ولا إرسال قبل الموعد، ويُسمح بعده', async () => {
    let clock = 5_000_000;
    let limited = true;
    const calls: string[] = [];
    const observed: unknown[] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push(`${init.method} ${new URL(String(url)).pathname}`);
      if (limited) return new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 403, headers: { 'content-type': 'application/json', 'retry-after': '120', 'x-ratelimit-remaining': '4999' } });
      return new Response(JSON.stringify({ ref: 'refs/heads/x' }), { status: 201, headers: { 'content-type': 'application/json' } });
    });
    const service = new ExecutionService({
      writeToken: { read: async () => ({ token: 'github_pat_SYNTHETICWRITE0000000000', savedAt: 1 }), info: async () => null } as never,
      readToken: null,
      permissions: { contains: async () => true, request: async () => true, remove: async () => true } as never,
      fetch: fetch as unknown as typeof globalThis.fetch,
      connections: { status: async () => [], observe: async (_id, verdict) => void observed.push(verdict) },
      now: () => clock,
    });
    const plan = { owner: 'octo', repo: 'demo', base: 'main', baseSha: BASE_SHA, branch: 'mijhar/fix-readme', path: 'README.md', fileSha: 'b'.repeat(40), content: '# Demo\n', title: 'docs: fix', body: 'body', draft: true };
    const first = await service.run(plan);
    expect(first.failure?.step).toBe('branch');
    expect(first.failure?.status).toBe(403);
    expect(first.failure?.retryAt).toBe(clock + 120_000);
    expect(first.failure?.message).toContain('حد الطلبات');
    expect(first.failure?.message).not.toContain('ينقصه');
    expect(observed.every((v) => v === null)).toBe(true);
    expect(calls).toHaveLength(1);
    // إعادة فورية: لا طلب.
    const again = await service.run(plan);
    expect(again.failure?.step).toBe('precheck');
    expect(again.failure?.message).toContain('لم يُرسل شيء');
    expect(calls).toHaveLength(1);
    // بعد الموعد: يُرسل.
    clock += 121_000;
    limited = false;
    await service.run(plan);
    expect(calls.length).toBeGreaterThan(1);
  });
});
