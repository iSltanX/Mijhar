// «الإبلاغ عن مشكلة» (AC-10.3، DEC-12 ي-1، MJ26): الجسم بعقد القناة v1، وما يُعرض هو ما يُرسل، ولا حقل لمحتوى صفحة أو مستودع أو سرّ أو معرّف،
// والخلفية ترفض جسمًا بحقل زائد، والرد يُفسَّر بجدول العقد، ولا يُرسل شيء بلا صلاحية المضيف، ولا ترويسة غير الاثنتين.
import { describe, expect, it, vi } from 'vitest';
import { REPORTS_ENDPOINT, classify, isIdempotencyKey, parseRetryAfter, retryable, sendReport } from '../../../src/core/report/client';
import { collectDiagnostics } from '../../../src/core/report/diagnostics';
import { handleReportRequest, reportPermissions } from '../../../src/core/report/port';
import type { DiagnosticsSources } from '../../../src/core/report/diagnostics';
import { failureText } from '../../../src/core/report/messages';
import { LIMITS, buildPayload, formError, isReportPayload, reviewRows, serialise } from '../../../src/core/report/payload';
import type { Diagnostics } from '../../../src/core/report/payload';

const DIAG: Diagnostics = { appVersion: '0.1.0', os: 'macos', osVersion: '27.0.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.8078.47', buildTarget: 'chromium', surface: 'native', disabledUnits: [], test: false };
const KEY = '3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b';

describe('الجسم بعقد v1', () => {
  it('حقول العقد بأسمائها، والوصف كما كتبه المستخدم بلا فراغ طرفي، ولا test في نسخة منشورة', () => {
    const p = buildPayload({ kind: 'bug', description: '  البطاقة فارغة بعد التحديث  ' }, DIAG);
    expect(p).toEqual({
      product: 'mijhar',
      app_version: '0.1.0',
      os: 'macos',
      os_version: '27.0.1',
      arch: 'arm64',
      locale: 'ar',
      kind: 'bug',
      description: 'البطاقة فارغة بعد التحديث',
      diagnostics: { browser: 'Google Chrome', browser_version: '156.0.8078.47', build_target: 'chromium', surface: 'native', disabled_units: 'none' },
    });
    expect(isReportPayload(p)).toBe(true);
  });

  it('نسخة غير منشورة: test=true، وتظهر صفًّا في المعاينة', () => {
    const p = buildPayload({ kind: 'other', description: 'x' }, { ...DIAG, test: true });
    expect(p.test).toBe(true);
    expect(reviewRows(p).map((r) => r.field)).toContain('test');
  });

  it('ما يُعرض هو ما يُرسل: كل حقل في الجسم (إلا الوصف) له صف، ولا صف لحقل غير مرسل', () => {
    const p = buildPayload({ kind: 'suggestion', description: 'اقتراح' }, { ...DIAG, disabledUnits: ['h', 'c', 'c', 'z'], test: true });
    const shown = reviewRows(p).map((r) => r.field).join(' ');
    for (const k of Object.keys(p).filter((k) => k !== 'description' && k !== 'diagnostics')) expect(shown).toContain(k);
    for (const k of Object.keys(p.diagnostics)) expect(shown).toContain(k);
    expect(p.diagnostics.disabled_units).toBe('c,h');
    expect(JSON.parse(serialise(p))).toEqual(p);
  });

  it('لا حقل لمحتوى صفحة أو رابط أو مستودع أو سرّ أو معرّف: التشخيص قيم ضيقة، وما خرج عنها unknown', () => {
    const p = buildPayload({ kind: 'bug', description: 'وصف' }, { ...DIAG, browser: 'https://github.com/acme/secret', browserVersion: 'ghp_' + 'x'.repeat(36) + '\n', surface: 'evil' });
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/github\.com|acme|secret|url|repo|token|key|user|device|id"/i);
    expect(p.diagnostics.browser).toBe('unknown');
    expect(p.diagnostics.browser_version).toBe('unknown');
    expect(p.diagnostics.surface).toBe('native');
    expect(Object.keys(p).sort()).toEqual(['app_version', 'arch', 'description', 'diagnostics', 'kind', 'locale', 'os', 'os_version', 'product']);
  });

  it('حدود الوصف: فارغ، وأطول من 2000 بعد التشذيب؛ ولا يُبنى جسم منهما', () => {
    expect(formError({ kind: 'bug', description: '   ' })).toBe('empty');
    expect(formError({ kind: 'bug', description: 'أ'.repeat(LIMITS.description + 1) })).toBe('too-long');
    expect(formError({ kind: 'bug', description: 'أ'.repeat(LIMITS.description) })).toBeNull();
    expect(() => buildPayload({ kind: 'bug', description: '' }, DIAG)).toThrow();
  });

  it('الخلفية ترفض جسمًا بحقل زائد أو مرفق أو منتج آخر أو قيمة غير ضيقة', () => {
    const p = buildPayload({ kind: 'bug', description: 'وصف' }, DIAG);
    expect(isReportPayload({ ...p, attachments: [] })).toBe(false);
    expect(isReportPayload({ ...p, page_url: 'https://github.com/a/b' })).toBe(false);
    expect(isReportPayload({ ...p, product: 'rasd' })).toBe(false);
    expect(isReportPayload({ ...p, diagnostics: { ...p.diagnostics, repo: 'a/b' } })).toBe(false);
    expect(isReportPayload({ ...p, diagnostics: { ...p.diagnostics, browser: 'a/b' } })).toBe(false);
    expect(isReportPayload({ ...p, test: false })).toBe(false);
    expect(isReportPayload({ ...p, description: ' x' })).toBe(false);
    expect(isReportPayload(null)).toBe(false);
  });
});

