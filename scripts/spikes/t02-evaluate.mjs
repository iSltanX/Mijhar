#!/usr/bin/env node
// تجربة T-0.2 (MJ4): تشغيل المدقق المرجعي المؤقت (t02-validator.mjs) على مخرجات المحركات الحقيقية المقيسة في engines.json (AC-S2.4).
// الاستعمال: node scripts/spikes/t02-evaluate.mjs evidence/T-0.2/raw/engines.json [ملفات أخرى] --out evidence/T-0.2/raw/validator.json
import fs from 'node:fs';
import { summarize, validate } from './t02-validator.mjs';
import { writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const files = args.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const data = { masked: files[0].masked, results: files.flatMap((f) => f.results) };
const masked = data.masked;

const engines = [];
const evaluate = (label, browser, outputs) => {
  if (!outputs?.length) return;
  const rows = outputs.map((o, i) => ({ i, input: masked[i].masked, output: o?.text ?? o?.result?.[0]?.translation_text ?? o?.error ?? null, ...validate(masked[i].tokens, o?.text ?? o?.result?.[0]?.translation_text ?? '') }));
  engines.push({ engine: label, browser, summary: summarize(rows), rows });
};

for (const r of data.results) {
  evaluate('Translator API', r.browser, r.extensionPage?.withActivation?.outputs);
  evaluate('ONNX opus-mt-en-ar (>>ara<<)', r.browser, r.onnx?.sentences);
  evaluate('ONNX opus-mt-en-ar (بلا رمز اللغة)', r.browser, r.onnx?.sentencesNoPrefix);
  evaluate('Firefox trial.ml', r.browser, r.ml?.sentences);
}
const output = { tokensTotal: masked.reduce((a, m) => a + m.tokens.length, 0), sentences: masked.length, engines };
for (const e of engines) console.error(`${e.engine} · ${e.browser}: ${e.summary.pass}/${e.summary.total} · ${Object.entries(e.summary.byType).map(([k, v]) => `${k} ${v.count}`).join('، ')}`);
if (outFile) writeJson(outFile, output);
