#!/usr/bin/env node
// يتحقق من بيانات القاموس (TEST-GLOSS-05 / AC-3.1) ويطبع عدد المدخلات وما أُزيل من عبارات المحاكاة.
// الاستعمال: node scripts/glossary/validate.mjs        — يخرج بالرمز 1 عند أي مخالفة.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatReport, loadGlossaryFiles, validateGlossary } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function run(root = ROOT) {
  const result = validateGlossary(loadGlossaryFiles(root));
  return { ...result, report: formatReport(result) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { errors, report } = run();
  console.log(report);
  process.exitCode = errors.length === 0 ? 0 : 1;
}
