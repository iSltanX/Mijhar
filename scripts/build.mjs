#!/usr/bin/env node
// يبني حزمتي الإضافة: dist/chromium (عائلة Chromium) وdist/firefox.
// الاستعمال: node scripts/build.mjs [chromium|firefox ...] [--out <مجلد>]
// لكل هدف: مدخل Vite لكل نقطة دخول (iife لأن سكربتات الإضافة لا تقبل وحدات ES بلا تهيئة)، ثم manifest.json المولَّد
// وصفحات الإضافة (اللوحة الجانبية والإعدادات وعارض القراءة) والخطوط المضمّنة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { TARGETS, generateManifest } from '../src/manifest/generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ENTRIES = [
  { name: 'background', source: 'src/background/index.ts', global: 'MijharBackground' },
  { name: 'content', source: 'src/content/index.ts', global: 'MijharContent' },
  { name: 'sidepanel', source: 'src/sidepanel/main.tsx', global: 'MijharSidepanel' },
  { name: 'options', source: 'src/options/main.tsx', global: 'MijharOptions' },
  { name: 'reader', source: 'src/modules/a/reading/reader/main.tsx', global: 'MijharReader' },
];

// صفحات الإضافة: كل صفحة تحمّل حزمة مدخلها بالاسم نفسه.
export const PAGES = [
  { source: 'src/sidepanel/index.html', file: 'sidepanel.html' },
  { source: 'src/options/index.html', file: 'options.html' },
  { source: 'src/modules/a/reading/reader/index.html', file: 'reader.html' },
];

// الخطوط المضمّنة ونصوص تراخيصها (T-2.3): تُنسخ كما هي إلى fonts/ في كل حزمة.
export const FONTS_DIR = 'assets/fonts';
// أيقونات المانيفست وزر شريط الأدوات (MJ26، AD-13): صادرات R-15 في release/icons، تُنسخ إلى icons/ في كل حزمة (لا شعار المتجر).
export const ICONS_DIR = 'release/icons';
export const ICON_SIZES = [16, 32, 48, 64, 96, 128];
// إشعارات الأطراف الثالثة (AC-10.3): يولّدها scripts/notices.mjs في الجذر، وتُنسخ إلى جذر كل حزمة.
export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';

export async function buildTarget(target, outRoot = path.join(ROOT, 'dist')) {
  const outDir = path.join(outRoot, target);
  fs.rmSync(outDir, { recursive: true, force: true });

  for (const entry of ENTRIES) {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      mode: target,
      logLevel: 'warn',
      build: {
        outDir,
        lib: {
          entry: path.join(ROOT, entry.source),
          formats: ['iife'],
          name: entry.global,
          fileName: () => `${entry.name}.js`,
        },
      },
    });
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = generateManifest(target, { version });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const page of PAGES) fs.copyFileSync(path.join(ROOT, page.source), path.join(outDir, page.file));
  const fontsDir = path.join(ROOT, FONTS_DIR);
  if (fs.existsSync(fontsDir)) {
    fs.mkdirSync(path.join(outDir, 'fonts'), { recursive: true });
    for (const file of fs.readdirSync(fontsDir)) if (/\.(woff2|txt)$/.test(file)) fs.copyFileSync(path.join(fontsDir, file), path.join(outDir, 'fonts', file));
  }
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
  for (const size of ICON_SIZES) fs.copyFileSync(path.join(ROOT, ICONS_DIR, `icon-${size}.png`), path.join(outDir, 'icons', `icon-${size}.png`));
  fs.copyFileSync(path.join(ROOT, NOTICES_FILE), path.join(outDir, NOTICES_FILE));
  return outDir;
}

export async function buildAll({ targets = TARGETS, outRoot = path.join(ROOT, 'dist') } = {}) {
  const outDirs = {};
  for (const target of targets) outDirs[target] = await buildTarget(target, outRoot);
  return outDirs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex === -1 ? undefined : path.resolve(args.splice(outIndex, 2)[1]);
  const unknown = args.filter((a) => !TARGETS.includes(a));
  if (unknown.length) {
    console.error(`هدف غير معروف: ${unknown.join(' ')} (المتاح: ${TARGETS.join(' ')})`);
    process.exit(1);
  }
  const outDirs = await buildAll({ targets: args.length ? args : TARGETS, outRoot });
  for (const [target, dir] of Object.entries(outDirs)) console.log(`${target}: ${path.relative(ROOT, dir) || dir}`);
}
