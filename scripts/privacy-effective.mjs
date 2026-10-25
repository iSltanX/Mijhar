#!/usr/bin/env node
// يثبّت تاريخ سريان سياسة الخصوصية في مصدره الواحد (سطر «تاريخ السريان» في قسم الرأس من Docs/Site/privacy.md، AD-40) ويعيد توليد PRIVACY.md معه
// في كتابة واحدة. يبقى المصدر `⟨تاريخ النشر⟩` حتى يوم النشر الفعلي، ومنه وحده يولّد الموقع صفحته (`scripts/mjhr/legal-text.mjs` في WebSiteSultan)؛
// ولا يُمرَّر التاريخ يدويًا في أي مكان آخر. والدوالّ في scripts/privacy-date.mjs.
// الاستعمال (يوم النشر وحده، لا قبله):
//   node scripts/privacy-effective.mjs --today            ← تاريخ اليوم بتوقيت السعودية (Asia/Riyadh) لحظة التشغيل
//   node scripts/privacy-effective.mjs --date 2026-11-02  ← تاريخ صريح (يُرفض غير الصالح)
//   node scripts/privacy-effective.mjs --show             ← يطبع القيمة الحالية بلا تعديل
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFECTIVE_PLACEHOLDER, effectiveDateOf, formatArabicDate, isValidISODate, riyadhDate, setEffectiveDate } from './privacy-date.mjs';
import { generate } from './privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'Docs/Site/privacy.md';

const file = path.join(ROOT, SOURCE);
const source = fs.readFileSync(file, 'utf8');
const args = process.argv.slice(2);
const current = effectiveDateOf(source);
if (args.length === 0 || args.includes('--show')) {
  console.log(current ? `تاريخ السريان: ${current} (${formatArabicDate(current)})` : `تاريخ السريان لم يُثبَّت بعد (${EFFECTIVE_PLACEHOLDER})`);
  if (args.length === 0) console.log('الاستعمال: --today | --date YYYY-MM-DD | --show');
  process.exit(0);
}
const at = args.indexOf('--date');
const iso = args.includes('--today') ? riyadhDate() : at !== -1 ? args[at + 1] : null;
if (!iso || !isValidISODate(iso)) {
  console.error('الاستعمال: --today | --date YYYY-MM-DD (تاريخ صالح)');
  process.exit(1);
}
// يُبنى الملفان قبل أي كتابة، فإن فشل التوليد لم يُمسّ شيء.
const next = setEffectiveDate(source, iso);
const privacy = generate(next);
fs.writeFileSync(file, next);
fs.writeFileSync(path.join(ROOT, 'PRIVACY.md'), privacy);
console.log(`ثُبّت تاريخ السريان ${iso} (${formatArabicDate(iso)}، بتوقيت السعودية) في ${SOURCE}، وأُعيد توليد PRIVACY.md.`);
if (iso !== riyadhDate()) console.log(`تنبيه: اليوم بتوقيت السعودية ${riyadhDate()}، والتاريخ المثبَّت ${iso}.`);
console.log('التالي: أودِع الملفين، ثم ولّد نص الموقع منه: node scripts/mjhr/legal-text.mjs --source <هذا المستودع>/Docs/Site (في WebSiteSultan).');
