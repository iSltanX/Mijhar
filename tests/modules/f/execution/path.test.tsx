// @vitest-environment jsdom
// TEST-EXEC-02 (AC-F6، الشق المانع، آلي على الواجهة والخلفية الفعلية معًا) وشق الوحدة من AD-27 لموافقات المسار:
//  - الخطوتان ١ و٢: قراءة بطبقة القراءة وحدها (برمز القراءة)، والفرق كاملًا قبل أي اتصال كتابة، و«نسخ الفرق» بلا أي صلاحية كتابة؛ ولا رسالة
//    كتابة ولا سؤال عن صلاحيتها قبل الموافقة.
//  - محاولة تخطي الموافقة: النقر البرمجي على مربع الموافقة وعلى «نفّذ» (ولو أُزيل تعطيله) لا يغيّر شيئًا ولا يرسل شيئًا.
//  - تعديل بعد الموافقة يعيد إلى الفرق ويُسقطها.
//  - بالنقر الموثوق: الموافقة ثم «نفّذ» يرسلان الخطة التي عُرضت نفسها، فتكتب الخلفية ثلاث عمليات، ويُعرض ما حدث برابطه.
//  - BLK-WRITE-SCOPE: بلا صلاحية كتابة يتوقف المسار ولا تنفيذ، و«اطلب صلاحية الكتابة» بنقرة موثوقة وحدها، ولا شيء تلقائي بعدها.
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionPath } from '../../../../src/modules/f/execution';
import type { ExecutionDeps, PathPage } from '../../../../src/modules/f/execution';
import { trustedClick } from '../../../shared/trusted-click';
import { flush } from '../../d/helpers';
import { BASE_SHA, OWNER, README, REPO, execSystem } from './helpers';

const PAGE: PathPage = { owner: OWNER, repo: REPO, type: 'issue', path: null, ref: null, refKind: 'unknown', number: 3 };
const NOW = Date.UTC(2026, 9, 24, 9, 30);

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = null;
});