describe('الإرسال وتفسير الرد', () => {
  const payload = buildPayload({ kind: 'bug', description: 'وصف' }, DIAG);

  it('بلا صلاحية المضيف: لا طلب أصلًا', async () => {
    const fetch = vi.fn();
    const r = await sendReport(payload, KEY, { fetch, granted: async () => false });
    expect(r).toEqual({ ok: false, failure: 'permission', status: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('طلب POST واحد إلى العنوان المعلن، بالترويستين وحدهما وبلا اعتماد ولا مُحيل، والجسم هو الجسم المبني', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 12 }), { status: 201 }));
    const r = await sendReport(payload, KEY, { fetch, granted: async () => true });
    expect(r).toEqual({ ok: true, id: 12, replayed: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REPORTS_ENDPOINT);
    expect(url).toBe('https://app-reports.isultantf.workers.dev/v1/reports');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': KEY });
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('جدول العقد: 200 إعادة بالمفتاح نفسه، و400 و413 و415 لا تُعاد، و429 بموعده، و5xx والانقطاع والمهلة تُعاد', async () => {
    expect(await classify(new Response('{"id":7}', { status: 200 }))).toEqual({ ok: true, id: 7, replayed: true });
    expect(await classify(new Response('{"error":"unknown_product"}', { status: 400 }))).toMatchObject({ failure: 'invalid' });
    expect(await classify(new Response('', { status: 413 }))).toMatchObject({ failure: 'too-large' });
    expect(await classify(new Response('', { status: 415 }))).toMatchObject({ failure: 'unsupported' });
    expect(await classify(new Response('', { status: 429, headers: { 'retry-after': '120' } }))).toMatchObject({ failure: 'rate-limited', retryAfterSeconds: 120 });
    expect(await classify(new Response('', { status: 503 }))).toMatchObject({ failure: 'server' });
    expect(await classify(new Response('{"id":"x"}', { status: 201 }))).toMatchObject({ failure: 'unexpected' });
    const network = await sendReport(payload, KEY, { fetch: async () => Promise.reject(new TypeError('offline')), granted: async () => true });
    expect(network).toMatchObject({ failure: 'network' });
    const slow = await sendReport(payload, KEY, { fetch: (_u, init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))), granted: async () => true, timeoutMs: 20 });
    expect(slow).toMatchObject({ failure: 'timeout' });
    expect(['invalid', 'too-large', 'unsupported'].map((f) => retryable(f as never))).toEqual([false, false, false]);
    expect(['network', 'timeout', 'rate-limited', 'server', 'permission'].every((f) => retryable(f as never))).toBe(true);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', Date.UTC(2026, 9, 21, 7, 27, 0))).toBe(60);
  });

  it('مفتاح Idempotency-Key معرّف عشوائي UUID v4 وحده', () => {
    expect(isIdempotencyKey(KEY)).toBe(true);
    expect(isIdempotencyKey(crypto.randomUUID())).toBe(true);
    expect(isIdempotencyKey('user-123')).toBe(false);
  });

  it('لكل فشل نصّه، و429 بموعده بالعربية', () => {
    expect(failureText('rate-limited', 600)).toContain('١٠ دقائق');
    expect(new Set(['permission', 'network', 'timeout', 'invalid', 'too-large', 'unsupported', 'rate-limited', 'server', 'unexpected'].map((f) => failureText(f as never))).size).toBe(9);
  });
});

