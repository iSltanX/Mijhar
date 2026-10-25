#!/usr/bin/env node
// تغليف مِجهَر للمتاجر محليًا (T-10.2، TEST-PKG-01، MJ26)، بلا رفع ولا نشر:
//   release/packages/chromium/mijhar-<النسخة>-chromium.zip  ← dist/chromium (Chrome Web Store وMicrosoft Edge Add-ons، ويُحمَّل في Brave)
//   release/packages/firefox/mijhar-<النسخة>-firefox.zip    ← dist/firefox (Firefox Add-ons)
//   release/packages/firefox/mijhar-<النسخة>-source.zip     ← الشيفرة المصدرية لمراجعي AMO لأن الحزمة مجمّعة بـVite
//   release/packages/SHA256SUMS
// يفحص كل حزمة قبل كتابتها: ملفات من قائمة مسموحة وحدها، ولا ملف خرائط ولا مخفي ولا مؤقت ولا ملف تعريف متصفح ولا اختبار ولا دليل، ولا صيغة رمز أو
// مفتاح، ولا مسار مطلق من الجهاز. والحزمة المصدرية من قائمة مسموحة صريحة (لا node_modules ولا dist ولا evidence ولا تقارير تدقيق ولا لقطات).
// الزمن في كل ملف ثابت (SOURCE_DATE)، والترتيب أبجدي، وصلاحيات كل ملف 0644 (MJ-TA-O01: لا تتبع طريقة استخراج الشجرة)، فتتطابق البصمات بين
// بناءين من الشجرة نفسها.
// الاستعمال: npm run build && node scripts/package.mjs [--check]   (--check يفحص الحزم المكتوبة دون إعادة بنائها)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release/packages');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
/** 2026-10-25 00:00 UTC بصيغة touch. */
const SOURCE_DATE = '202610250000.00';

/** ما يجوز في حزمة الإضافة: المانيفست والسكربتات والصفحات والخطوط وتراخيصها والأيقونات وملف الإشعارات. */
const PACKAGE_ALLOWED = [/^manifest\.json$/, /^(background|content|sidepanel|options|reader)\.js$/, /^(sidepanel|options|reader)\.html$/, /^fonts\/[A-Za-z0-9-]+\.(woff2|txt)$/, /^icons\/icon-(16|32|48|64|96|128)\.png$/, /^THIRD_PARTY_NOTICES\.txt$/];
/** ما يدخل حزمة المصدر: ما يلزم البناء وحده، بمسارات صريحة. */
const SOURCE_PATHS = ['src', 'scripts/build.mjs', 'scripts/notices.mjs', 'assets/fonts', 'release/icons', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'THIRD_PARTY_NOTICES.txt'];
const SOURCE_SKIP = [/(^|\/)\.[^/]+$/, /\.md$/, /^release\/icons\/store-logo-300\.png$/];

const SECRET_PATTERNS = [
  { name: 'رمز GitHub', re: /\b(?:github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{36,})\b/ },
  { name: 'مفتاح Anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'مفتاح OpenAI', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'مفتاح Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'مفتاح AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'مفتاح خاص', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'مسار من الجهاز', re: /\/(?:Users|Volumes|private\/tmp|home)\/[A-Za-z0-9._-]+\// },
];

function walk(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]))
    .sort();
}

function scanContents(root, files) {
  const problems = [];
  for (const file of files) {
    const buf = fs.readFileSync(path.join(root, file));
    if (/\.(woff2|png)$/.test(file)) continue;
    const text = buf.toString('utf8');
    for (const p of SECRET_PATTERNS) if (p.re.test(text)) problems.push(`${file}: ${p.name}`);
  }
  return problems;
}

/** ينسخ الملفات إلى مجلد مؤقت بزمن ثابت وصلاحيات ثابتة ثم يضغطها بترتيبها؛ zip -X بلا سمات إضافية، و-D بلا مدخلات مجلدات. */
function zip(sourceRoot, files, target) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-package-'));
  try {
    for (const f of files) {
      const to = path.join(stage, f);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, f), to);
      fs.chmodSync(to, 0o644);
      execFileSync('touch', ['-t', SOURCE_DATE, to]);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { force: true });
    execFileSync('zip', ['-X', '-D', '-q', '-9', target, '-@'], { cwd: stage, input: `${files.join('\n')}\n` });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

