#!/usr/bin/env node
// تجربة T-0.3 (MJ4): سلوك REST API العامة بلا مصادقة عند غياب البيانات وعند نفاد حد الطلبات (AC-S3.4).
// يقرأ ترويسات x-ratelimit-* من كل استجابة بدل افتراض الأرقام، ويقيس: طلبًا شرطيًا بـETag (هل يُحتسب؟)،
// ومورِدًا غير موجود، ثم يستهلك ما بقي حتى الصفر ويطلب مرة بعده، ثم يتحقق أن مسار DOM (github.com) لا يتأثر.
// الاستعمال: node scripts/spikes/t03-ratelimit.mjs --out evidence/T-0.3/raw/ratelimit.json
import { writeJson } from './lib.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];
const HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource', 'retry-after', 'etag'];

async function call(path, extra = {}) {
  const response = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mijhar-spike', ...extra } });
  const text = await response.text();
  let message = null;
  try { message = JSON.parse(text).message ?? null; } catch {}
  return { path, status: response.status, headers: Object.fromEntries(HEADERS.map((h) => [h, response.headers.get(h)])), message, at: new Date().toISOString() };
}
const rateLimit = async () => {
  const r = await fetch('https://api.github.com/rate_limit', { headers: { 'User-Agent': 'mijhar-spike' } });
  return (await r.json()).resources.core;
};

const result = { before: await rateLimit(), steps: [] };
const first = await call('/repos/nodejs/node');
result.steps.push({ step: 'طلب عادي', ...first });
result.steps.push({ step: 'طلب شرطي If-None-Match بالـETag نفسه', ...(await call('/repos/nodejs/node', { 'If-None-Match': first.headers.etag })) });
result.afterConditional = await rateLimit();
result.steps.push({ step: 'مورد غير موجود', ...(await call('/repos/nodejs/node/pulls/999999999')) });
result.steps.push({ step: 'مستودع غير موجود', ...(await call('/repos/nodejs/this-repo-does-not-exist-mijhar')) });

let remaining = Number((await rateLimit()).remaining);
let spent = 0;
while (remaining > 0 && spent < 60) {
  const r = await call('/repos/nodejs/node');
  spent += 1;
  remaining = Number(r.headers['x-ratelimit-remaining']);
  if (remaining <= 1) result.steps.push({ step: `استهلاك (${spent})`, ...r });
}
result.steps.push({ step: 'طلب بعد النفاد', ...(await call('/repos/nodejs/node')) });
result.steps.push({ step: 'طلب شرطي بعد النفاد', ...(await call('/repos/nodejs/node', { 'If-None-Match': first.headers.etag })) });
result.after = await rateLimit();

// مسار DOM على github.com لا يمر بحد api.github.com.
const dom = await fetch('https://github.com/nodejs/node/pull/66911/checks', { headers: { 'User-Agent': 'Mozilla/5.0 mijhar-spike' } });
result.domAfterExhaustion = { status: dom.status, bytes: (await dom.text()).length };

if (outFile) writeJson(outFile, result);
console.log(JSON.stringify(result, null, 2));
