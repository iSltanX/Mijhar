// الفحص الساكن لمسار الترجمة (T-4.5، AC-C6): المانيفست (الصلاحيات ومضيفاتها واختياريها وCSP وما يطابقه سكربت المحتوى) والشيفرة المصدرية والحزمة المبنية.
// دوال نقية على نصوص وكائنات: scripts/network-audit.mjs يقرأ الملفات ويستدعيها، وvitest يختبرها بعينات. لا مضيف نموذج للإضافة تحت ج-2 (policy.mjs).
import { ALLOWED_MODEL_HOSTS, ANALYSIS_PROVIDER_HOSTS, BROAD_HOST_PATTERNS, CLOUD_TRANSLATION_HOSTS, DECLARED_MANIFEST_HOSTS, hostCovers, hostMatches, NETWORK_API_PATTERNS, OTHER_ENGINE_PATTERNS, TRANSLATION_PATH_DIRS } from './policy.mjs';

/** @typedef {{ severity: 'violation' | 'warning' | 'info', rule: string, where: string, detail: string }} Finding */

/** مضيف نمط مطابقة المانيفست («https://api.github.com/*» ← api.github.com)، أو null لما لا مضيف له (<all_urls>). */
export function hostOfMatchPattern(pattern) {
  const m = /^(?:\*|https?|wss?|ftp|file):\/\/([^/]*)\//.exec(pattern);
  if (!m) return null;
  const host = (m[1] ?? '').replace(/^\*\./, '');
  return host === '*' || host === '' ? null : host.toLowerCase();
}

/** مضيفات URLs صريحة داخل نص (قيمة CSP أو شيفرة). */
export function hostsInText(text) {
  const hosts = new Set();
  for (const m of text.matchAll(/\b(?:https?|wss?):\/\/([a-z0-9][a-z0-9.-]*[a-z0-9])(?::\d+)?/gi)) hosts.add((m[1] ?? '').toLowerCase());
  return [...hosts];
}

function manifestPatterns(manifest) {
  /** @type {{ where: string, pattern: string }[]} */
  const out = [];
  const add = (where, list) => {
    for (const pattern of list ?? []) out.push({ where, pattern: String(pattern) });
  };
  add('host_permissions', manifest.host_permissions);
  add('optional_host_permissions', manifest.optional_host_permissions);
  add('permissions', (manifest.permissions ?? []).filter((p) => /[:*]/.test(String(p))));
  add('optional_permissions', (manifest.optional_permissions ?? []).filter((p) => /[:*]/.test(String(p))));
  (manifest.content_scripts ?? []).forEach((cs, i) => add(`content_scripts[${i}].matches`, cs.matches));
  (manifest.web_accessible_resources ?? []).forEach((r, i) => add(`web_accessible_resources[${i}].matches`, r.matches));
  add('externally_connectable.matches', manifest.externally_connectable?.matches);
  return out;
}

function cspStrings(manifest) {
  const csp = manifest.content_security_policy;
  if (!csp) return [];
  return typeof csp === 'string' ? [['content_security_policy', csp]] : Object.entries(csp).map(([k, v]) => [`content_security_policy.${k}`, String(v)]);
}

/**
 * فحص المانيفست. مخالفة: مضيف ترجمة سحابي في أي حقل، أو صلاحية تشمل كل المواقع، أو مضيف في CSP/externally_connectable.
 * تحذير: مضيف لم تُعلنه السياسة (DECLARED_MANIFEST_HOSTS) للمراجعة. معلومة: كل مضيف وأين.
 * @returns {{ findings: Finding[], hosts: { host: string, where: string }[], permissions: string[], optionalPermissions: string[], csp: string[] }}
 */
export function auditManifest(manifest, { declared = DECLARED_MANIFEST_HOSTS, cloud = CLOUD_TRANSLATION_HOSTS, allowedModel = ALLOWED_MODEL_HOSTS, analysis = ANALYSIS_PROVIDER_HOSTS } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  const hosts = [];
  for (const { where, pattern } of manifestPatterns(manifest)) {
    if (BROAD_HOST_PATTERNS.includes(pattern)) {
      findings.push({ severity: 'violation', rule: 'broad-host', where, detail: `صلاحية تشمل كل المواقع: ${pattern}` });
      continue;
    }
    const host = hostOfMatchPattern(pattern);
    if (host === null) continue;
    hosts.push({ host, where });
    // مضيف مزوّد التحليل صلاحيةً اختيارية وحدها (MJ21)؛ وفي أي حقل آخر مخالفة كغيره.
    if (where === 'optional_host_permissions' && hostMatches(host, analysis)) continue;
    if (hostCovers(host, cloud) && !hostMatches(host, allowedModel)) findings.push({ severity: 'violation', rule: 'cloud-translation-host', where, detail: `مضيف ترجمة سحابي في المانيفست: ${host}` });
    else if (!hostMatches(host, declared) && !hostMatches(host, allowedModel)) findings.push({ severity: 'warning', rule: 'undeclared-host', where, detail: `مضيف لم تعلنه سياسة المسار: ${host}` });
  }
  const csp = cspStrings(manifest);
  for (const [where, value] of csp) {
    for (const host of hostsInText(value)) {
      if (hostMatches(host, cloud)) findings.push({ severity: 'violation', rule: 'cloud-translation-host', where, detail: `مضيف ترجمة سحابي في CSP: ${host}` });
      else findings.push({ severity: 'warning', rule: 'csp-host', where, detail: `مضيف في CSP: ${host}` });
    }
    if (/\bunsafe-eval\b|\bwasm-unsafe-eval\b/.test(value)) findings.push({ severity: 'warning', rule: 'csp-eval', where, detail: `CSP يفتح التنفيذ الديناميكي: ${value}` });
  }
  const connectable = manifest.externally_connectable;
  if (connectable) findings.push({ severity: 'violation', rule: 'externally-connectable', where: 'externally_connectable', detail: 'الإضافة تقبل اتصالًا من صفحات أو إضافات خارجية' });
  const permissions = (manifest.permissions ?? []).map(String);
  const optionalPermissions = (manifest.optional_permissions ?? []).map(String);
  return { findings, hosts, permissions, optionalPermissions, csp: csp.map(([where, value]) => `${where}: ${value}`) };
}

