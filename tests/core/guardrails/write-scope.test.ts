// نطاق الكتابة وبوابتها (T-11.8، DEC-11 ط-1، AC-F6، AC-F7 (١)):
//  - المسار ملف توثيق أو إعداد نصي وحده: لا شيفرة ولا .github/workflows ولا .env ولا .git ولا «..».
//  - اسم الفرع الجديد بقواعد git وبمحارف آمنة، ولا يساوي الأساس.
//  - الخطة بنية مغلقة: حقل زائد أو ناقص يُرفض.
//  - البوابة لا تبني إلا ثلاث عمليات (POST git/refs، PUT contents، POST pulls) من الخطة، برمز الكتابة في ترويستها، بعد صلاحية api.github.com؛
//    وبلا الصلاحية لا يُرسل شيء.
import { describe, expect, it, vi } from 'vitest';
import { checkPlan, isNewBranchName, isTextPath, pathProblem, utf8ToBase64, base64ToUtf8, lineEnding, withEnding } from '../../../src/core/guardrails';
import type { WritePlan } from '../../../src/core/guardrails';
import { WRITE_OPERATIONS, WRITE_STEPS, sendWrite, writeRequestOf } from '../../../src/core/guardrails/write-gate';
import { fakePermissions } from '../ui-host/helpers';

const plan = (over: Partial<WritePlan> = {}): WritePlan => ({
  owner: 'octo',
  repo: 'demo',
  base: 'main',
  baseSha: 'a'.repeat(40),
  branch: 'mijhar/edit-readme',
  path: 'docs/دليل التثبيت.md',
  fileSha: 'b'.repeat(40),
  content: 'سطر\n',
  title: 'docs: update guide',
  body: 'Refs #3',
  draft: true,
  ...over,
});

describe('المسار: ملف نصي واحد في النطاق', () => {
  it.each(['README.md', 'docs/guide.markdown', 'CHANGELOG', 'readme', '.editorconfig', 'config/app.yml', 'package.json', 'docs/دليل.md', 'NOTICE', 'a/b/c.txt'])('مقبول: %s', (p) => {
    expect(pathProblem(p)).toBeNull();
    expect(isTextPath(p)).toBe(true);
  });
  it.each([
    ['', 'فارغ'],
    ['src/index.ts', 'شيفرة'],
    ['scripts/build.sh', 'شيفرة'],
    ['.github/workflows/ci.yml', 'تشغيل'],
    ['.GITHUB/Workflows/x.yml', 'تشغيل بحروف كبيرة'],
    ['.github/actions/x/action.yml', 'تشغيل'],
    ['.env', 'أسرار'],
    ['.env.local', 'أسرار'],
    ['.git/config', '.git'],
    ['docs/../README.md', '«..»'],
    ['/README.md', 'مقطع فارغ'],
    ['docs//README.md', 'مقطع فارغ'],
    ['docs\\README.md', 'شرطة عكسية'],
    ['README.md\u0000', 'محرف تحكم'],
    ['CODEOWNERS', 'صلاحيات'],
  ])('مرفوض: %s (%s)', (p) => {
    expect(pathProblem(p)).not.toBeNull();
  });
});

describe('اسم الفرع الجديد', () => {
  it.each(['mijhar/edit-readme-20261024-0930', 'docs-fix', 'a.b_c/d-e'])('مقبول: %s', (b) => expect(isNewBranchName(b)).toBe(true));
  it.each(['', 'main..x', 'a//b', 'a/', '/a', '.hidden', 'a/.b', 'x.lock', 'a b', 'a@{1}', 'فرع', '-x', 'a~1', 'a:b', 'x'.repeat(101)])('مرفوض: «%s»', (b) => expect(isNewBranchName(b)).toBe(false));
});

describe('checkPlan: بنية مغلقة', () => {
  it('الخطة المرجعية مقبولة، وبلا بصمة (ملف جديد) مقبولة', () => {
    expect(checkPlan(plan())).toEqual({ ok: true });
    expect(checkPlan(plan({ fileSha: null }))).toEqual({ ok: true });
  });
  it.each([
    ['حقل زائد', { ...plan(), merge: true }],
    ['حقل ناقص', (({ draft: _d, ...rest }) => rest)(plan())],
    ['مالك غير صالح', plan({ owner: 'octo/evil' })],
    ['الفرع هو الأساس', plan({ branch: 'main' })],
    ['التزام غير كامل', plan({ baseSha: 'abc' })],
    ['بصمة غير صالحة', plan({ fileSha: 'zz' })],
    ['محتوى فيه NUL', plan({ content: 'a\u0000b' })],
    ['محتوى أكبر من الحد', plan({ content: 'x'.repeat(100_001) })],
    ['عنوان فارغ', plan({ title: '  ' })],
    ['عنوان بسطر جديد', plan({ title: 'a\nb' })],
    ['مسودة ليست منطقية', { ...plan(), draft: 'yes' }],
    ['null', null],
  ])('مرفوضة: %s', (_n, value) => {
    expect(checkPlan(value).ok).toBe(false);
  });
});