describe('التشخيص من المتصفح والإضافة', () => {
  const base: DiagnosticsSources = {
    manifestVersion: () => '0.1.0',
    platformInfo: async () => ({ os: 'mac', arch: 'arm64' }),
    uaData: () => ({ brands: [{ brand: 'Chromium', version: '156' }, { brand: 'Google Chrome', version: '156' }], getHighEntropyValues: async () => ({ platformVersion: '27.0.1', fullVersionList: [{ brand: 'Chromium', version: '156.0.8078.47' }, { brand: 'Google Chrome', version: '156.0.8078.47' }] }) }),
    userAgent: () => 'Mozilla/5.0',
    browserInfo: async () => null,
    isBrave: async () => false,
    development: async () => false,
    target: () => 'chromium',
  };

  it('Chrome: الاسم والإصدار الكامل وإصدار النظام والمعمارية، والإعدادات كما مُرّرت', async () => {
    const d = await collectDiagnostics({ surface: 'drawer', disabledUnits: ['c'] }, base);
    expect(d).toEqual({ appVersion: '0.1.0', os: 'macos', osVersion: '27.0.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.8078.47', buildTarget: 'chromium', surface: 'drawer', disabledUnits: ['c'], test: false });
  });

  it('Brave وEdge وFirefox، وتثبيت المطوّر test', async () => {
    expect((await collectDiagnostics({ surface: 'native', disabledUnits: [] }, { ...base, isBrave: async () => true })).browser).toBe('Brave');
    const edge = await collectDiagnostics({ surface: 'native', disabledUnits: [] }, { ...base, uaData: () => ({ brands: [{ brand: 'Microsoft Edge', version: '155' }] }) });
    expect([edge.browser, edge.browserVersion, edge.osVersion]).toEqual(['Microsoft Edge', '155', 'unknown']);
    const ff = await collectDiagnostics({ surface: 'native', disabledUnits: [] }, { ...base, uaData: () => undefined, browserInfo: async () => ({ name: 'Firefox', version: '158.0.1' }), platformInfo: async () => ({ os: 'mac', arch: 'aarch64' }), target: () => 'firefox', development: async () => true });
    expect([ff.browser, ff.browserVersion, ff.osVersion, ff.arch, ff.buildTarget, ff.test]).toEqual(['Firefox', '158.0.1', 'unknown', 'arm64', 'firefox', true]);
  });
});

describe('الخلفية: من صفحة الإضافة وحدها، وبجسم العقد ومفتاح UUID', () => {
  const payload = buildPayload({ kind: 'bug', description: 'وصف' }, DIAG);
  it('ترفض بلا طلب: من سكربت محتوى، وجسم بحقل زائد، ومفتاح غير UUID', async () => {
    const fetch = vi.fn();
    const deps = { fetch, granted: async () => true };
    expect(await handleReportRequest({ type: 'mijhar/report', op: 'send', payload, key: KEY }, false, deps)).toMatchObject({ failure: 'refused' });
    expect(await handleReportRequest({ type: 'mijhar/report', op: 'send', payload: { ...payload, page: 'x' }, key: KEY }, true, deps)).toMatchObject({ failure: 'refused' });
    expect(await handleReportRequest({ type: 'mijhar/report', op: 'send', payload, key: 'device-1' }, true, deps)).toMatchObject({ failure: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
    const ok = await handleReportRequest({ type: 'mijhar/report', op: 'send', payload, key: KEY }, true, { fetch: async () => new Response('{"id":3}', { status: 201 }), granted: async () => true });
    expect(ok).toEqual({ ok: true, id: 3, replayed: false });
  });
  it('الصلاحيات: المضيف وحده في Chromium، ومعه technicalAndInteraction في Firefox', () => {
    expect(reportPermissions('chromium')).toEqual({ origins: ['https://app-reports.isultantf.workers.dev/*'] });
    expect(reportPermissions('firefox')).toEqual({ origins: ['https://app-reports.isultantf.workers.dev/*'], data_collection: ['technicalAndInteraction'] });
  });
});
