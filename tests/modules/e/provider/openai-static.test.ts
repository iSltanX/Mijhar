// MJ24 (T-11.11، AC-E11 (٤) و(٦)، TEST-PRIV-05): فحص ساكن لمضيف OpenAI وملف محوّله — تدقيق الشبكة الساكن يعرف المضيف، والمانيفستان يطلبانه اختياريًا
// وحده، وإعلان Firefox كما هو، والمحوّل لا يصل غير الخلفية ولا يلمس سرًّا غير مفتاح مزوّده، ولا يطلب شبكة إلا عبر البوابة.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_PROVIDER_HOSTS, CLOUD_TRANSLATION_HOSTS } from '../../../../src/modules/c/network-audit/policy.mjs';
import { auditManifest, auditSources } from '../../../../src/modules/c/network-audit/static.mjs';
import { descriptorById } from '../../../../src/modules/e/provider/catalog';
import { PROVIDER_ADAPTERS } from '../../../../src/modules/e/provider/registry';
import { ROOT } from '../helpers';

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');

describe('تدقيق الشبكة الساكن يعرف مضيف OpenAI', () => {
  it('مضيفه في مضيفات مزوّد التحليل (وفي قائمة السحابة المحظورة في مسار الترجمة)', () => {
    expect(ANALYSIS_PROVIDER_HOSTS).toContain('api.openai.com');
    expect(CLOUD_TRANSLATION_HOSTS).toContain('api.openai.com');
  });

  it('صلاحية اختيارية وحدها مقبولة، وفي host_permissions مخالفة؛ وفي شيفرة مسار الترجمة مخالف وفي مسار التحليل مقبول', () => {
    expect(auditManifest({ optional_host_permissions: ['https://api.openai.com/*'] }).findings).toEqual([]);
    expect(auditManifest({ host_permissions: ['https://api.openai.com/*'] }).findings).toEqual([expect.objectContaining({ severity: 'violation', rule: 'cloud-translation-host' })]);
    const files = (p: string) => [{ path: p, text: 'const u = "https://api.openai.com/v1/responses";' }];
    expect(auditSources(files('src/modules/c/engines/x.ts')).findings).toEqual([expect.objectContaining({ severity: 'violation', rule: 'cloud-translation-host' })]);
    expect(auditSources(files('src/modules/e/provider/adapters/x.ts')).findings).toEqual([]);
  });
});

describe('المانيفستان وإعلان Firefox', () => {
  it.each(['chromium', 'firefox'])('%s: https://api.openai.com/* اختيارية وحدها، ولا مضيف أساسي جديد', (target) => {
    const manifest = JSON.parse(read(`src/manifest/${target}.json`)) as { optional_host_permissions?: string[]; host_permissions?: string[]; permissions?: string[] };
    expect(manifest.optional_host_permissions).toContain('https://api.openai.com/*');
    expect(manifest.host_permissions).toEqual(['https://github.com/*']);
    expect(JSON.stringify(manifest.permissions ?? [])).not.toContain('openai');
    expect(descriptorById('openai')?.origin).toBe('https://api.openai.com/*');
  });

  it('إعلان Firefox كما هو: websiteContent اختيارية وحدها، ولا مطلوب غير none', () => {
    const manifest = JSON.parse(read('src/manifest/firefox.json')) as { browser_specific_settings: { gecko: { data_collection_permissions: { required: string[]; optional?: string[] } } } };
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'], optional: ['websiteContent', 'technicalAndInteraction'] });
  });
});

describe('ملف المحوّل', () => {
  const source = code(read('src/modules/e/provider/adapters/openai.ts'));

  it('لا طلب شبكة إلا عبر طلب البوابة call.fetch (مضيف المحوّل وحده)، ولا fetch عامًّا ولا XMLHttpRequest', () => {
    expect(source).not.toMatch(/(?<![\w.$])fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts/);
    expect(source).toMatch(/call\.fetch\(/);
    // المضيف من الوصف وحده (HOST)، لا حرفيًّا في المحوّل.
    expect(source).not.toMatch(/api\.openai\.com/);
  });

  it('المفتاح من call.key وحده في ترويسة Authorization: لا في عنوان ولا جسم ولا تخزين ولا سجل', () => {
    expect(source).toMatch(/authorization: `Bearer \$\{key\}`/);
    expect(source).not.toMatch(/localStorage|sessionStorage|storage\.|console\.|chrome\.|browser\./);
    // كل ما يعود من المزوّد نصًّا يُنقَّح من المفتاح قبل أن يخرج (رسالة الخطأ والرد).
    expect(source.match(/redactKey\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('لا مودل مسمّى ولا سعر ولا تكلفة في وصف المزوّد ومحوّله (DEC-13، AD-31)', () => {
    for (const p of ['src/modules/e/provider/adapters/openai.ts', 'src/modules/e/provider/descriptors/openai.ts']) {
      const text = code(read(p));
      expect(text, p).not.toMatch(/\b(?:gpt-?\d|o\d-mini|gemini-\d|claude-\d)\b/i);
      expect(text, p).not.toMatch(/سعر|أسعار|تكلف|دولار|ميزاني|فوترة|إنفاق|\bprice|\bpricing|\bcost|\bbudget|\bbilling|\$\s?\d/i);
    }
  });

  it('المحوّل مسجَّل في سجل المحوّلات بالوصف نفسه، ومضيفه ومفتاحه لا يتقاطعان مع Anthropic', () => {
    const ids = PROVIDER_ADAPTERS.map((a) => a.descriptor.id);
    expect(ids).toContain('openai');
    const hosts = PROVIDER_ADAPTERS.map((a) => a.descriptor.host);
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(PROVIDER_ADAPTERS.find((a) => a.descriptor.id === 'openai')?.probe).toBeTypeOf('function');
  });
});
