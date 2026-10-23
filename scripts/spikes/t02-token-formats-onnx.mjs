#!/usr/bin/env node
// تجربة T-0.2 (MJ4) — استكشاف إضافي معلَن: صيغ رموز التقنيع عبر ONNX (opus-mt-en-ar) في صفحة الإضافة، Chrome بلا واجهة،
// والنموذج من المرآة المحلية التي ملأتها t02-engines.mjs (لا تنزيل جديد). يُستعمل بناء chromium من t02-engines.mjs.
// الاستعمال: node scripts/spikes/t02-token-formats-onnx.mjs --cache <ذاكرة النموذج> --out evidence/T-0.2/raw/token-formats-onnx.json
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launchChromium, writeJson } from './lib.mjs';
import { mask } from './t02-validator.mjs';

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args.splice(i, 2)[1]; };
const outFile = take('--out');
const CACHE = take('--cache');
const ref = JSON.parse(fs.readFileSync(new URL('../../fixtures/spikes/t02-reference.json', import.meta.url), 'utf8'));
const masked = ref.sentences.map((s) => mask(s));
const FORMATS = { 'double-bracket ⟦CODE_0⟧': (t, i) => `⟦${t}_${i}⟧`, 'braces {0}': (t, i) => `{${i}}`, 'xml <x0/>': (t, i) => `<x${i}/>`, 'underscores __C0__': (t, i) => `__C${i}__`, 'caps XQZ0': (t, i) => `XQZ${i}`, 'brackets [[0]]': (t, i) => `[[${i}]]` };
const items = [];
for (const [name, f] of Object.entries(FORMATS)) for (const m of masked) {
  let text = m.masked;
  const tokens = m.tokens.map((t) => { const [, type, idx] = /⟦([A-Z]+)_(\d+)⟧/.exec(t.token); const nt = f(type, idx); text = text.split(t.token).join(nt); return nt; });
  items.push({ name, text, tokens });
}
const server = http.createServer((req, res) => {
  const m = /^\/Xenova\/opus-mt-en-ar\/resolve\/main\/(.+)$/.exec(new URL(req.url, 'http://x').pathname);
  const file = m && path.join(CACHE, m[1]);
  if (!file || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'access-control-allow-origin': '*' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await launchChromium('chrome', { extension: path.join(CACHE, '..', 't02-build', 'chromium') });
const results = {};
try {
  const ep = await b.context.newPage();
  await ep.goto(`chrome-extension://${b.extensionId}/page.html`);
  await ep.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const out = await ep.evaluate((a) => window.mj.onnx(a), { remoteHost: `http://127.0.0.1:${server.address().port}/`, paragraphs: [], sentences: items.map((x) => x.text) });
  if (out.loadError) throw new Error(out.loadError);
  items.forEach((it, i) => {
    const text = out.sentencesNoPrefix[i].text;
    results[it.name] ??= { intact: 0, total: 0, sample: [] };
    for (const tok of it.tokens) { results[it.name].total += 1; if (text.split(tok).length - 1 === 1) results[it.name].intact += 1; }
    if (results[it.name].sample.length < 3) results[it.name].sample.push(text);
  });
  for (const [name, v] of Object.entries(results)) { v.rate = v.intact / v.total; console.error(`${name}: ${v.intact}/${v.total}`); }
} finally {
  await b.close();
  server.close();
}
if (outFile) writeJson(outFile, { engine: 'ONNX opus-mt-en-ar q8 (transformers.js، صفحة إضافة، بلا رمز اللغة)', browser: b.version, measuredAt: new Date().toISOString(), results });
