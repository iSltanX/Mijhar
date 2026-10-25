#!/usr/bin/env node
// يكتب PRIVACY.md في جذر المستودع من مصدره الواحد Docs/Site/privacy.md (AD-35، T-10.2، MJ26)، فلا تنشأ سياستان متعارضتان: يُحذف ما يخص مواصفة الموقع
// (التنبيه الأول، وقسم «الرأس»، وعلامات الحالة، وملاحظة «متاح» حالة النشر، ورابط العودة، وجدول الأدلة)، وتُحوَّل عناوين الأقسام إلى عناوين بمراسٍ ثابتة،
// وروابط الموقع إلى ما يقابلها في المستودع، ويُكتب رقم الإصدار من package.json. ثم يتحقق أن لا علامة غير محسومة بقيت (⟨…⟩ أو [بعد …] أو [قرار]).
// الاستعمال: node scripts/privacy.mjs [--check]   (--check يفشل إن اختلف PRIVACY.md عمّا يولّده)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveDateOf, formatArabicDate } from './privacy-date.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'Docs/Site/privacy.md';
const TARGET = 'PRIVACY.md';
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function generate(source = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8')) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let skip = false;
  for (const line of lines) {
    if (line.startsWith('## الرأس')) {
      skip = true;
      continue;
    }
    if (line.startsWith('## جدول الأدلة')) break;
    if (skip && line.startsWith('## ')) skip = false;
    if (skip || line.startsWith('# ') || line.startsWith('>') || line === '---') continue;
    if (/^- «متاح» حالة النشر/.test(line) || /^- \*\*رابط العودة أسفل الصفحة/.test(line)) continue;
    const heading = /^(#{2,3}) (.+?) — `#([a-z-]+)`$/.exec(line);
    if (heading) {
      out.push(`<a id="${heading[3]}"></a>`, '', `${heading[1]} ${heading[2]}`);
      continue;
    }
    out.push(
      line
        .replace(/\| متاح \*\*\[بعد M\]\*\* /g, `| مضمّن في الإصدار ${version} `)
        .replace(/\s*\*\*\[(بعد [A-Z]|قرار)\]\*\*/g, '')
        .replace(/\(\/Mjhr\/privacy(#[a-z-]+)\)/g, '($1)')
        // عناوين help.md فيها مرساة الموقع نصًّا، فلا تقابلها مرساة GitHub: يُربط الملف نفسه.
        .replace(/\(\/Mjhr\/support(#[a-z-]+)?\)/g, '(Docs/Site/help.md)')
        .replace(/\(\/Mjhr\)/g, '(README.md)'),
    );
  }
  const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // تاريخ السريان من سطره في قسم الرأس (`scripts/privacy-effective.mjs`): يُكتب حين يُثبَّت، ولا عبارة مؤقتة مكانه قبل ذلك.
  const effective = effectiveDateOf(source, { required: false });
  const head = [
    '<div dir="rtl">',
    '',
    '# سياسة الخصوصية — مِجهَر',
    '',
    `تصف هذه السياسة ما تحفظه إضافة مِجهَر على جهازك، وما ترسله، وإلى من، ومتى، كما تفعله شيفرة الإصدار ${version}. مِجهَر إضافة متصفح لصفحات GitHub، تصميم وتطوير سلطان ([bysltan.com](https://bysltan.com)).`,
    '',
    ...(effective ? [`تسري من ${formatArabicDate(effective)}.`, ''] : []),
    `> هذا الملف مولَّد من [\`${SOURCE}\`](${SOURCE}) بالأمر \`node scripts/privacy.mjs\`؛ يُعدَّل المصدر ثم يُعاد التوليد، ولا يُحرَّر هنا.`,
    '',
  ];
  const text = `${head.join('\n')}\n${body}\n\n</div>\n`;
  const leftovers = text.match(/⟨[^⟩]*⟩|\[بعد [^\]]*\]|\[قرار\]|\/Mjhr|`#[a-z-]+`$/gm);
  if (leftovers) throw new Error(`بقيت في PRIVACY.md علامات غير محسومة: ${[...new Set(leftovers)].join('، ')}`);
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const text = generate();
  const file = path.join(ROOT, TARGET);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
      console.error(`${TARGET} لا يطابق ما يولّده scripts/privacy.mjs من ${SOURCE}؛ شغّله بلا --check`);
      process.exit(1);
    }
    console.log(`${TARGET} مطابق لمصدره`);
  } else {
    fs.writeFileSync(file, text);
    console.log(`كُتب ${TARGET} من ${SOURCE} (${Buffer.byteLength(text)} بايت)`);
  }
}
