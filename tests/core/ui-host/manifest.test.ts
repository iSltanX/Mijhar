// مفاتيح المانيفست التي يملكها T-1.4: اللوحة الأصلية وصفحة الإعدادات والأمر باختصاره المؤقت وصلاحية api.github.com
// الاختيارية (لا تُمنح عند التثبيت). البناء الكامل وتحميل الحزم: tests/build وscripts/load-check.mjs.
import { describe, expect, it } from 'vitest';
import { API_GITHUB_ORIGIN, PANEL_COMMAND, PANEL_SHORTCUT } from '../../../src/core';
import { BASE_HOST, OPTIONAL_HOSTS, assertManifest, generateManifest } from '../../../src/manifest/generate.mjs';

type Manifest = Record<string, any>;
const manifests: Record<string, Manifest> = {
  chromium: generateManifest('chromium', { version: '0.0.1' }),
  firefox: generateManifest('firefox', { version: '0.0.1' }),
};

describe.each(Object.keys(manifests))('مانيفست %s', (target) => {
  const manifest = manifests[target]!;

  it('أمر toggle-panel باختصار افتراضي مؤقت Alt+G ووصف عربي', () => {
    expect(manifest.commands[PANEL_COMMAND].suggested_key).toEqual({ default: PANEL_SHORTCUT });
    expect(manifest.commands[PANEL_COMMAND].description).toMatch(/[؀-ۿ]/);
    // الأمر الثاني open-glossary أضافته MJ10 (T-3.4) باختصاره المؤقت Alt+K؛ يقيسه tests/modules/b/search/command.test.ts.
    expect(Object.keys(manifest.commands)).toEqual([PANEL_COMMAND, 'open-glossary']);
  });

  it('api.github.com ومضيف مزوّد التحليل (MJ21) اختياريان وحدهما، وليسا في الصلاحيات الأساسية', () => {
    expect(manifest.optional_host_permissions).toEqual([API_GITHUB_ORIGIN, 'https://api.anthropic.com/*', 'https://generativelanguage.googleapis.com/*']);
    expect(JSON.stringify(manifest.permissions ?? [])).not.toMatch(/api\.anthropic\.com|generativelanguage/);
    expect(manifest.host_permissions).toEqual([BASE_HOST]);
    expect(JSON.stringify(manifest.permissions ?? [])).not.toContain('api.github.com');
    expect(manifest.optional_permissions).toBeUndefined();
  });

  it('صفحة الإعدادات في تبويب، واللوحة صفحة الإضافة sidepanel.html', () => {
    expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
    expect(manifest.side_panel?.default_path ?? manifest.sidebar_action?.default_panel).toBe('sidepanel.html');
  });
});

describe('ما يخص كل هدف', () => {
  it('Firefox: الشريط الجانبي لا يُفتح وحده عند التثبيت', () => {
    expect(manifests.firefox!.sidebar_action).toMatchObject({ default_panel: 'sidepanel.html', open_at_install: false });
  });

  it('حارس المولّد يرفض مضيفًا اختياريًا خارج القائمة المسموحة', () => {
    expect(OPTIONAL_HOSTS).toEqual([API_GITHUB_ORIGIN, 'https://api.anthropic.com/*', 'https://generativelanguage.googleapis.com/*']);
    expect(() => assertManifest('chromium', { ...manifests.chromium, optional_host_permissions: [API_GITHUB_ORIGIN, 'https://*.example.com/*'] })).toThrow(/مضيف اختياري غير مسموح/);
  });
});
