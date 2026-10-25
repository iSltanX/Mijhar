#!/usr/bin/env node
// بلاغ تجريبي حقيقي واحد بإذن المالك (2026-10-25): من الإضافة المبنية dist/chromium محمّلة غير معبَّأة في Chrome (تثبيت مطوّر، فالبلاغ test: true)،
// إلى خادم القناة الفعلي https://app-reports.isultantf.workers.dev/v1/reports، بنقرة فعلية على «أرسل البلاغ» في صفحة الإعدادات (#report).
// ضوابط: يُرسل مرة واحدة ولا يُعاد ولو فشل؛ ولا يُرسل إلا إن كان الجسم المعروض في المراجعة فيه test: true والمنتج mijhar والنص المقصود؛ ولا شبكة إلا
// لمضيف القناة (طلبه يمضي حقيقيًا ويُسجَّل رمز ردّه) وما سواه محجوب. صلاحية المضيف بنسخة من الحزمة يكون فيها في host_permissions (كمنحها من المستخدم).
// الاستعمال: npm run build && node evidence/release-launch/real-report.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT as DRIVERS_ROOT, chromiumSession, waitUntil } from '../../tests/modules/d/token/browser/drivers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
void DRIVERS_ROOT;
const HOST = 'app-reports.isultantf.workers.dev';
const TEXT = 'بلاغ تجريبي من نسخة تطوير لإثبات قناة البلاغات لمِجهَر بعد تسجيله (product:mijhar). يُغلق بعد التحقق.';

function derived() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-real-report-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `https://${HOST}/*`])];
  manifest.optional_host_permissions = (manifest.optional_host_permissions ?? []).filter((h) => !manifest.host_permissions.includes(h));
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const extDir = derived();
const s = await chromiumSession('chrome', { extDir, githubReply: () => ({ status: 404, type: 'text/plain', body: 'not found' }), apiReply: () => ({ message: 'Not Found' }), extra: { [HOST]: () => 'continue' } });
const out = { at: new Date().toISOString(), browser: `Chrome ${s.browserVersion}`, extension: 'dist/chromium (غير معبَّأ، تثبيت مطوّر)', host: HOST };
try {
  await s.d.options(`location.hash = '#report'; return true;`);
  await waitUntil(async () => (await s.d.options(`return Boolean(document.querySelector('[data-report-page]'));`)) || null, 8000);
  await s.d.options(`const r = document.querySelector('[data-report-kind="other"]'); r.click(); return true;`);
  await s.d.fill('[data-report-text]', TEXT);
  await new Promise((r) => setTimeout(r, 600));
  const review = JSON.parse(await s.d.options(`return document.querySelector('[data-report-json] pre').textContent;`));
  out.review = review;
  const ok = review.product === 'mijhar' && review.test === true && review.description === TEXT && review.kind === 'other';
  out.guard = { productMijhar: review.product === 'mijhar', testTrue: review.test === true, text: review.description === TEXT, kind: review.kind };
  if (!ok || s.network.extra.length !== 0) {
    out.sent = false;
    out.why = 'الضابط منع الإرسال';
  } else {
    await s.d.click('[data-action="report-send"]');
    const result = await waitUntil(async () => s.d.options(`const r = document.querySelector('[data-report-result]'); return r && r.getAttribute('data-report-result') !== 'sending' ? { state: r.getAttribute('data-report-result'), text: r.textContent.trim() } : null;`), 30000);
    await new Promise((r) => setTimeout(r, 1500));
    out.sent = true;
    out.result = result;
    out.requests = s.network.extra.map((e) => ({ method: e.method, path: e.path, from: e.from, status: e.status ?? null }));
    out.blocked = [...s.network.blocked];
  }
} finally {
  await s.close();
  fs.rmSync(extDir, { recursive: true, force: true });
}
fs.writeFileSync(path.join(ROOT, 'evidence/release-launch/real-report-result.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ sent: out.sent, guard: out.guard, result: out.result, requests: out.requests, blocked: out.blocked, why: out.why }, null, 2));
