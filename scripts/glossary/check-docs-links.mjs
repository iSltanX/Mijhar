#!/usr/bin/env node
// يتحقق أن كل docsUrl في القاموس صفحة موجودة فعلًا في docs.github.com (شبكة؛ ليس جزءًا من الاختبارات الآلية).
// الاستعمال: node scripts/glossary/check-docs-links.mjs [--report <ملف.md>]
// يطلب كل رابط فريد مرة واحدة بالتتابع؛ يعدّ الاستجابة 200 سليمة، وتحويلًا (3xx) تحذيرًا، وغيرها مخالفة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/glossary/entries.json'), 'utf8'));

const byUrl = new Map();
for (const e of data.entries) if (e.docsUrl) byUrl.set(e.docsUrl, [...(byUrl.get(e.docsUrl) ?? []), e.id]);

const rows = [];
for (const [url, ids] of byUrl) {
  let status = 0;
  let note = '';
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'mijhar-glossary-link-check' } });
    status = res.status;
    if (status >= 300 && status < 400) note = `تحويل إلى ${res.headers.get('location')}`;
  } catch (error) {
    note = String(error);
  }
  rows.push({ url, ids, status, note, state: status === 200 ? 'سليم' : status >= 300 && status < 400 ? 'تحذير' : 'مخالفة' });
}

const bad = rows.filter((r) => r.state === 'مخالفة');
const warn = rows.filter((r) => r.state === 'تحذير');
const lines = [
  `# فحص روابط الوثائق في القاموس`,
  '',
  `- الروابط الفريدة: ${rows.length} · سليمة: ${rows.length - bad.length - warn.length} · تحذيرات: ${warn.length} · مخالفات: ${bad.length}`,
  '',
  '| الحالة | الرمز | الرابط | المداخل | ملاحظة |',
  '| :--- | :--- | :--- | :--- | :--- |',
  ...rows.map((r) => `| ${r.state} | ${r.status} | ${r.url} | ${r.ids.join('، ')} | ${r.note} |`),
];
const reportIndex = process.argv.indexOf('--report');
if (reportIndex >= 0) fs.writeFileSync(path.resolve(process.argv[reportIndex + 1] ?? ''), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 3).join('\n'));
for (const r of [...bad, ...warn]) console.log(`${r.state} ${r.status} ${r.url} ← ${r.ids.join(', ')} ${r.note}`);
process.exitCode = bad.length === 0 ? 0 : 1;
