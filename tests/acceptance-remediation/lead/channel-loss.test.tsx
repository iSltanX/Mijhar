// @vitest-environment jsdom
/**
 * MJ-TA-H01 (Codex، فرضية): إن انقطعت قناة الرسائل إلى الخلفية بعد أن نفّذت عملية خارجية، كانت اللوحة تقول «لم يُكتب شيء» (والتحليل «لم يُرسل
 * شيء») وجدولها «لم يُنشأ الفرع». إعادة إنتاج مركّزة: الخلفية الفعلية (startBackground) وGitHub وهمي؛ تنشئ الخلفية الفرع (201)، ثم ينقطع منفذ
 * اللوحة قبل الرد («The message port closed before a response was received» كما في Chrome حين يُوقف العامل). الإصلاح: «تعذّر التأكد من النتيجة»
 * وجدول «غير معروف»، ويبقى «لم يُكتب شيء» حين لم تصل الرسالة أصلًا («Receiving end does not exist»).
 */
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionPath, runtimeExecutionPort } from '../../../src/modules/f/execution';
import type { ExecutionDeps, PathPage } from '../../../src/modules/f/execution';
import type { WritePlan } from '../../../src/core/guardrails';
import { runtimeProviderPort } from '../../../src/modules/e/provider/port';
import { trustedClick } from '../../shared/trusted-click';
import { flush } from '../../modules/d/helpers';
import { BASE_SHA, FILE_SHA, OWNER, README, REPO, execSystem } from '../../modules/f/execution/helpers';

const plan: WritePlan = { owner: OWNER, repo: REPO, base: 'main', baseSha: BASE_SHA, branch: 'audit-channel', path: 'README.md', fileSha: FILE_SHA, content: '# Synthetic\n', title: 'Synthetic change', body: 'No live service', draft: true };
const PORT_CLOSED = 'The message port closed before a response was received.';
const NO_RECEIVER = 'Could not establish connection. Receiving end does not exist.';

/** منفذ لوحة تصل رسالته إلى الخلفية فتبدأ التنفيذ، ثم «يتوقف العامل» بعد أن تنشئ الفرع فيُرفض الوعد عند المرسل. */
function droppingRuntime(system: Awaited<ReturnType<typeof execSystem>>) {
  return {
    sendMessage: (message: unknown) =>
      new Promise<unknown>((_resolve, reject) => {
        const m = message as { op?: string; plan?: WritePlan };
        if (m.op !== 'run' || !m.plan) {
          void system.panel.exec.status().then(_resolve, reject);
          return;
        }
        void system.panel.exec.run(m.plan);
        const wait = setInterval(() => {
          if (system.writesOnly().some((c) => c.method === 'POST' && c.path.endsWith('/git/refs'))) {
            clearInterval(wait);
            reject(new Error(PORT_CLOSED));
          }
        }, 1);
      }),
  };
}

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = null;
});

describe('MJ-TA-H01: انقطاع قناة الخلفية بعد كتابة خارجية', () => {
  it('المنفذ لا يدّعي أن شيئًا لم يُكتب، والفرع أُنشئ فعلًا عند GitHub', async () => {
    const s = await execSystem();
    const outcome = await runtimeExecutionPort(droppingRuntime(s)).run(plan);
    await flush(30);
    expect(s.writesOnly().map((c) => c.method)).toContain('POST');
    expect(outcome.ok).toBe(false);
    expect(outcome.failure?.message ?? '').not.toContain('لم يُكتب شيء');
    expect(outcome.failure?.message ?? '').toContain('تعذّر التأكد من النتيجة');
  });

  it('رسالة لم تصل الخلفية أصلًا: «لم يُكتب شيء» صحيحة وتبقى', async () => {
    const outcome = await runtimeExecutionPort({ sendMessage: async () => Promise.reject(new Error(NO_RECEIVER)) }).run(plan);
    expect(outcome.failure?.message).toContain('لم يُكتب شيء');
  });

  it('واجهة المسار: لا «لم يُنشأ» للفرع حين لا تُعرف النتيجة', async () => {
    const s = await execSystem();
    const runtime = droppingRuntime(s);
    const deps: ExecutionDeps = { api: s.panel.api, exec: runtimeExecutionPort(runtime), copy: vi.fn(async () => true), openSettings: vi.fn(), now: () => Date.UTC(2026, 9, 24, 9, 30) };
    container = document.createElement('div');
    container.className = 'mj-root';
    document.body.append(container);
    const page: PathPage = { owner: OWNER, repo: REPO, type: 'issue', path: null, ref: null, refKind: 'unknown', number: 3 };
    render(<ExecutionPath page={page} deps={deps} />, container);
    await flush();
    const root = container;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement | null;
    (q('[data-action="exec-prepare"]') as HTMLElement).click();
    await flush(40);
    const field = q('[data-field="content"]') as HTMLTextAreaElement;
    field.value = README.replace('yarn install && yarn dev', 'pnpm install && pnpm dev');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    (q('[data-action="exec-next"]') as HTMLElement).click();
    await flush(10);
    trustedClick(q('[data-consent="exec-scope"]') as HTMLElement);
    await flush(10);
    trustedClick(q('[data-consent="exec-run"]') as HTMLElement);
    await flush(80);
    expect(s.writesOnly().some((c) => c.method === 'POST' && c.path.endsWith('/git/refs'))).toBe(true);
    const text = q('[data-step-view="done"]')?.textContent ?? '';
    expect(text).toContain('تعذّر التأكد من النتيجة');
    expect(text).not.toContain('لم يُكتب غير ما في الجدول');
    expect(q('[data-happened-branch]')?.textContent).not.toBe('لم يُنشأ.');
  });

  it('التحليل: انقطاع بعد وصول الطلب لا يُقال فيه «لم يُرسل شيء»، وعدم الوصول يُقال فيه', async () => {
    const input = { requestId: 'r1', section: 'issue', provider: 'anthropic', model: 'mock', system: 's', prompt: 'p' };
    const dropped = await runtimeProviderPort({ sendMessage: async () => Promise.reject(new Error(PORT_CLOSED)) }).analyze(input);
    expect(dropped.ok).toBe(false);
    expect(dropped.ok ? '' : dropped.message).not.toContain('لم يُرسل شيء');
    const unreached = await runtimeProviderPort({ sendMessage: async () => Promise.reject(new Error(NO_RECEIVER)) }).analyze(input);
    expect(unreached.ok ? '' : unreached.message).toContain('لم يُرسل شيء');
  });
});
