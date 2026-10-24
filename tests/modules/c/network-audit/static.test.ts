// الفحص الساكن لمسار الترجمة (T-4.5، AC-C6، TEST-PRIV-01 شطر المانيفست والشيفرة): يطبَّق على مانيفست المصدر وعلى شيفرة src الفعلية (لا مضيف ترجمة سحابي، ولا
// استدعاء شبكة في مسار الترجمة، ولا صلاحية تشمل كل المواقع)، وعلى عينات تثبت أن الفاحص يكشف كل نوع مخالفة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MODEL_HOSTS,
  auditBundle,
  auditManifest,
  auditSources,
  CLOUD_TRANSLATION_HOSTS,
  hostCovers,
  hostMatches,
  hostOfMatchPattern,
  hostsInText,
  stripComments,
  TRANSLATION_PATH_DIRS,
} from '../../../../src/modules/c/network-audit/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const manifest = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/manifest', `${name}.json`), 'utf8'));

function sourceFiles(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push({ path: path.relative(ROOT, full).split(path.sep).join('/'), text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

describe('السياسة تحت DEC-03 ج-2', () => {
  it('لا مضيف نموذج معلن للإضافة: المتصفح ينزّل حزمة لغته بنفسه', () => {
    expect(ALLOWED_MODEL_HOSTS).toEqual([]);
  });

  it('قائمة الكشف تغطي مزودي الترجمة السحابية الشائعين وواجهات النماذج المستضافة', () => {
    for (const host of ['translate.googleapis.com', 'api.deepl.com', 'api.cognitive.microsofttranslator.com', 'api.openai.com', 'api.anthropic.com', 'huggingface.co']) expect(CLOUD_TRANSLATION_HOSTS).toContain(host);
  });

  it('مطابقة المضيف: هو أو نطاق فرعي، والنطاق الأوسع يغطي ما تحته', () => {
    expect(hostMatches('eu.api.deepl.com', ['api.deepl.com'])).toBe(true);
    expect(hostMatches('notdeepl.com', ['deepl.com'])).toBe(false);
    expect(hostCovers('deepl.com', ['api.deepl.com'])).toBe(true);
    expect(hostCovers('github.com', ['api.deepl.com'])).toBe(false);
  });
});

describe('hostOfMatchPattern وhostsInText', () => {
  it.each([
    ['https://github.com/*', 'github.com'],
    ['https://api.github.com/*', 'api.github.com'],
    ['https://*.deepl.com/*', 'deepl.com'],
    ['*://example.org/path', 'example.org'],
    ['<all_urls>', null],
    ['https://*/*', null],
    ['permission-name', null],
  ])('%s ← %s', (pattern, host) => expect(hostOfMatchPattern(pattern)).toBe(host));

  it('مضيفات الروابط الصريحة في نص', () => {
    expect(hostsInText("connect-src 'self' https://api.deepl.com wss://x.example.org:8443/ws; img-src https://a.b.c/")).toEqual(['api.deepl.com', 'x.example.org', 'a.b.c']);
  });
});

describe('auditManifest', () => {
  it.each(['chromium', 'firefox'])('مانيفست المصدر %s: لا مخالفة ولا تحذير، ومضيفاته github.com وapi.github.com ومضيف مزوّد التحليل الاختياري (MJ21) وحدها', (name) => {
    const result = auditManifest(manifest(name));
    expect(result.findings).toEqual([]);
    expect([...new Set(result.hosts.map((h: { host: string }) => h.host))].sort()).toEqual(['api.anthropic.com', 'api.github.com', 'github.com']);
  });

  it('مضيف مزوّد التحليل (MJ21): صلاحية اختيارية وحدها مقبولة، وفي host_permissions مخالفة؛ وفي شيفرة مسار الترجمة مخالفة وخارجه مقبول', () => {
    expect(auditManifest({ optional_host_permissions: ['https://api.anthropic.com/*'] }).findings).toEqual([]);
    expect(auditManifest({ host_permissions: ['https://api.anthropic.com/*'] }).findings).toEqual([expect.objectContaining({ severity: 'violation', rule: 'cloud-translation-host' })]);
    const files = (path: string) => [{ path, text: 'const u = "https://api.anthropic.com/v1/messages";' }];
    expect(auditSources(files('src/modules/c/engines/x.ts')).findings).toEqual([expect.objectContaining({ severity: 'violation', rule: 'cloud-translation-host' })]);
    expect(auditSources(files('src/modules/e/provider/x.ts')).findings).toEqual([]);
    expect(auditSources([{ path: 'src/modules/e/provider/x.ts', text: 'const u = "https://api.openai.com/v1";' }]).findings).toEqual([expect.objectContaining({ severity: 'violation' })]);
  });

  it('مضيف ترجمة سحابي في host_permissions أو optional_host_permissions مخالفة', () => {
    for (const field of ['host_permissions', 'optional_host_permissions']) {
      const r = auditManifest({ [field]: ['https://api.deepl.com/*'] });
      expect(r.findings, field).toEqual([expect.objectContaining({ severity: 'violation', rule: 'cloud-translation-host', where: field })]);
    }
  });

  it('صلاحية النطاق الكامل («https://*.deepl.com/*») مخالفة لأنها تغطي مضيف الخدمة', () => {
    expect(auditManifest({ host_permissions: ['https://*.deepl.com/*'] }).findings[0]).toMatchObject({ severity: 'violation', rule: 'cloud-translation-host' });
  });

  it('مطابقة سكربت المحتوى أو الموارد المتاحة لمضيف سحابي مخالفة', () => {
    expect(auditManifest({ content_scripts: [{ matches: ['https://translate.google.com/*'] }] }).findings[0]).toMatchObject({ severity: 'violation', where: 'content_scripts[0].matches' });
    expect(auditManifest({ web_accessible_resources: [{ resources: ['x'], matches: ['https://api.openai.com/*'] }] }).findings[0]).toMatchObject({ severity: 'violation' });
  });

  it.each(['<all_urls>', '*://*/*', 'https://*/*'])('صلاحية تشمل كل المواقع (%s) مخالفة', (pattern) => {
    expect(auditManifest({ host_permissions: [pattern] }).findings[0]).toMatchObject({ severity: 'violation', rule: 'broad-host' });
  });

  it('مضيف لم تعلنه السياسة تحذير لا مخالفة', () => {
    const r = auditManifest({ optional_host_permissions: ['https://example.org/*'] });
    expect(r.findings).toEqual([expect.objectContaining({ severity: 'warning', rule: 'undeclared-host' })]);
  });

  it('CSP: مضيف سحابي مخالفة، ومضيف آخر وتنفيذ ديناميكي تحذيران', () => {
    const r = auditManifest({ content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; connect-src https://api.deepl.com https://cdn.example.org" } });
    expect(r.findings.map((f: { rule: string; severity: string }) => `${f.severity}:${f.rule}`).sort()).toEqual(['violation:cloud-translation-host', 'warning:csp-eval', 'warning:csp-host']);
  });

  it('externally_connectable مخالفة (الإضافة لا تقبل اتصالًا خارجيًا)', () => {
    expect(auditManifest({ externally_connectable: { matches: ['https://github.com/*'] } }).findings.map((f: { rule: string }) => f.rule)).toContain('externally-connectable');
  });
});

describe('stripComments', () => {
  it('يحذف شرح الكتل والأسطر ويُبقي الروابط والسلاسل', () => {
    const code = "/* fetch(x) */ const a = 'https://github.com/x'; // sendBeacon\nconst b = 1; /** XMLHttpRequest */";
    const out = stripComments(code);
    expect(out).toContain("'https://github.com/x'");
    expect(out).not.toMatch(/fetch|sendBeacon|XMLHttpRequest/);
  });
});

describe('auditSources', () => {
  const inPath = `${TRANSLATION_PATH_DIRS[0]}x.ts`;
  const outPath = 'src/core/api/client.ts';

  it('استدعاء شبكة في مسار الترجمة مخالفة، وخارجه جرد بلا مخالفة', () => {
    const r = auditSources([
      { path: inPath, text: 'export const f = () => fetch("/x");' },
      { path: outPath, text: 'export const g = () => fetch("/y");' },
    ]);
    expect(r.findings).toEqual([expect.objectContaining({ severity: 'violation', rule: 'network-api-in-translation-path', where: inPath })]);
    expect(r.networkUsage).toEqual({ [inPath]: ['fetch'], [outPath]: ['fetch'] });
  });

  it.each(['XMLHttpRequest', 'navigator.sendBeacon("u", d)', 'new WebSocket(u)', 'new EventSource(u)', 'importScripts(u)'])('%s في مسار الترجمة مخالفة', (snippet) => {
    expect(auditSources([{ path: inPath, text: `const x = ${snippet};` }]).findings[0]).toMatchObject({ rule: 'network-api-in-translation-path' });
  });

  it('ذكر fetch في تعليق أو كلمة fetchData لا يُحسب', () => {
    const r = auditSources([{ path: inPath, text: '// لا fetch هنا\n/* XMLHttpRequest */ const fetchData = 1; const refetch = 2;' }]);
    expect(r.findings).toEqual([]);
  });

  it('مضيف ترجمة سحابي في أي ملف مخالفة، ورابط آخر في مسار الترجمة تحذير', () => {
    const r = auditSources([
      { path: outPath, text: 'const u = "https://api.deepl.com/v2/translate";' },
      { path: inPath, text: 'const u = "https://example.org/a";' },
    ]);
    expect(r.findings.map((f: { rule: string; severity: string }) => `${f.severity}:${f.rule}`).sort()).toEqual(['violation:cloud-translation-host', 'warning:external-host-in-translation-path']);
  });

  it('شيفرة src الفعلية: لا مخالفة في مسار الترجمة ولا مضيف ترجمة سحابي في أي ملف', () => {
    const r = auditSources(sourceFiles('src'));
    expect(r.findings.filter((f: { severity: string }) => f.severity === 'violation')).toEqual([]);
    expect(r.translationPathFiles).toBeGreaterThan(20);
    // الجرد: مسار الترجمة بلا أي واجهة شبكة.
    const onPath = Object.keys(r.networkUsage).filter((p) => TRANSLATION_PATH_DIRS.some((d) => p.startsWith(d)));
    expect(onPath).toEqual([]);
  });
});

describe('auditBundle', () => {
  it('كلمة WebAssembly وحدها (مصطلح محمي من الترجمة) ليست محركًا', () => {
    const r = auditBundle([{ path: 'dist/content.js', text: 'var T = ["Docker", "WebAssembly", "OAuth"];' }]);
    expect(r.findings).toEqual([]);
  });

  it.each([
    ['WebAssembly.instantiate(buf)', 'WebAssembly (واجهة)'],
    ['import("./ort.wasm")', 'ملف .wasm'],
    ['import("onnxruntime-web")', 'onnxruntime'],
    ['browser.trial.ml.createEngine()', 'browser.trial.ml'],
  ])('%s ← أثر محرك خارج ج-2', (text, name) => {
    expect(auditBundle([{ path: 'dist/content.js', text }]).findings).toEqual([expect.objectContaining({ rule: 'other-engine', detail: expect.stringContaining(name) })]);
  });

  it('مضيف ترجمة سحابي في الحزمة مخالفة، وfetch وحدها تُعدّ ولا تُحسب', () => {
    const r = auditBundle([
      { path: 'dist/a.js', text: 'fetch("https://api.github.com/x")' },
      { path: 'dist/b.js', text: 'const u = "https://translate.googleapis.com/translate_a/single"' },
    ]);
    expect(r.findings).toEqual([expect.objectContaining({ rule: 'cloud-translation-host', where: 'dist/b.js' })]);
    expect(r.summary['dist/a.js']).toMatchObject({ networkApis: ['fetch'], hosts: ['api.github.com'] });
  });
});
