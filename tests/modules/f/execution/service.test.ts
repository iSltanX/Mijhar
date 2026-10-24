// TEST-EXEC-02 (شق الخلفية) وTEST-SEC-06 (آلي): خطوة التنفيذ في الخلفية الفعلية.
//  - لا تُقبل الكتابة إلا من صفحة الإضافة (اللوحة الأصلية): رسالة من سكربت المحتوى في صفحة GitHub تُرفض ولا يصدر شيء.
//  - خطة ناقصة أو معدّلة أو خارج النطاق (مسار شيفرة، .github/workflows، الفرع الأساس نفسه) تُرفض قبل أي طلب.
//  - بلا رمز كتابة أو بلا صلاحية api.github.com: لا طلب (BLK-WRITE-SCOPE)؛ ورمز قراءة هو رمز الكتابة نفسه: لا طلب.
//  - التنفيذ ثلاث عمليات بترتيبها (الفرع ثم الملف ثم الطلب) برمز الكتابة وحده، ولا GET برمز الكتابة، ولا دمج ولا إغلاق ولا غيرها.
//  - تعذّر بعد الفرع يُعلن ما حدث قبله ولا يُعيد ولا يحذف شيئًا.
import { describe, expect, it } from 'vitest';
import { checkPlan } from '../../../../src/core/guardrails';
import type { WritePlan } from '../../../../src/core/guardrails';
import { BASE_SHA, COMMIT_SHA, FILE_SHA, OWNER, README, REPO, execSystem } from './helpers';

const plan = (over: Partial<WritePlan> = {}): WritePlan => ({
  owner: OWNER,
  repo: REPO,
  base: 'main',
  baseSha: BASE_SHA,
  branch: 'mijhar/edit-readme-20261024-0930',
  path: 'README.md',
  fileSha: FILE_SHA,
  content: README.replace('yarn install && yarn dev', 'pnpm install && pnpm dev'),
  title: 'docs: update README.md',
  body: 'Refs #3',
  draft: true,
  ...over,
});

describe('TEST-EXEC-02 (الخلفية): لا كتابة بلا الشروط كلها', () => {
  it('من سكربت المحتوى (تبويب github.com): مرفوضة ولا طلب', async () => {
    const s = await execSystem();
    const out = await s.tab.exec.run(plan());
    expect(out.ok).toBe(false);
    expect(out.failure?.step).toBe('precheck');
    expect(out.failure?.message).toContain('لوحة مِجهَر الأصلية');
    expect(s.calls).toEqual([]);
  });

  it.each([
    ['مسار شيفرة', { path: 'src/index.ts' }],
    ['ملف تشغيل', { path: '.github/workflows/ci.yml' }],
    ['ملف أسرار', { path: '.env' }],
    ['الفرع الأساس نفسه', { branch: 'main' }],
    ['اسم فرع بـ«..»', { branch: 'mijhar/../main' }],
    ['التزام أساس غير معروف', { baseSha: 'HEAD' }],
    ['عنوان متعدد الأسطر', { title: 'a\nb' }],
  ])('خطة خارج النطاق (%s): مرفوضة قبل أي طلب', async (_name, over) => {
    const s = await execSystem();
    const out = await s.panel.exec.run(plan(over as Partial<WritePlan>));
    expect(out.ok).toBe(false);
    expect(out.failure?.step).toBe('precheck');
    expect(s.calls).toEqual([]);
  });

  it('خطة بحقل زائد (مثل merge أو delete): مرفوضة قبل أي طلب', async () => {
    const s = await execSystem();
    const out = await s.panel.exec.run({ ...plan(), merge: true } as unknown as WritePlan);
    expect(out.failure?.message).toContain('حقول غير متوقعة');
    expect(s.calls).toEqual([]);
  });

  it('BLK-WRITE-SCOPE: بلا رمز كتابة لا طلب، والحالة تقول «غير مربوط»', async () => {
    const s = await execSystem({ withWrite: false });
    expect(await s.panel.exec.status()).toEqual({ linked: false, health: 'none', permission: true });
    const out = await s.panel.exec.run(plan());
    expect(out.ok).toBe(false);
    expect(out.failure?.message).toContain('لا صلاحية كتابة محفوظة');
    expect(s.calls).toEqual([]);
  });

  it('بلا صلاحية api.github.com الاختيارية: لا طلب ولا طلب صلاحية', async () => {
    const s = await execSystem({ granted: false });
    expect((await s.panel.exec.status()).permission).toBe(false);
    const out = await s.panel.exec.run(plan());
    expect(out.failure?.message).toContain('api.github.com');
    expect(s.calls).toEqual([]);
    expect(s.permissions.request).not.toHaveBeenCalled();
  });

  it('رمز القراءة هو رمز الكتابة نفسه: لا طلب حتى يُفصلا', async () => {
    const s = await execSystem({ sameToken: true });
    const out = await s.panel.exec.run(plan());
    expect(out.failure?.message).toContain('رمز القراءة المحفوظ هو رمز الكتابة نفسه');
    expect(s.calls).toEqual([]);
  });

  it('status لا يرسل شيئًا ولا يقرأ قيمة الرمز في الرد', async () => {
    const s = await execSystem();
    const status = await s.panel.exec.status();
    expect(status).toEqual({ linked: true, health: 'unverified', permission: true });
    expect(s.calls).toEqual([]);
    expect(JSON.stringify(s.sent)).not.toContain(s.writeToken);
  });
});

