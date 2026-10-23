// يبني الإضافة الاختبارية لـTEST-CORE-05 وTEST-CORE-06 (لا تُشحن): الحزمة الحقيقية نفسها (المانيفست واللوحة والإعدادات
// وصفحاتهما) مع مدخلي خلفية ومحتوى اختباريين: سكربت المحتوى الحقيقي بثماني وحدات وهمية (fake-modules.tsx)، والخلفية
// الحقيقية مع خطافات اختبار، وصفحة test.html تفتح اللوحة الأصلية بنقر وتقرأ سياقات الإضافة.
// الاستعمال: node tests/core/ui-host/browser/build.mjs [--out <مجلد>]  ← dist/ui-host-test/<target>/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { ENTRIES, PAGES } from '../../../../scripts/build.mjs';
import { TARGETS, generateManifest } from '../../../../src/manifest/generate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

const OVERRIDES = {
  background: path.join(HERE, 'entries/background.ts'),
  content: path.join(HERE, 'entries/content.tsx'),
};
const EXTRA = [{ name: 'test-page', source: path.join(HERE, 'entries/test-page.ts'), global: 'MijharTestPage' }];

export async function buildUiHostTestExtension(target, outRoot = path.join(ROOT, 'dist/ui-host-test')) {
  const outDir = path.join(outRoot, target);
  fs.rmSync(outDir, { recursive: true, force: true });
  const entries = [...ENTRIES.map((e) => ({ ...e, source: OVERRIDES[e.name] ?? path.join(ROOT, e.source) })), ...EXTRA];
  for (const entry of entries) {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      mode: target,
      logLevel: 'warn',
      build: { outDir, lib: { entry: entry.source, formats: ['iife'], name: entry.global, fileName: () => `${entry.name}.js` } },
    });
  }
  for (const page of PAGES) fs.copyFileSync(path.join(ROOT, page.source), path.join(outDir, page.file));
  fs.copyFileSync(path.join(HERE, 'test.html'), path.join(outDir, 'test.html'));
  const manifest = generateManifest(target, { version: '0.0.1' });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return outDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex === -1 ? undefined : path.resolve(args.splice(outIndex, 2)[1]);
  for (const target of TARGETS) console.log(await buildUiHostTestExtension(target, outRoot));
}
