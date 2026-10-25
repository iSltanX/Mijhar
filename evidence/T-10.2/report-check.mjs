#!/usr/bin/env node
// MJ26، T-10.2، DEC-12 ي-1 (O-20): «الإبلاغ عن مشكلة» داخل الإضافة المبنية في المتصفح الحقيقي، وخادم القناة **محاكى محليًا**: لا يصل شيء إلى
// app-reports.isultantf.workers.dev الحقيقي، ولا يُرسل بلاغ حقيقي. يكتب البلاغ ويرسله بنقرات فعلية في صفحة الإعدادات (#report)، ثم يقرأ ما وصل الخادم.
//   أ. (عائلة Chromium، الحزمة كما هي) «أرسل البلاغ» يطلب مضيف القناة وحده؛ والرفض محاكى بغلاف permissions.request (نافذة Chromium لا تُجيب آليًا)،
//      فلا طلب إلى الخادم ويُعرض نص الصلاحية.
//   ب. (المضيف ممنوح: نسخة من الحزمة بالمضيف في host_permissions في Chromium، وفي Firefox منح بواجهة Firefox الداخلية ExtensionPermissions بالمضيف
//      وموافقة technicalAndInteraction لا بنافذتها) الإرسال طلب واحد من الخلفية: POST /v1/reports بترويستي Content-Type وIdempotency-Key وحدهما من
//      ترويسات التطبيق، بلا كوكي ولا Authorization، وجسمه هو ما عرضته المراجعة حرفًا؛ والرد 201 يُعرض رقمه؛ و400 unknown_product (المنتج قبل وسمه)
//      يُعرض نصه بلا إعادة تلقائية.
// الاستعمال: npm run build && node evidence/T-10.2/report-check.mjs [chrome edge brave firefox]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../tests/modules/d/token/browser/drivers.mjs';

const HOST = 'app-reports.isultantf.workers.dev';
const keys = process.argv.slice(2).filter((a) => BROWSERS[a]);
const list = keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox'];
const githubReply = () => ({ status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ message: 'Not Found' });
const TEXT = 'يختفي زر «نسخ البرومبت» بعد تغيير القالب في صفحة طلب الدمج.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function derived() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj26-report-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `https://${HOST}/*`])];
  manifest.optional_host_permissions = (manifest.optional_host_permissions ?? []).filter((h) => !manifest.host_permissions.includes(h));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const results = [];
