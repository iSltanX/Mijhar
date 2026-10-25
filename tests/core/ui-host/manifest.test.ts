// مفاتيح المانيفست التي يملكها T-1.4: اللوحة الأصلية وصفحة الإعدادات والأمر باختصاره المؤقت وصلاحية api.github.com
// الاختيارية (لا تُمنح عند التثبيت). البناء الكامل وتحميل الحزم: tests/build وscripts/load-check.mjs.
import { describe, expect, it } from 'vitest';
import { API_GITHUB_ORIGIN, PANEL_COMMAND, PANEL_SHORTCUT, PANEL_SHORTCUT_MAC } from '../../../src/core';
import { BASE_HOST, OPTIONAL_HOSTS, assertManifest, generateManifest } from '../../../src/manifest/generate.mjs';

type Manifest = Record<string, any>;
const manifests: Record<string, Manifest> = {
  chromium: generateManifest('chromium', { version: '0.0.1' }),
  firefox: generateManifest('firefox', { version: '0.0.1' }),
};

describe.each(Object.keys(manifests))('مانيفست %s', (target) => {
  const manifest = manifests[target]!;

  it('أمر toggle-panel باختصاره النهائي (DEC-08 ح-2): Alt+G، وفي macOS Control+Shift+G، ووصف عربي', () => {
    expect(manifest.commands[PANEL_COMMAND].suggested_key).toEqual({ default: PANEL_SHORTCUT, mac: PANEL_SHORTCUT_MAC });
    expect(PANEL_SHORTCUT_MAC).toBe('MacCtrl+Shift+G');
    expect(manifest.commands[PANEL_COMMAND].description).toMatch(/[؀-ۿ]/);
    // الأمر الثاني open-glossary أضافته MJ10 (T-3.4)؛ يقيسه tests/modules/b/search/command.test.ts.
    expect(Object.keys(manifest.commands)).toEqual([PANEL_COMMAND, 'open-glossary']);
  });

  it('api.github.com ومضيفات مزوّدي التحليل وخادم البلاغات (MJ26) اختيارية وحدها، وليست في الصلاحيات الأساسية', () => {
    expect(manifest.optional_host_permissions).toEqual([API_GITHUB_ORIGIN, 'https://api.anthropic.com/*', 'https://api.openai.com/*', 'https://generativelanguage.googleapis.com/*', 'https://app-reports.isultantf.workers.dev/*']);
    expect(JSON.stringify(manifest.permissions ?? [])).not.toMatch(/api\.anthropic\.com|api\.openai\.com|generativelanguage/);
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
    expect(OPTIONAL_HOSTS).toEqual([API_GITHUB_ORIGIN, 'https://api.anthropic.com/*', 'https://api.openai.com/*', 'https://generativelanguage.googleapis.com/*', 'https://app-reports.isultantf.workers.dev/*']);
    expect(() => assertManifest('chromium', { ...manifests.chromium, optional_host_permissions: [API_GITHUB_ORIGIN, 'https://*.example.com/*'] })).toThrow(/مضيف اختياري غير مسموح/);
  });
});
