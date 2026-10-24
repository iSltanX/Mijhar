#!/usr/bin/env node
// الاتصال الحقيقي بـOpenAI (MJ24، T-11.11، TEST-AI-09، AC-E11 (٥)) بمفتاح تجريبي يوفّره المالك في ملف محلي خارج المستودع، بمحوّل OpenAI نفسه (adapters/openai.ts):
//   1. فحص صيغة المفتاح محليًا (checkKey)؛ 2. التحقق GET /v1/models؛ 3. الفحص الصريح لنماذج من القائمة («ping» وحده، حد 16)؛ 4. تحليل واحد لعينة سجل عامة مكتوبة في المستودع
//   (fixtures/logs/fixture-action-log-unmatched.txt، بلا محتوى خاص) بقالب التعليمات الفعلي، ثم قراءة الرد بـparseAnalysis والتحقق من الاقتباسات.
// المفتاح يُقرأ من الملف داخل العملية ولا يُطبع ولا يُكتب في أي ناتج (يُنقَّح من كل نص قبل الحفظ). لا يُسمّى نموذج في الشيفرة: المرشحون من القائمة بترتيب الأحدث.
// الاستعمال: node scripts/spikes/t1111-openai-live.mjs <ملف المفتاح> [--out evidence/T-11.11/live/result.json] [--max-probes 8]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const outFile = take('--out');
const maxProbes = Number(take('--max-probes') ?? 8);
const keyFile = args[0];
if (!keyFile || !fs.existsSync(keyFile)) {
  console.error('الاستعمال: node scripts/spikes/t1111-openai-live.mjs <ملف المفتاح>');
  process.exit(2);
}
const KEY = fs.readFileSync(keyFile, 'utf8').trim();
const redact = (value) => JSON.parse(JSON.stringify(value ?? null).split(KEY).join('‹المفتاح›'));

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const run = { measuredAt: new Date().toISOString(), host: 'https://api.openai.com', steps: {} };
try {
  const { OPENAI_ADAPTER } = await load('/src/modules/e/provider/adapters/openai.ts');
  const { OPENAI } = await load('/src/modules/e/provider/descriptors/openai.ts');
  const { checkKey } = await load('/src/modules/e/provider/catalog.ts');
  const { gatedFetch } = await load('/src/modules/e/provider/gate.ts');
  const { systemText } = await load('/src/modules/e/provider/request.ts');
  const { parseAnalysis } = await load('/src/modules/e/provider/result.ts');
  const { scanText } = await load('/src/modules/e/privacy-check/scan.ts');

  const format = checkKey(OPENAI, KEY);
  run.steps.format = { ok: format.ok, length: KEY.length, ...(format.ok ? {} : { reason: format.reason }) };
  if (!format.ok) throw new Error(`صيغة المفتاح لا تطابق الفحص المحلي: ${format.reason}`);

  const call = { key: KEY, fetch: gatedFetch(OPENAI, { permissions: { contains: async () => true } }), now: Date.now };
  const short = (r) => (r.ok ? { ok: true, status: r.status } : { ok: false, failure: r.failure, status: r.status, message: r.message.slice(0, 240), retryAt: r.retryAt });

  const listed = await OPENAI_ADAPTER.listModels(call);
  run.steps.verify = { ...short(listed), ...(listed.ok ? { models: listed.data.models.length, allUnknown: listed.data.models.every((m) => m.compatibility === 'unknown'), source: listed.data.source, newest: listed.data.models.slice(0, maxProbes).map((m) => m.id) } : {}) };
  if (!listed.ok) throw new Error(`التحقق فشل: ${listed.failure}`);

  // الفحص الصريح: الأحدث أولًا، يتوقف عند أول نجاحين أو بلوغ الحد. فشل نموذج لا يدعم النقطة متوقع ويُسجَّل.
  run.steps.probes = [];
  const checked = [];
  for (const model of listed.data.models.slice(0, maxProbes)) {
    const r = await OPENAI_ADAPTER.probe(call, model.id);
    run.steps.probes.push({ model: model.id, ...short(r) });
    if (r.ok) checked.push(model.id);
    if (checked.length >= 2) break;
  }
  if (!checked.length) throw new Error('لم يثبت توافق أي نموذج من المرشحين (BLK-MODEL-COMPAT)');

  const log = fs.readFileSync(path.join(ROOT, 'fixtures/logs/fixture-action-log-unmatched.txt'), 'utf8');
  if (scanText(log).length) throw new Error('العينة تحمل نمط سرّ؛ لا تُرسل');
  const prompt = `# سجل فحص فشل\n\n\`\`\`\n${log}\`\`\`\n`;
  const system = systemText('حلّل فشل الفحص: السبب المحتمل بدليله، والإصلاح، والخطوة التالية.');
  const model = checked[0];
  const started = Date.now();
  const analysed = await OPENAI_ADAPTER.analyze(call, { model, system, prompt, maxTokens: 4096 });
  run.steps.analyze = { model, ms: Date.now() - started, ...short(analysed) };
  if (analysed.ok) {
    const parsed = parseAnalysis(analysed.data.text, `${system}\n${prompt}`, analysed.data.stopReason);
    run.steps.analyze.reply = {
      model: analysed.data.model,
      stopReason: analysed.data.stopReason,
      usage: analysed.data.usage,
      chars: analysed.data.text.length,
      structured: parsed.structured,
      cut: parsed.cut,
      findings: parsed.findings.map((f) => ({ text: f.text.slice(0, 160), evidence: f.evidence.map((e) => ({ found: e.found, text: e.text.slice(0, 100) })) })),
      steps: parsed.steps.length,
      missing: parsed.missing.length,
      excerpt: analysed.data.text.slice(0, 400),
    };
  }
  run.verdict = analysed.ok ? 'اجتاز' : 'فشل التحليل';
} catch (error) {
  run.error = String(error?.message ?? error).slice(0, 300);
  run.verdict = run.verdict ?? 'لم يكتمل';
} finally {
  await server.close();
}
const out = JSON.stringify(redact(run), null, 2);
if (out.includes(KEY)) throw new Error('الناتج يحمل المفتاح');
if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, `${out}\n`);
}
console.log(out);