for (const key of list) {
  const target = BROWSERS[key].target;
  const steps = [];
  const check = (part, name, ok, detail) => {
    steps.push({ part, name, ok: Boolean(ok), detail });
    console.log(`  ${ok ? '✓' : '✗'} [${BROWSERS[key].label} · ${part}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  };
  const server = { mode: '201' };
  const extra = { [HOST]: () => (server.mode === '201' ? { status: 201, body: { id: 4242 } } : { status: 400, body: { error: 'unknown_product' } }) };

  const openReport = async (d) => {
    await d.options(`location.hash = '#report'; return true;`);
    await waitUntil(async () => (await d.options(`return Boolean(document.querySelector('[data-report-page]'));`)) || null, 8000);
    await d.fill('[data-report-text]', TEXT);
    await sleep(300);
  };
  const result = (d) => d.options(`const r = document.querySelector('[data-report-result]'); return r ? { state: r.getAttribute('data-report-result'), text: r.textContent.trim() } : null;`);
  const reviewed = (d) => d.options(`return document.querySelector('[data-report-json] pre, [data-report-json] code')?.textContent ?? null;`);

  // ---------- أ. الحزمة كما هي: الصلاحية أولًا ----------
  if (target === 'chromium') {
    const s = await chromiumSession(key, { extDir: path.join(ROOT, 'dist/chromium'), githubReply, apiReply, extra });
    try {
      await openReport(s.d);
      await s.d.options(`const api = chrome.permissions; window.__perm = []; api.request = async (p) => { window.__perm.push(p); return false; }; return true;`);
      await s.d.click('[data-action="report-send"]');
      const r = await waitUntil(async () => ((x) => (x?.state === 'failed' ? x : null))(await result(s.d)), 8000);
      const asked = await s.d.options(`return window.__perm;`);
      check('أ. الصلاحية', '«أرسل البلاغ» بنقرة فعلية يطلب مضيف القناة وحده؛ وبعد الرفض (محاكى) لا طلب إلى الخادم ويُعرض نص الصلاحية', JSON.stringify(asked) === JSON.stringify([{ origins: [`https://${HOST}/*`] }]) && s.network.extra.length === 0 && /لم يُمنح إذن الاتصال بخادم البلاغات/.test(r?.text ?? ''), { asked, sent: s.network.extra.length, result: r });
    } finally {
      await s.close();
    }
  }

  // ---------- ب. المضيف ممنوح: الإرسال ----------
  const s = target === 'chromium' ? await chromiumSession(key, { extDir: derived(), githubReply, apiReply, extra }) : await firefoxSession({ extDir: path.join(ROOT, 'dist/firefox'), githubReply, apiReply, extra });
  try {
    if (target === 'firefox') {
      const granted = await s.chrome(`return (async () => {
        const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
        const policy = WebExtensionPolicy.getByID('mijhar@bysltan.com');
        await ExtensionPermissions.add('mijhar@bysltan.com', { permissions: [], origins: ['https://${HOST}/*'], data_collection: ['technicalAndInteraction'] }, policy.extension);
        const p = await ExtensionPermissions.get('mijhar@bysltan.com');
        return { origins: [...(p.origins ?? [])], data_collection: [...(p.data_collection ?? [])] };
      })();`);
      check('ب. الإرسال', 'Firefox: مضيف القناة وموافقة technicalAndInteraction ممنوحان (بواجهة Firefox الداخلية لا بالنافذة)', granted?.origins?.includes(`https://${HOST}/*`) && granted?.data_collection?.includes('technicalAndInteraction'), granted);
    }
    await openReport(s.d);
    const review = await reviewed(s.d);
    await s.d.click('[data-action="report-send"]');
    const r1 = await waitUntil(async () => ((x) => (x && x.state !== 'sending' ? x : null))(await result(s.d)), 12000);
    const first = s.network.extra[0] ?? null;
    const headers = first?.headers ?? {};
    const body = first?.body ? JSON.parse(first.body) : null;
    check('ب. الإرسال', 'طلب واحد POST /v1/reports من الخلفية', s.network.extra.length === 1 && first?.method === 'POST' && first?.path === '/v1/reports' && (target === 'firefox' || first?.from === 'background'), s.network.extra.map((e) => ({ method: e.method, path: e.path, from: e.from })));
    check('ب. الإرسال', 'ترويستا التطبيق Content-Type: application/json وIdempotency-Key بصيغة UUID، ولا Cookie ولا Authorization', /application\/json/.test(headers['content-type'] ?? '') && UUID.test(headers['idempotency-key'] ?? '') && !headers.cookie && !headers.authorization, { contentType: headers['content-type'], key: headers['idempotency-key'], cookie: Boolean(headers.cookie), authorization: Boolean(headers.authorization), referer: headers.referer ?? null });
    check('ب. الإرسال', 'الجسم هو ما عرضته المراجعة حرفًا: المنتج mijhar والنص والتشخيص، ولا رابط صفحة ولا مستودع', Boolean(body) && review !== null && JSON.stringify(body) === JSON.stringify(JSON.parse(review)) && body.product === 'mijhar' && body.description === TEXT && !/github\.com\/|https?:\/\//.test(JSON.stringify(body)), { body, matchesReview: review !== null && body !== null && JSON.stringify(body) === JSON.stringify(JSON.parse(review)) });
    check('ب. الإرسال', 'الرد 201 يُعرض رقمه (#4242)', r1?.state === 'sent' && r1.text.includes('4242'), r1);

    server.mode = '400';
    await s.d.fill('[data-report-text]', `${TEXT} (ثانية)`);
    await sleep(300);
    await s.d.click('[data-action="report-send"]');
    const r2 = await waitUntil(async () => ((x) => (x?.state === 'failed' ? x : null))(await result(s.d)), 12000);
    await sleep(1500);
    check('ب. الإرسال', '400 unknown_product (المنتج قبل وسمه في القناة): نص «أحد حقوله غير مقبول» ودعوة النسخ، ولا إعادة تلقائية', /أحد حقوله غير مقبول/.test(r2?.text ?? '') && s.network.extra.length === 2, { result: r2, requests: s.network.extra.length });
    // وكيل Firefox يمر به المتصفح كله، فتظهر فيه خدمات Firefox نفسها (الإعدادات البعيدة على mozilla.com وmozilla.net)؛ تُسرد ولا تُنسب إلى الإضافة.
    const blocked = [...s.network.blocked];
    const foreign = blocked.filter((h) => !(target === 'firefox' && /(^|\.)mozilla\.(com|net|org)$/.test(h)));
    check('الشبكة', 'لا مضيف خارجي غير المعترَض (عدا خدمات Firefox نفسه، مسرودة)', foreign.length === 0, { foreign, browserOwn: blocked.filter((h) => !foreign.includes(h)) });
  } finally {
    await s.close();
  }
  const passed = steps.filter((x) => x.ok).length;
  console.log(`${BROWSERS[key].label} ${s.browserVersion}: ${passed}/${steps.length}`);
  results.push({ browser: BROWSERS[key].label, version: s.browserVersion, passed, total: steps.length, steps });
}
fs.writeFileSync(path.join(ROOT, 'evidence/T-10.2/report-check-result.json'), `${JSON.stringify({ at: new Date().toISOString(), server: 'محاكى محليًا', results }, null, 2)}\n`);
process.exit(results.every((r) => r.passed === r.total) ? 0 : 1);