describe('TEST-SEC-06 (آلي): الكتابة ثلاث عمليات برمز الكتابة وحده', () => {
  it('الفرع ثم الملف ثم الطلب، بأجسامها من الخطة، ولا GET ولا رمز قراءة فيها، والرابط من المستودع والرقم', async () => {
    const s = await execSystem();
    const p = plan();
    const out = await s.panel.exec.run(p);
    expect(out).toMatchObject({
      ok: true,
      branch: { created: true, name: p.branch, url: `https://github.com/${OWNER}/${REPO}/tree/mijhar/edit-readme-20261024-0930` },
      file: { written: true, commit: COMMIT_SHA, url: `https://github.com/${OWNER}/${REPO}/commit/${COMMIT_SHA}` },
      pull: { opened: true, number: 7, url: `https://github.com/${OWNER}/${REPO}/pull/7`, draft: true },
      failure: null,
    });
    expect(s.calls.map((c) => [c.method, c.path, c.auth])).toEqual([
      ['POST', `/repos/${OWNER}/${REPO}/git/refs`, 'write'],
      ['PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, 'write'],
      ['POST', `/repos/${OWNER}/${REPO}/pulls`, 'write'],
    ]);
    expect(s.calls[0]?.body).toEqual({ ref: `refs/heads/${p.branch}`, sha: BASE_SHA });
    const put = s.calls[1]?.body as { message: string; content: string; branch: string; sha: string };
    expect(put).toMatchObject({ message: p.title, branch: p.branch, sha: FILE_SHA });
    expect(new TextDecoder().decode(Uint8Array.from(atob(put.content), (c) => c.charCodeAt(0)))).toBe(p.content);
    expect(s.calls[2]?.body).toEqual({ title: p.title, head: p.branch, base: 'main', body: 'Refs #3', draft: true });
    // لا رمز في أي رسالة ولا رد.
    expect(JSON.stringify(s.sent)).not.toContain(s.writeToken);
    expect(JSON.stringify(out)).not.toContain(s.writeToken);
    // صحة رمز الكتابة من استجابات الكتابة نفسها.
    expect((await s.panel.exec.status()).health).toBe('healthy');
  });

  it('القراءة قبلها (المعاينة) برمز القراءة وحده، ولا تحمل رمز الكتابة', async () => {
    const s = await execSystem();
    await s.panel.api.get(`/repos/${OWNER}/${REPO}`);
    await s.panel.api.get(`/repos/${OWNER}/${REPO}/contents/README.md?ref=${BASE_SHA}`);
    await s.panel.exec.run(plan());
    const reads = s.calls.filter((c) => c.method === 'GET');
    expect(reads.length).toBe(2);
    expect(reads.every((c) => c.auth === 'read')).toBe(true);
    expect(s.calls.filter((c) => c.auth === 'write').every((c) => c.method !== 'GET')).toBe(true);
  });

  it('تعذّر كتابة الملف بعد إنشاء الفرع (409): يُعلن ما حدث، ولا طلب بعده ولا حذف ولا إعادة', async () => {
    const s = await execSystem({ override: (c) => (c.method === 'PUT' ? { status: 409, body: { message: 'README.md does not match' } } : null) });
    const out = await s.panel.exec.run(plan());
    expect(out.ok).toBe(false);
    expect(out.branch.created).toBe(true);
    expect(out.file.written).toBe(false);
    expect(out.pull.opened).toBe(false);
    expect(out.failure).toMatchObject({ step: 'file', status: 409 });
    expect(out.failure?.message).toContain('تغيّر الملف أو الفرع بعد المعاينة');
    expect(s.calls.map((c) => c.method)).toEqual(['POST', 'PUT']);
  });

  it('401 من GitHub على الفرع: منتهٍ، ولا طلب بعده، والتنفيذ التالي لا يرسل شيئًا', async () => {
    const s = await execSystem({ override: (c) => (c.method === 'POST' ? { status: 401, body: { message: 'Bad credentials' } } : null) });
    const out = await s.panel.exec.run(plan());
    expect(out.failure).toMatchObject({ step: 'branch', status: 401 });
    expect((await s.panel.exec.status()).health).toBe('expired');
    const again = await s.panel.exec.run(plan());
    expect(again.failure?.step).toBe('precheck');
    expect(s.calls).toHaveLength(1);
  });

  it('تنفيذان متزامنان: الثاني يُرفض ولا يرسل', async () => {
    const s = await execSystem();
    const [a, b] = await Promise.all([s.panel.exec.run(plan()), s.panel.exec.run(plan())]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((o) => !o.ok)?.failure?.message).toContain('خطوة تنفيذ جارية');
    expect(s.calls).toHaveLength(3);
  });

  it('مستودع خاص: الخطة بلا مسودة، والطلب كذلك', async () => {
    const s = await execSystem({ private: true });
    const out = await s.panel.exec.run(plan({ draft: false }));
    expect(out.pull.draft).toBe(false);
    expect((s.calls[2]?.body as { draft: boolean }).draft).toBe(false);
  });

  it('checkPlan يقبل الخطة المرجعية كما هي', () => {
    expect(checkPlan(plan())).toEqual({ ok: true });
  });
});

describe('انقطاع الشبكة أثناء الكتابة', () => {
  it('انقطاع بعد إنشاء الفرع: لا يُدّعى أن الخطوة لم تحدث، ولا طلب بعده', async () => {
    const s = await execSystem();
    s.net.mockImplementationOnce(async (url: string | URL | Request, init: RequestInit = {}) => {
      const u = new URL(String(url));
      s.calls.push({ method: init.method ?? 'GET', path: u.pathname, auth: 'write', body: null });
      return new Response(JSON.stringify({ ref: 'refs/heads/x' }), { status: 201 });
    });
    s.net.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    const out = await s.panel.exec.run(plan());
    expect(out.branch.created).toBe(true);
    expect(out.failure).toMatchObject({ step: 'file', status: null });
    expect(out.failure?.message).toContain('لا يُعرف إن نُفّذت هذه الخطوة');
    expect(s.net).toHaveBeenCalledTimes(2);
  });
});
