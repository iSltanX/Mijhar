// TEST-BUILD-01 (AC-1.1): بناء نظيف للحزمتين وفحص نص المانيفست. تحميل الحزمة في المتصفحات: scripts/load-check.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAll } from '../../scripts/build.mjs';
import { BASE_HOST, assertManifest, generateManifest, primaryHostPatterns } from '../../src/manifest/generate.mjs';
import { ROOT } from '../setup/paths';

type Manifest = Record<string, any>;

const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-build-test-'));
const readManifest = (target: string): Manifest => JSON.parse(fs.readFileSync(path.join(outRoot, target, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

beforeAll(async () => {
  await buildAll({ outRoot });
}, 120_000);

afterAll(() => {
  fs.rmSync(outRoot, { recursive: true, force: true });
});

describe.each(['chromium', 'firefox'])('حزمة %s', (target) => {
  it('تحمل الملفات التي يشير إليها المانيفست', () => {
    const manifest = readManifest(target);
    const referenced = [
      ...(manifest.background.scripts ?? [manifest.background.service_worker]),
      ...manifest.content_scripts.flatMap((c: Manifest) => c.js),
      manifest.side_panel?.default_path ?? manifest.sidebar_action?.default_panel,
    ];
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) expect(fs.existsSync(path.join(outRoot, target, file)), file).toBe(true);
  });

  it('مانيفست V3 باسم محايد ونسخة package.json', () => {
    const manifest = readManifest(target);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('placeholder');
    expect(manifest.version).toBe(pkg.version);
  });

  it('صلاحيات المضيف الأساسية https://github.com/* وحدها ولا نمط يشمل كل المواقع', () => {
    const raw = fs.readFileSync(path.join(outRoot, target, 'manifest.json'), 'utf8');
    expect(raw).not.toContain('<all_urls>');
    expect(raw).not.toContain('*://*/*');
    const manifest = readManifest(target);
    expect(manifest.host_permissions).toEqual([BASE_HOST]);
    expect(new Set(primaryHostPatterns(manifest))).toEqual(new Set([BASE_HOST]));
  });
});

describe('مفاتيح كل هدف', () => {
  it('Chromium: service_worker وside_panel دون مفاتيح Firefox', () => {
    const manifest = readManifest('chromium');
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(manifest.side_panel).toBeDefined();
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.sidebar_action).toBeUndefined();
    expect(manifest.browser_specific_settings).toBeUndefined();
  });

  it('Firefox: background.scripts وsidebar_action ومعرّف gecko دون مفاتيح Chromium', () => {
    const manifest = readManifest('firefox');
    expect(manifest.background).toEqual({ scripts: ['background.js'] });
    expect(manifest.sidebar_action.default_panel).toBeDefined();
    expect(manifest.browser_specific_settings.gecko.id).toBeTruthy();
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.permissions ?? []).not.toContain('sidePanel');
  });
});

describe('حارس المولّد', () => {
  const good = () => generateManifest('chromium', { version: '1.2.3' });

  it('يقبل المصدر كما هو', () => {
    expect(() => assertManifest('chromium', good())).not.toThrow();
    expect(() => assertManifest('firefox', generateManifest('firefox', { version: '1.2.3' }))).not.toThrow();
  });

  it('يرفض <all_urls> ونمط مضيف خارج github.com ونمط محتوى أوسع', () => {
    expect(() => assertManifest('chromium', { ...good(), host_permissions: ['<all_urls>'] })).toThrow(/كل المواقع/);
    expect(() => assertManifest('chromium', { ...good(), host_permissions: [BASE_HOST, 'https://api.github.com/*'] })).toThrow(/api\.github\.com/);
    expect(() => assertManifest('chromium', { ...good(), content_scripts: [{ matches: ['https://*/*'], js: ['content.js'] }] })).toThrow(/https:\/\/\*\/\*/);
    expect(() => assertManifest('chromium', { ...good(), permissions: ['sidePanel', 'https://example.com/*'] })).toThrow(/example\.com/);
  });

  it('يقبل المضيفات الاختيارية خارج الأساسية', () => {
    expect(() => assertManifest('chromium', { ...good(), optional_host_permissions: ['https://api.github.com/*'] })).not.toThrow();
  });

  it('يرفض مفاتيح الهدف الآخر وغياب مفاتيح الهدف', () => {
    expect(() => assertManifest('chromium', { ...good(), background: { scripts: ['background.js'] } })).toThrow(/service_worker/);
    expect(() => assertManifest('firefox', { ...generateManifest('firefox', { version: '1.0.0' }), background: { service_worker: 'background.js' } })).toThrow(/background\.scripts/);
    expect(() => assertManifest('chromium', { ...good(), manifest_version: 2 })).toThrow(/manifest_version/);
  });

  it('يرفض هدفًا غير معروف', () => {
    expect(() => generateManifest('safari', { version: '1.0.0' })).toThrow(/غير معروف/);
  });
});
