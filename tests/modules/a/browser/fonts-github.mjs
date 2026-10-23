#!/usr/bin/env node
// TEST-RTL-03 (AC-A3، HYP-16) على صفحة GitHub حقيقية: الحزمة المشحونة في كل متصفح بملف تعريف مؤقت جديد، ثم README عام
// (Barqawiz/Shakkala، بلا دخول ولا إرسال). هل تحمّل الخطوط المضمّنة من حزمة الإضافة تحت سياسة CSP الحقيقية للصفحة
// (font-src github.githubassets.com)؟ حالة FontFace، وانتهاكات CSP، وطلبات الخطوط وأصولها، والخط المحسوب لفقرة عربية.
// الاستعمال: node tests/modules/a/browser/fonts-github.mjs [chrome edge brave firefox] [--out <ملف json>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, launchFirefox, machineInfo, sleep, waitFor, writeJson } from '../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const URL_ = 'https://github.com/Barqawiz/Shakkala';
const FAMILY = 'Mijhar IBM Plex Sans Arabic';

function mounted() {
  const styles = document.getElementById('mijhar-reading-styles')?.textContent ?? '';
  return styles.includes('@font-face') && document.querySelectorAll('[data-mijhar-dir]').length > 0;
}

async function probe(family) {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
  let loaded = [];
  let error = null;
  try {
    loaded = await document.fonts.load(`16px "${family}"`, 'بسم الله');
  } catch (e) {
    error = String(e);
  }
  await new Promise((r) => setTimeout(r, 1000));
  const arabic = [...document.querySelectorAll('.markdown-body p, .markdown-body td')].find((el) => /[؀-ۿ]{3}/.test(el.textContent));
  const resources = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(woff2?|ttf|otf)(\?|$)/.test(n));
  return {
    loaded: loaded.length,
    error,
    faces: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === family).map((f) => ({ weight: f.weight, status: f.status })),
    check: document.fonts.check(`16px "${family}"`, 'بسم'),
    violations,
    fontResources: resources.map((n) => new URL(n).protocol + '//' + new URL(n).host),
    arabicSample: arabic?.textContent.trim().slice(0, 40) ?? null,
    arabicFont: arabic ? getComputedStyle(arabic).fontFamily.slice(0, 80) : null,
    flipped: document.querySelectorAll('[data-mijhar-dir]').length,
  };
}

const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), page: URL_, results: [] };
for (const key of keys) {
  const r = { key };
  if (key === 'firefox') {
    const ff = await launchFirefox();
    r.browser = ff.version;
    try {
      await ff.installAddon(path.join(ROOT, 'dist/firefox'));
      await ff.navigate(URL_);
      r.mounted = Boolean(await waitFor(() => ff.exec(`return (${mounted})();`), 20000, 200));
      r.csp = await ff.exec('return null;');
      r.probe = await ff.execAsync(`const done = arguments[arguments.length - 1]; (${probe})(arguments[0]).then(done, (e) => done({ error: String(e) }));`, [FAMILY], 'content', 30000);
      r.console = await ff.exec(`return Services.console.getMessageArray().map((m) => m.message ?? String(m)).filter((t) => /Content-Security-Policy|font|moz-extension/i.test(t)).slice(-10);`, [], 'chrome');
    } catch (e) {
      r.error = String(e.stack ?? e);
    } finally {
      await ff.close();
    }
  } else {
    const b = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium') });
    r.browser = b.version;
    const fontRequests = [];
    try {
      const page = await b.context.newPage();
      page.on('request', (req) => /\.(woff2?|ttf|otf)(\?|$)/.test(req.url()) && fontRequests.push(new URL(req.url()).protocol + '//' + new URL(req.url()).host));
      const response = await page.goto(URL_, { waitUntil: 'load' });
      r.csp = (response.headers()['content-security-policy'] ?? '').split(';').map((d) => d.trim()).find((d) => d.startsWith('font-src')) ?? null;
      r.mounted = Boolean(await waitFor(() => page.evaluate(mounted), 20000, 200));
      r.probe = await page.evaluate(probe, FAMILY);
      r.fontRequests = [...new Set(fontRequests)];
    } catch (e) {
      r.error = String(e.stack ?? e);
    } finally {
      await b.close();
    }
  }
  await sleep(200);
  output.results.push(r);
  const p = r.probe ?? {};
  console.error(`${key} ${r.browser ?? ''}: ${r.error ? `خطأ ${r.error.split('\n')[0]} · ` : ''}مركَّبة ${r.mounted} · font-src ${r.csp ?? '—'} · وجوه ${JSON.stringify(p.faces)} check ${p.check} انتهاكات ${JSON.stringify(p.violations)} · طلبات خطوط ${JSON.stringify(r.fontRequests ?? p.fontResources)} · خط الفقرة ${p.arabicFont}`);
}
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));