describe('الترميز ونهايات الأسطر', () => {
  it('base64 لبايتات UTF-8 ذهابًا وإيابًا، وما ليس UTF-8 صالحًا null', () => {
    const text = 'مِجهَر — README\n✓\n';
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
    expect(base64ToUtf8(`${utf8ToBase64(text).slice(0, 8)}\n${utf8ToBase64(text).slice(8)}`)).toBe(text);
    expect(base64ToUtf8(btoa(String.fromCharCode(0xff, 0xfe, 0xfd)))).toBeNull();
  });
  it('نهايات الأسطر: lf وcrlf، والمختلطة null؛ والكتابة بنهايات الملف الأصلية', () => {
    expect(lineEnding('a\nb\n')).toBe('lf');
    expect(lineEnding('a\r\nb\r\n')).toBe('crlf');
    expect(lineEnding('a\r\nb\n')).toBeNull();
    expect(lineEnding('a\rb')).toBeNull();
    expect(withEnding('a\nb\n', 'crlf')).toBe('a\r\nb\r\n');
  });
});

describe('بوابة الكتابة: ثلاث عمليات لا غير', () => {
  it('الجدول ثلاث عمليات بطرقها، ولا GET ولا DELETE ولا PATCH ولا merge', () => {
    expect(WRITE_STEPS).toEqual(['branch', 'file', 'pull']);
    expect(Object.values(WRITE_OPERATIONS).map((o) => `${o.method} ${o.path}`)).toEqual(['POST /repos/{owner}/{repo}/git/refs', 'PUT /repos/{owner}/{repo}/contents/{path}', 'POST /repos/{owner}/{repo}/pulls']);
  });

  it('العناوين والأجسام من الخطة، والمسار مرمَّز مقطعًا مقطعًا', () => {
    const p = plan();
    expect(writeRequestOf('branch', p)).toEqual({ method: 'POST', path: '/repos/octo/demo/git/refs', body: { ref: 'refs/heads/mijhar/edit-readme', sha: p.baseSha } });
    const file = writeRequestOf('file', p);
    expect(file.path).toBe(`/repos/octo/demo/contents/docs/${encodeURIComponent('دليل التثبيت.md')}`);
    expect(file.body).toEqual({ message: 'docs: update guide', content: utf8ToBase64('سطر\n'), branch: 'mijhar/edit-readme', sha: p.fileSha });
    expect(writeRequestOf('file', plan({ fileSha: null })).body).not.toHaveProperty('sha');
    expect(writeRequestOf('pull', p)).toEqual({ method: 'POST', path: '/repos/octo/demo/pulls', body: { title: 'docs: update guide', head: 'mijhar/edit-readme', base: 'main', body: 'Refs #3', draft: true } });
  });

  it('برمز الكتابة في Authorization، بلا ملفات تعريف ارتباط ولا مرجِع، وإلى api.github.com وحده', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    await sendWrite('branch', plan(), 'WRITE-TOKEN', { permissions: fakePermissions(['https://api.github.com/*']), fetch: fetch as unknown as typeof globalThis.fetch });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/octo/demo/git/refs');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer WRITE-TOKEN');
  });

  it('بلا صلاحية api.github.com: يرمي ولا يُرسل؛ وبخطة غير صالحة: يرمي ولا يُرسل', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    await expect(sendWrite('branch', plan(), 'T', { permissions: fakePermissions([]), fetch: fetch as unknown as typeof globalThis.fetch })).rejects.toThrow(/api\.github\.com/);
    expect(() => sendWrite('pull', plan({ path: 'src/x.ts' }), 'T', { permissions: fakePermissions(['https://api.github.com/*']), fetch: fetch as unknown as typeof globalThis.fetch })).toThrow(/خطة كتابة غير صالحة/);
    expect(() => sendWrite('pull', plan(), '', { permissions: fakePermissions(['https://api.github.com/*']), fetch: fetch as unknown as typeof globalThis.fetch })).toThrow(/لا رمز كتابة/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
