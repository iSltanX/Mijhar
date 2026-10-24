#!/usr/bin/env node
// TEST-SEC-06 (AC-F7 (١) و(٢)) على الشيفرة المبنية للحزمتين (dist/chromium وdist/firefox بعد npm run build): فحص ساكن لما يُشحن فعلًا.
//  (١) رمز الكتابة: مفتاحا تخزينه في background.js (القارئ الوحيد لخطوة التنفيذ) وoptions.js (الحفظ والمسح) وحدهما، لا في content.js ولا sidepanel.js؛
//      وعمليات الكتابة الثلاث (git/refs وPUT contents وpulls) في background.js وحده؛ وترويسة Authorization لا تُبنى في content.js ولا sidepanel.js.
//      ورمز القراءة ورمز الكتابة في مفتاحين مستقلين.
//  (٢) لا تنفيذ لنص: لا eval ولا new Function ولا مؤقت بنص ولا innerHTML/outerHTML/insertAdjacentHTML/document.write ولا scripting.executeScript في أي ملف.
// الاستعمال: node tests/core/guardrails/built-check.mjs [--out-dir evidence/T-11.9]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const TARGETS = ['chromium', 'firefox'];

const WRITE_KEYS = ['mijhar.secret.githubWrite', '"githubWrite"'];
const READ_KEYS = ['mijhar.secret.githubToken', '"githubToken"'];
const SINKS = [
  ['eval(', /(^|[^\w.$])eval\s*\(/],
  ['new Function', /new\s+Function\s*\(/],
  ['setTimeout(نص)', /set(?:Timeout|Interval)\s*\(\s*['"`]/],
  // Preact يفرغ العنصر بـinnerHTML = "" وحده (بلا محتوى)، وdangerouslySetInnerHTML فيه يرمي في بناء مِجهَر؛ فما سوى التفريغ مخالفة.
  ['innerHTML = (بمحتوى)', /\.innerHTML\s*=(?!=)(?!\s*""\s*[),;])/],
  ['outerHTML =', /\.outerHTML\s*=(?!=)/],
  ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
  ['document.write', /document\.write(?:ln)?\s*\(/],
  ['executeScript', /executeScript\s*\(/],
  ['createContextualFragment', /createContextualFragment\s*\(/],
];

/** يفحص حزمة مبنية واحدة؛ ويعيد البنود بنتائجها (pass وdetail). */
export function checkBundle(target, dir = path.join(ROOT, 'dist', target)) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  const has = (needle) => files.filter((f) => text[f].includes(needle));
  const items = [];
  const item = (id, title, pass, detail) => items.push({ id, title, pass: Boolean(pass), detail });
  for (const needed of ['background.js', 'content.js', 'options.js', 'sidepanel.js']) item(`file:${needed}`, `${needed} مبني`, files.includes(needed), files.join(' '));

  const writeHolders = [...new Set(WRITE_KEYS.flatMap(has))].sort();
  item('write-key-holders', 'مفتاحا رمز الكتابة في background.js وoptions.js وحدهما', JSON.stringify(writeHolders) === JSON.stringify(['background.js', 'options.js']), writeHolders);
  const readHolders = [...new Set(READ_KEYS.flatMap(has))].sort();
  item('separate-keys', 'رمز القراءة ورمز الكتابة في مفتاحين مستقلين (لا يشترك ملف في مفتاح واحد لهما)', WRITE_KEYS.every((k) => !READ_KEYS.includes(k)) && readHolders.length > 0, { readHolders, writeHolders });

  // أجسام العمليات الثلاث كما تبنيها بوابة الكتابة (src/core/guardrails/write-gate.ts) من الخطة.
  const writeOps = ['ref: `refs/heads/${plan.branch}`', 'content: utf8ToBase64(plan.content)', 'head: plan.branch'];
  const opHolders = [...new Set(writeOps.flatMap(has))].sort();
  item('write-ops', 'عمليات الكتابة الثلاث (الفرع والملف والطلب) في background.js وحده', JSON.stringify(opHolders) === JSON.stringify(['background.js']) && writeOps.every((o) => text['background.js'].includes(o)), opHolders);
  const putHolders = files.filter((f) => /method:\s*"PUT"|method:\s*'PUT'|"PUT"/.test(text[f]));
  item('put-only-background', 'طريقة PUT في background.js وحده', putHolders.every((f) => f === 'background.js'), putHolders);
  const merge = files.filter((f) => /\/merge`|\/merge"|\/merge'|method:\s*["'](?:DELETE|PATCH)["']/.test(text[f]));
  item('no-merge-close-delete', 'لا دمج (/merge) ولا DELETE ولا PATCH في أي ملف', merge.length === 0, merge);

  const authBuilders = files.filter((f) => /Authorization\s*[:=]|\.Authorization\s*=|"Authorization"|'Authorization'/.test(text[f]));
  item('auth-only-background-options', 'ترويسة Authorization لا تُبنى في content.js ولا sidepanel.js', !authBuilders.includes('content.js') && !authBuilders.includes('sidepanel.js'), authBuilders);
  const gate = has('خطوة تنفيذ جارية');
  item('execution-service-background', 'خدمة التنفيذ في background.js وحده', JSON.stringify(gate) === JSON.stringify(['background.js']), gate);
  // واجهة المسار تُرسم في اللوحة الأصلية وحدها (اختبار الدرج يثبت أنها لا تُرسم فيه)، ولا شيء منها في الخلفية ولا الإعدادات.
  const panelPath = has('راجعتُ الفرق وأوافق على هذا النطاق وحده');
  item('execution-ui-panel', 'موافقة النطاق في حزمة اللوحة (sidepanel.js) لا في background.js ولا options.js', panelPath.includes('sidepanel.js') && !panelPath.includes('background.js') && !panelPath.includes('options.js'), panelPath);

  for (const [name, re] of SINKS) {
    const offenders = files.filter((f) => re.test(text[f]));
    item(`sink:${name}`, `لا ${name} في أي ملف مبني`, offenders.length === 0, offenders);
  }
  return { target, files, items, pass: items.every((i) => i.pass) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out-dir');
  const outDir = at === -1 ? null : path.resolve(args[at + 1]);
  const results = TARGETS.map((t) => checkBundle(t));
  for (const r of results) {
    console.log(`\n== ${r.target}: ${r.pass ? 'اجتاز' : 'فشل'}`);
    for (const i of r.items) console.log(`${i.pass ? '✓' : '✗'} ${i.title}${i.pass ? '' : ` — ${JSON.stringify(i.detail)}`}`);
  }
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'built-check.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`);
  }
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
