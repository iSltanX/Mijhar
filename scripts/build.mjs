#!/usr/bin/env node
// يبني حزمتي الإضافة: dist/chromium (عائلة Chromium) وdist/firefox.
// الاستعمال: node scripts/build.mjs [chromium|firefox ...] [--out <مجلد>]
// لكل هدف: مدخل Vite لكل نقطة دخول (iife لأن سكربتات الإضافة لا تقبل وحدات ES بلا تهيئة)، ثم manifest.json المولَّد ولوحة الواجهة المؤقتة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { TARGETS, generateManifest } from '../src/manifest/generate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTRIES = [
  { name: 'background', source: 'src/background/index.ts', global: 'MijharBackground' },
  { name: 'content', source: 'src/content/index.ts', global: 'MijharContent' },
];

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
  // لوحة مؤقتة يتطلبها sidebar_action.default_panel؛ تستبدلها T-1.4.
  fs.copyFileSync(path.join(ROOT, 'src/manifest/sidepanel.placeholder.html'), path.join(outDir, 'sidepanel.html'));
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