const listZip = (file) =>
  execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();

export function checkPackage(dir) {
  const files = walk(dir);
  const outside = files.filter((f) => !PACKAGE_ALLOWED.some((re) => re.test(f)));
  return { files, outside, secrets: scanContents(dir, files) };
}

function sourceFiles() {
  const files = [];
  for (const p of SOURCE_PATHS) {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) throw new Error(`مسار المصدر غائب: ${p}`);
    if (fs.statSync(abs).isDirectory()) files.push(...walk(abs).map((f) => `${p}/${f}`));
    else files.push(p);
  }
  return files.filter((f) => !SOURCE_SKIP.some((re) => re.test(f))).sort();
}

const SOURCE_README = `Mijhar ${version} — source code for Firefox Add-ons review

The extension is bundled with Vite (not minified). To reproduce dist/firefox from this archive:

Requirements: Node.js 22 or later (tested with Node 24) and npm. Any OS with a POSIX shell.

  npm ci
  npm run build

The Firefox build is written to dist/firefox (manifest.json at its root); dist/chromium is the Chromium build.
No network access is needed by the build beyond installing the locked npm dependencies.

Layout: src/ (TypeScript and Preact), scripts/build.mjs (the build), assets/fonts (bundled fonts with their OFL texts),
release/icons (manifest icons), THIRD_PARTY_NOTICES.txt (third-party licenses).
src/modules/c/network-audit/*.mjs is a development-time network-audit tool used by the project's tests; no bundle imports it.
Designed and developed by Sultan — https://bysltan.com
`;

function main() {
  const check = process.argv.includes('--check');
  const report = { version, packages: {} };
  const problems = [];
  for (const target of ['chromium', 'firefox']) {
    const dir = path.join(ROOT, 'dist', target);
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`لا بناء في dist/${target}: شغّل npm run build`);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.version !== version) problems.push(`${target}: نسخة المانيفست ${manifest.version} لا تطابق package.json ${version}`);
    const c = checkPackage(dir);
    for (const f of c.outside) problems.push(`${target}: ملف خارج القائمة المسموحة: ${f}`);
    for (const s of c.secrets) problems.push(`${target}: ${s}`);
    const file = path.join(OUT, target, `mijhar-${version}-${target}.zip`);
    if (!check && !problems.length) zip(dir, c.files, file);
    if (fs.existsSync(file) && JSON.stringify(listZip(file)) !== JSON.stringify(c.files)) problems.push(`${target}: محتوى الحزمة لا يطابق dist/${target}`);
    report.packages[target] = { file: path.relative(ROOT, file), files: c.files.length };
  }
  const src = sourceFiles();
  const srcSecrets = scanContents(ROOT, src);
  for (const s of srcSecrets) problems.push(`source: ${s}`);
  const srcFile = path.join(OUT, 'firefox', `mijhar-${version}-source.zip`);
  if (!check && !problems.length) {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-source-'));
    try {
      for (const f of src) {
        fs.mkdirSync(path.dirname(path.join(stage, f)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, f), path.join(stage, f));
      }
      fs.writeFileSync(path.join(stage, 'SOURCE-README.txt'), SOURCE_README);
      zip(stage, [...src, 'SOURCE-README.txt'].sort(), srcFile);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  report.packages.source = { file: path.relative(ROOT, srcFile), files: src.length + 1 };
  if (problems.length) {
    console.error(`لم تُكتب الحزم:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const sums = [];
  for (const { file } of Object.values(report.packages)) {
    const abs = path.join(ROOT, file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    sums.push(`${hash}  ${path.relative(OUT, abs)}`);
    console.log(`${file} · ${fs.statSync(abs).size} بايت · sha256 ${hash}`);
  }
  if (!check) fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), `${sums.join('\n')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
