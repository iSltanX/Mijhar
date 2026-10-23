#!/usr/bin/env node
// تجربة T-0.5 (MJ11)، AC-S5.4 وHYP-19: دقة تقدير التكلفة قبل الإرسال. لكل حمولة: عدّ الرموز (POST /v1/messages/count_tokens) ثم
// الطلب نفسه (POST /v1/messages بـmax_tokens صغير)، ويُقارن العدّ بـusage.input_tokens المعلن، والتكلفة التقديرية (العدّ × سعر الإدخال +
// max_tokens × سعر الإخراج حدًّا أعلى) بالفعلية (usage × الأسعار). الأسعار من لقطة evidence/T-0.5/raw/pricing.md (مصدرها وتاريخها هناك).
// الحمولات من المستودع نفسه (نص عربي من وثائق المشروع، والسجل المرجعي المكتوب)؛ لا بيانات مستخدم. المفتاح من ملف ولا يُطبع ولا يُكتب.
// الاستعمال: T05_PROVIDER_KEY_FILE=<ملف> node scripts/spikes/t05-cost.mjs [--out evidence/T-0.5/raw/cost.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keyFile = process.env.T05_PROVIDER_KEY_FILE;
if (!keyFile || !fs.existsSync(keyFile)) throw new Error('T05_PROVIDER_KEY_FILE غير موجود');
const KEY = fs.readFileSync(keyFile, 'utf8').trim();
const MODEL = process.env.T05_PROVIDER_MODEL ?? 'claude-haiku-5-5';
// Haiku 5.5 للبرومبت حتى 100,000 رمز (pricing.md): 0.10 إدخال و0.50 إخراج لكل مليون رمز.
const PRICE = { input: 0.1, output: 0.5, source: 'evidence/T-0.5/raw/pricing.md (2026-10-23)' };
const MAX_TOKENS = 64;

const headers = { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await response.json();
  return { status: response.status, json };
};

const arabic = fs.readFileSync(path.join(ROOT, 'evidence/T-5.3/report.md'), 'utf8').slice(0, 6000);
const log = fs.readFileSync(path.join(ROOT, 'fixtures/logs/fixture-action-logs-with-secrets.txt'), 'utf8');
const SYSTEM = 'أنت مساعد يشرح فشل فحوص CI بالعربية. افصل الحقيقة المنقولة عن الاحتمال.';
const PAYLOADS = [
  { id: 'ping', system: null, text: 'ping' },
  { id: 'arabic-mixed', system: SYSTEM, text: `لخّص التقرير التالي في سطر واحد:\n\n${arabic}` },
  { id: 'reference-log', system: SYSTEM, text: `اشرح سبب فشل هذا السجل في سطر واحد:\n\n${log}` },
];

const usd = (n) => Math.round(n * 1e8) / 1e8;
const result = { measuredAt: new Date().toISOString(), model: MODEL, price: PRICE, maxTokens: MAX_TOKENS, payloads: [] };
for (const p of PAYLOADS) {
  const messages = [{ role: 'user', content: p.text }];
  const base = { model: MODEL, messages, ...(p.system ? { system: p.system } : {}) };
  const count = await post('https://api.anthropic.com/v1/messages/count_tokens', base);
  const message = await post('https://api.anthropic.com/v1/messages', { ...base, max_tokens: MAX_TOKENS });
  const counted = count.json?.input_tokens ?? null;
  const usage = message.json?.usage ?? null;
  const estimate = counted !== null ? usd((counted * PRICE.input + MAX_TOKENS * PRICE.output) / 1e6) : null;
  const estimateInput = counted !== null ? usd((counted * PRICE.input) / 1e6) : null;
  const actual = usage ? usd((usage.input_tokens * PRICE.input + usage.output_tokens * PRICE.output) / 1e6) : null;
  result.payloads.push({
    id: p.id,
    chars: p.text.length + (p.system?.length ?? 0),
    countStatus: count.status,
    countError: count.json?.error ?? null,
    countedInputTokens: counted,
    messageStatus: message.status,
    messageError: message.json?.error ?? null,
    responseModel: message.json?.model ?? null,
    usage: usage ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cache_read_input_tokens: usage.cache_read_input_tokens ?? 0, cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0 } : null,
    inputDiff: usage && counted !== null ? usage.input_tokens - counted : null,
    inputDiffPercent: usage && counted ? Math.round(((usage.input_tokens - counted) / counted) * 10000) / 100 : null,
    stopReason: message.json?.stop_reason ?? null,
    costUSD: { estimateInputOnly: estimateInput, estimateUpperBound: estimate, actual },
  });
}
let text = JSON.stringify(result);
if (text.includes(KEY)) text = text.split(KEY).join('«مفتاح محجوب»');
const safe = JSON.parse(text);
if (outFile) writeJson(outFile, safe);
for (const p of safe.payloads) console.error(`${p.id}: عدّ ${p.countedInputTokens} · مستهلك ${p.usage?.input_tokens} (فرق ${p.inputDiff}) · إخراج ${p.usage?.output_tokens} · تقدير ${p.costUSD.estimateUpperBound}$ فعلي ${p.costUSD.actual}$`);