async function mount(system: Awaited<ReturnType<typeof execSystem>>) {
  const copied: string[] = [];
  const deps: ExecutionDeps = {
    api: system.panel.api,
    exec: system.panel.exec,
    copy: vi.fn(async (text: string) => {
      copied.push(text);
      return true;
    }),
    openSettings: vi.fn(),
    now: () => NOW,
  };
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  render(<ExecutionPath page={PAGE} deps={deps} />, container);
  await flush();
  const root = container;
  const q = <E extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as E | null;
  const step = () => root.querySelector('[data-exec-step]')?.getAttribute('data-exec-step');
  const click = async (sel: string) => {
    (q(sel) as HTMLElement).click();
    await flush(10);
  };
  const trusted = async (sel: string) => {
    trustedClick(q(sel) as HTMLElement);
    await flush(10);
  };
  const type = async (sel: string, value: string) => {
    const el = q<HTMLInputElement | HTMLTextAreaElement>(sel) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const execMessages = () => system.sent.filter((m) => (m as { type?: string }).type === 'mijhar/execution');
  return { deps, copied, q, step, click, trusted, type, execMessages };
}

const EDITED = README.replace('yarn install && yarn dev', 'pnpm install && pnpm dev');

async function toScope(ui: Awaited<ReturnType<typeof mount>>) {
  await ui.click('[data-action="exec-prepare"]');
  await flush(30);
  expect(ui.step()).toBe('preview');
  await ui.type('[data-field="content"]', EDITED);
  await ui.click('[data-action="exec-next"]');
  expect(ui.step()).toBe('scope');
}

describe('TEST-EXEC-02: الشق المانع في الواجهة', () => {
  it('الاقتراح والمعاينة: قراءة برمز القراءة وحده، والفرق كاملًا، و«نسخ الفرق» بلا صلاحية كتابة، ولا رسالة كتابة', async () => {
    const s = await execSystem();
    const ui = await mount(s);
    expect(ui.step()).toBe('propose');
    expect((ui.q<HTMLInputElement>('[data-field="path"]') as HTMLInputElement).value).toBe('README.md');
    expect(ui.q('.exec-propose')?.textContent).toContain('بالمشكلة #3');
    expect(s.calls).toEqual([]);

    await ui.click('[data-action="exec-prepare"]');
    await flush(30);
    expect(ui.step()).toBe('preview');
    expect(s.calls.map((c) => [c.method, c.path, c.auth])).toEqual([
      ['GET', `/repos/${OWNER}/${REPO}`, 'read'],
      ['GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`, 'read'],
      ['GET', `/repos/${OWNER}/${REPO}/contents/README.md?ref=${BASE_SHA}`, 'read'],
    ]);
    expect(ui.q('[data-no-write-yet]')?.textContent).toContain('لم تُطلب أي صلاحية كتابة');
    expect(ui.q('[data-diff-empty]')).not.toBeNull();
    expect((ui.q<HTMLButtonElement>('[data-action="exec-next"]') as HTMLButtonElement).disabled).toBe(true);

    await ui.type('[data-field="content"]', EDITED);
    const rows = [...(ui.q('[data-diff]')?.querySelectorAll('.diff-row') ?? [])].map((r) => `${r.getAttribute('data-kind')}:${r.querySelector('.text')?.textContent}`);
    expect(rows).toContain('del:    yarn install && yarn dev');
    expect(rows).toContain('add:    pnpm install && pnpm dev');
    expect(ui.q('[data-deletions]')?.getAttribute('data-deletions')).toBe('1');
    expect(ui.q('[data-additions]')?.getAttribute('data-additions')).toBe('1');

    await ui.click('[data-action="exec-copy"]');
    expect(ui.copied).toHaveLength(1);
    expect(ui.copied[0]).toContain('--- a/README.md\n+++ b/README.md\n');
    expect(ui.copied[0]).toContain('-    yarn install && yarn dev\n+    pnpm install && pnpm dev\n');
    expect(s.writesOnly()).toEqual([]);
    expect(ui.execMessages()).toEqual([]);
  });

  it('محاولة تخطي الموافقة: النقر البرمجي على المربع و«نفّذ» (ولو أُزيل تعطيله) لا يغيّر شيئًا ولا يرسل شيئًا', async () => {
    const s = await execSystem();
    const ui = await mount(s);
    await toScope(ui);
    const box = ui.q<HTMLInputElement>('[data-consent="exec-scope"]') as HTMLInputElement;
    const run = ui.q<HTMLButtonElement>('[data-consent="exec-run"]') as HTMLButtonElement;
    expect(box.checked).toBe(false);
    expect(run.disabled).toBe(true);

    box.click();
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flush(10);
    expect(box.checked).toBe(false);
    expect(run.disabled).toBe(true);

    run.disabled = false;
    run.click();
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(30);
    expect(ui.step()).toBe('scope');
    expect(ui.execMessages()).toEqual([]);
    expect(s.writesOnly()).toEqual([]);
  });

  it('بلا موافقة: «نفّذ» بنقرة موثوقة لا يرسل شيئًا', async () => {
    const s = await execSystem();
    const ui = await mount(s);
    await toScope(ui);
    const run = ui.q<HTMLButtonElement>('[data-consent="exec-run"]') as HTMLButtonElement;
    run.disabled = false;
    trustedClick(run);
    await flush(30);
    expect(ui.step()).toBe('scope');
    expect(ui.execMessages()).toEqual([]);
  });

  it('تعديل بعد الموافقة يعيد إلى الفرق ويُسقطها', async () => {
    const s = await execSystem();
    const ui = await mount(s);
    await toScope(ui);
    await ui.trusted('[data-consent="exec-scope"]');
    expect((ui.q<HTMLInputElement>('[data-consent="exec-scope"]') as HTMLInputElement).checked).toBe(true);
    await ui.click('[data-action="exec-back"]');
    expect(ui.step()).toBe('preview');
    await ui.type('[data-field="title"]', 'docs: use pnpm');
    await ui.click('[data-action="exec-next"]');
    expect((ui.q<HTMLInputElement>('[data-consent="exec-scope"]') as HTMLInputElement).checked).toBe(false);
    expect(ui.q('[data-scope-pull]')?.textContent).toContain('docs: use pnpm');
    expect(ui.execMessages()).toEqual([]);
  });

  it('BLK-WRITE-SCOPE: بلا صلاحية كتابة يتوقف المسار ولا تنفيذ، و«اطلب صلاحية الكتابة» بنقرة موثوقة وحدها', async () => {
    const s = await execSystem({ withWrite: false });
    const ui = await mount(s);
    await toScope(ui);
    await ui.trusted('[data-consent="exec-scope"]');
    await ui.trusted('[data-consent="exec-run"]');
    await flush(30);
    expect(ui.step()).toBe('blocked');
    expect(ui.q('[data-block="BLK-WRITE-SCOPE"]')?.textContent).toContain('لا صلاحية كتابة مربوطة');
    expect(ui.execMessages().map((m) => (m as { op: string }).op)).toEqual(['status']);
    expect(s.writesOnly()).toEqual([]);

    await ui.click('[data-consent="exec-request-write"]');
    expect(ui.deps.openSettings).not.toHaveBeenCalled();
    await ui.trusted('[data-consent="exec-request-write"]');
    expect(ui.deps.openSettings).toHaveBeenCalledTimes(1);
    await flush(30);
    expect(ui.execMessages().map((m) => (m as { op: string }).op)).toEqual(['status']);

    await ui.click('[data-action="exec-copy"]');
    expect(ui.copied).toHaveLength(1);
    // بعد إضافة الصلاحية: عودة إلى النطاق بلا موافقة.
    await ui.click('[data-action="exec-back-to-scope"]');
    expect(ui.step()).toBe('scope');
    expect((ui.q<HTMLInputElement>('[data-consent="exec-scope"]') as HTMLInputElement).checked).toBe(false);
  });
});

describe('AC-F6 (الشق الإيجابي على GitHub وهمي): الموافقة الموثوقة ثم «نفّذ»', () => {
  it('ترسل الخطة المعروضة نفسها، فتكتب الخلفية ثلاث عمليات، ويُعرض ما حدث برابط الطلب، ولا دمج ولا إغلاق', async () => {
    const s = await execSystem();
    const ui = await mount(s);
    await toScope(ui);
    expect(ui.q('[data-scope-repo]')?.textContent).toBe(`${OWNER}/${REPO}`);
    expect(ui.q('[data-scope-branch]')?.textContent).toContain('mijhar/edit-readme-20261024-0930');
    expect(ui.q('[data-scope-file]')?.textContent).toContain('README.md');
    expect(ui.q('[data-scope-pull]')?.textContent).toContain('مسودةً');
    expect(ui.q('[data-scope-pull]')?.textContent).toContain('#3');
    expect(ui.q('[data-scope-never]')?.textContent).toBe('لا دمج ولا إغلاق ولا أي كتابة أخرى.');

    await ui.trusted('[data-consent="exec-scope"]');
    await ui.trusted('[data-consent="exec-run"]');
    await flush(50);
    expect(ui.step()).toBe('done');
    const run = ui.execMessages().find((m) => (m as { op: string }).op === 'run') as { plan: { content: string; branch: string; body: string } };
    expect(run.plan.content).toBe(EDITED);
    expect(run.plan.body).toBe('Refs #3');
    expect(s.writesOnly().map((c) => `${c.method} ${c.path} ${c.auth}`)).toEqual([
      `POST /repos/${OWNER}/${REPO}/git/refs write`,
      `PUT /repos/${OWNER}/${REPO}/contents/README.md write`,
      `POST /repos/${OWNER}/${REPO}/pulls write`,
    ]);
    expect(s.calls.every((c) => !/\/merge|\/pulls\/\d+$/.test(c.path) && c.method !== 'DELETE' && c.method !== 'PATCH')).toBe(true);
    expect(ui.q('[data-outcome="ok"]')?.textContent).toContain('فُتح طلب الدمج #7 مسودةً');
    expect(ui.q<HTMLAnchorElement>('[data-action="exec-open-pull"]')?.href).toBe(`https://github.com/${OWNER}/${REPO}/pull/7`);
    expect(ui.q('[data-happened-pull]')?.textContent).toContain(`${OWNER}/${REPO}#7`);
    expect(document.body.innerHTML).not.toContain(s.writeToken);
  });
});
