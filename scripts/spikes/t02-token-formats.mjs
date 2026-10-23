#!/usr/bin/env node
// تجربة T-0.2 (MJ4) — استكشاف إضافي معلَن: أي صيغة رمز تقنيع تبقى سليمة عبر Translator API في Chrome (بواجهة، صفحة عادية)؟
// تُترجم الجمل المرجعية نفسها بكل صيغة، ويُعدّ الرمز سليمًا إن ظهر حرفيًا مرة واحدة.
// الاستعمال: node scripts/spikes/t02-token-formats.mjs --out evidence/T-0.2/raw/token-formats.json
import fs from 'node:fs';
import { launchChromium, serveDir, writeJson } from './lib.mjs';
import { mask } from './t02-validator.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];
const ref = JSON.parse(fs.readFileSync(new URL('../../fixtures/spikes/t02-reference.json', import.meta.url), 'utf8'));
const masked = ref.sentences.map((s) => mask(s));
const FORMATS = {
  'double-bracket ⟦CODE_0⟧': (t, i) => `⟦${t}_${i}⟧`,
  'braces {0}': (t, i) => `{${i}}`,
  'xml <x0/>': (t, i) => `<x${i}/>`,
  'underscores __C0__': (t, i) => `__C${i}__`,
  'caps XQZ0': (t, i) => `XQZ${i}`,
  'hash #0#': (t, i) => `#${i}#`,
  'brackets [[0]]': (t, i) => `[[${i}]]`,
};
const variants = Object.fromEntries(Object.entries(FORMATS).map(([name, f]) => [name, masked.map((m) => {
  let text = m.masked;
  const tokens = m.tokens.map((t, i) => {
    const [, type, idx] = /⟦([A-Z]+)_(\d+)⟧/.exec(t.token);
    const nt = f(type, idx);
    text = text.split(t.token).join(nt);
    return nt;
  });
  return { text, tokens };
})]));

const server = await serveDir(new URL('../../fixtures/spikes', import.meta.url).pathname);
const b = await launchChromium('chrome', { headless: false });
const results = {};
try {
  const page = await b.context.newPage();
  await page.goto(`${server.url}/fixture-editor.html`);
  await page.evaluate(() => { const btn = document.createElement('button'); btn.id = 'go'; btn.textContent = 'go'; document.body.appendChild(btn); });
  await page.evaluate((v) => { document.getElementById('go').onclick = () => { window.__run = (async () => { const t = await Translator.create({ sourceLanguage: 'en', targetLanguage: 'ar' }); const out = {}; for (const [name, list] of Object.entries(v)) { out[name] = []; for (const item of list) out[name].push(await t.translate(item.text)); } return out; })(); }; }, variants);
  // في ملف تعريف جديد قد يرفض أول create() (NotSupportedError) قبل اكتمال مكوّن الترجمة؛ تُعاد النقرة حتى ثلاث مرات.
  let outputs = null;
  for (let attempt = 1; attempt <= 3 && !outputs; attempt += 1) {
    await page.click('#go');
    outputs = await page.evaluate(() => window.__run.catch((e) => { window.__err = String(e); return null; }));
    if (!outputs) await new Promise((r) => setTimeout(r, 15000));
  }
  if (!outputs) throw new Error(await page.evaluate(() => window.__err));
  for (const [name, list] of Object.entries(variants)) {
    let intact = 0;
    let total = 0;
    list.forEach((item, i) => item.tokens.forEach((tok) => { total += 1; if (outputs[name][i].split(tok).length - 1 === 1) intact += 1; }));
    results[name] = { intact, total, rate: intact / total, sample: outputs[name].slice(0, 3) };
    console.error(`${name}: ${intact}/${total}`);
  }
} finally {
  await b.close();
  await server.close();
}
if (outFile) writeJson(outFile, { engine: 'Translator API (Chrome بواجهة، صفحة عادية)', browser: b.version, measuredAt: new Date().toISOString(), results });