/**
 * فحص ملفات المصدر: واجهات الشبكة في مسار الترجمة مخالفة؛ ومضيفات ترجمة سحابية في أي ملف مخالفة؛ وواجهات الشبكة خارج المسار معلومة (جرد).
 * @param {{ path: string, text: string }[]} files
 */
export function auditSources(files, { cloud = CLOUD_TRANSLATION_HOSTS, dirs = TRANSLATION_PATH_DIRS, analysis = ANALYSIS_PROVIDER_HOSTS } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, string[]>} */
  const networkUsage = {};
  /** @type {Record<string, string[]>} */
  const urlsByFile = {};
  for (const { path, text } of files) {
    const onPath = dirs.some((dir) => path.startsWith(dir));
    const code = stripComments(text);
    for (const { name, pattern } of NETWORK_API_PATTERNS) {
      if (!pattern.test(code)) continue;
      (networkUsage[path] ??= []).push(name);
      if (onPath) findings.push({ severity: 'violation', rule: 'network-api-in-translation-path', where: path, detail: `استدعاء ${name} في مسار الترجمة` });
    }
    const hosts = hostsInText(code);
    if (hosts.length) urlsByFile[path] = hosts;
    for (const host of hosts) {
      // مضيف مزوّد التحليل خارج مسار الترجمة مسموح (MJ21)؛ وفيه مخالفة.
      if (hostMatches(host, cloud) && !(hostMatches(host, analysis) && !onPath)) findings.push({ severity: 'violation', rule: 'cloud-translation-host', where: path, detail: `مضيف ترجمة سحابي في الشيفرة: ${host}` });
      else if (onPath) findings.push({ severity: 'warning', rule: 'external-host-in-translation-path', where: path, detail: `رابط خارجي في مسار الترجمة: ${host}` });
    }
  }
  return { findings, networkUsage, urlsByFile, scanned: files.length, translationPathFiles: files.filter((f) => dirs.some((d) => f.path.startsWith(d))).length };
}

/** يحذف التعليقات (// و/* *\/) تقريبًا ليُقرأ الاستدعاء الفعلي لا ذكره في شرح؛ السلاسل تبقى. */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
}

/**
 * فحص ملف الحزمة المبنية: غياب مضيفات الترجمة السحابية ومحركات غير ج-2 (ONNX وWebAssembly وtrial.ml). وجود fetch في الحزمة متوقع (وحدات أخرى)، فيُعدّ ولا يُحسب مخالفة.
 * @param {{ path: string, text: string }[]} files
 */
export function auditBundle(files, { cloud = CLOUD_TRANSLATION_HOSTS, analysis = ANALYSIS_PROVIDER_HOSTS } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, { bytes: number, hosts: string[], networkApis: string[] }>} */
  const summary = {};
  for (const { path, text } of files) {
    const code = stripComments(text);
    const hosts = hostsInText(code);
    // مضيف مزوّد التحليل في الحزم متوقع (مسار التحليل، MJ21)؛ وطلبه أثناء تشغيل ترجمة يبقى مخالفة في التدقيق الديناميكي.
    for (const host of hosts) if (hostMatches(host, cloud) && !hostMatches(host, analysis)) findings.push({ severity: 'violation', rule: 'cloud-translation-host', where: path, detail: `مضيف ترجمة سحابي في الحزمة: ${host}` });
    for (const { name, pattern } of OTHER_ENGINE_PATTERNS) if (pattern.test(code)) findings.push({ severity: 'violation', rule: 'other-engine', where: path, detail: `أثر محرك خارج ج-2 في الحزمة: ${name}` });
    summary[path] = {
      bytes: text.length,
      hosts,
      networkApis: NETWORK_API_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name),
    };
  }
  return { findings, summary };
}
