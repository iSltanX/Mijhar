// يبني إضافة اختبارية صغيرة (لا تُشحن) لتجارب TEST-CORE-04 وHYP-06 في المتصفحات الحقيقية.
// المتغيرات (variant) للصلاحية unlimitedStorage:
//   baseline: لا تُعلن (الصلاحية الوحيدة storage)؛  optional: في optional_permissions؛  declared: في permissions.
// الاستعمال: node tests/core/storage/browser/build.mjs [--out <مجلد>]  ← dist/core-test/<target>-<variant>/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

export const VARIANTS = ['baseline', 'optional', 'declared'];
export const TARGETS = ['chromium', 'firefox'];

const ENTRIES = [
  { name: 'page', source: 'entries/page.ts', global: 'MijharTestPage' },
  { name: 'content', source: 'entries/content.ts', global: 'MijharTestContent' },
  { name: 'background', source: 'entries/background.ts', global: 'MijharTestBackground' },
];

export function manifestFor(target, variant) {
  const permissions = ['storage', ...(variant === 'declared' ? ['unlimitedStorage'] : [])];
  const manifest = {
    manifest_version: 3,
    name: `mijhar-core-test-${variant}`,
    version: '0.0.1',
    permissions,
    host_permissions: ['https://github.com/*'],
    content_scripts: [{ matches: ['https://github.com/*'], js: ['content.js'], run_at: 'document_idle' }],
  };
  // alarms شاهد: صلاحية اختيارية عادية تُطلب بالمسار نفسه لتمييز رفض unlimitedStorage عن غياب فعل المستخدم.
  if (variant === 'optional') manifest.optional_permissions = ['unlimitedStorage', 'alarms'];
  if (target === 'chromium') manifest.background = { service_worker: 'background.js' };
  else {
    manifest.background = { scripts: ['background.js'] };
    manifest.browser_specific_settings = { gecko: { id: 'core-test@mijhar.local', data_collection_permissions: { required: ['none'] } } };
  }
  return manifest;
}

export async function buildTestExtension(target, variant, outRoot = path.join(ROOT, 'dist/core-test')) {
  const outDir = path.join(outRoot, `${target}-${variant}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const entry of ENTRIES) {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      mode: target,
      logLevel: 'warn',
      build: {
        outDir,
        lib: { entry: path.join(HERE, entry.source), formats: ['iife'], name: entry.global, fileName: () => `${entry.name}.js` },
      },
    });
  }
  fs.copyFileSync(path.join(HERE, 'page.html'), path.join(outDir, 'page.html'));
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifestFor(target, variant), null, 2)}\n`);
  return outDir;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outRoot = outIndex === -1 ? undefined : path.resolve(args.splice(outIndex, 2)[1]);
  for (const target of TARGETS) for (const variant of VARIANTS) console.log(await buildTestExtension(target, variant, outRoot));
}
