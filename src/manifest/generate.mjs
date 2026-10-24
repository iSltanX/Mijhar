// يولّد manifest.json لكل هدف من src/manifest/<target>.json ويضيف النسخة من package.json،
// ويفرض الحدّ الأدنى من الصلاحيات (EXECUTION_PLAN.md ‏4.2) قبل أن يُكتب شيء في dist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const TARGETS = ['chromium', 'firefox'];
export const BASE_HOST = 'https://github.com/*';
// المضيفات الاختيارية المسموحة: تُطلب بنقر صريح ولا تُمنح عند التثبيت (AD-08). api.github.com يملك تدفقه T-1.4؛
// وتضيف المرحلة التي تحتاج مضيفًا آخر (المزوّد أو النموذج) سطره هنا. api.anthropic.com: مزوّد التحليل (MJ21، DEC-09، AD-19)، تطلبه بطاقة المفتاح.
// generativelanguage.googleapis.com: مزوّد التحليل Google Gemini (MJ25، T-11.12، AD-32).
export const OPTIONAL_HOSTS = ['https://api.github.com/*', 'https://api.anthropic.com/*', 'https://generativelanguage.googleapis.com/*'];

// أنماط المضيف الأساسية: ما يُمنح عند التثبيت. أما optional_host_permissions فتُطلب عند الحاجة ولا تُفحص هنا.
export function primaryHostPatterns(manifest) {
  const fromPermissions = (manifest.permissions ?? []).filter((p) => p === '<all_urls>' || p.includes('://'));
  const fromContentScripts = (manifest.content_scripts ?? []).flatMap((c) => c.matches ?? []);
  return [...(manifest.host_permissions ?? []), ...fromPermissions, ...fromContentScripts];
}

export function assertManifest(target, manifest) {
  const problems = [];
  if (manifest.manifest_version !== 3) problems.push('manifest_version يجب أن يكون 3');

  const text = JSON.stringify(manifest);
  if (text.includes('<all_urls>') || text.includes('*://*/*')) problems.push('يوجد نمط يشمل كل المواقع');
  for (const pattern of primaryHostPatterns(manifest)) {
    if (pattern !== BASE_HOST) problems.push(`نمط مضيف أساسي خارج ${BASE_HOST}: ${pattern}`);
  }

  for (const pattern of manifest.optional_host_permissions ?? []) {
    if (!OPTIONAL_HOSTS.includes(pattern)) problems.push(`مضيف اختياري غير مسموح: ${pattern}`);
  }

  const bg = manifest.background ?? {};
  if (target === 'chromium') {
    if (!bg.service_worker) problems.push('عائلة Chromium تحتاج background.service_worker');
    if (bg.scripts) problems.push('background.scripts مفتاح Firefox');
    if (!manifest.side_panel) problems.push('عائلة Chromium تحتاج side_panel');
    if (manifest.sidebar_action) problems.push('sidebar_action مفتاح Firefox');
  } else {
    if (!bg.scripts) problems.push('Firefox يحتاج background.scripts');
    if (bg.service_worker) problems.push('Firefox لا يدعم background.service_worker');
    if (!manifest.sidebar_action) problems.push('Firefox يحتاج sidebar_action');
    if (manifest.side_panel) problems.push('side_panel مفتاح عائلة Chromium');
  }

  if (problems.length) throw new Error(`مانيفست ${target} غير صالح:\n- ${problems.join('\n- ')}`);
}

export function generateManifest(target, { version }) {
  if (!TARGETS.includes(target)) throw new Error(`هدف غير معروف: ${target}`);
  const source = JSON.parse(fs.readFileSync(path.join(DIR, `${target}.json`), 'utf8'));
  const { manifest_version, name, ...rest } = source;
  const manifest = { manifest_version, name, version, ...rest };
  assertManifest(target, manifest);
  return manifest;
}
