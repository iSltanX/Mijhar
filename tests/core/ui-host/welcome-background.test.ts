// الخلفية والترحيب (AD-29): التثبيت الأول وحده يجهّز الترحيب، والتحديث لا يعيده؛ ورسالة فتح الإعدادات على موضع لا تفتح إلا مواضع
// القائمة المغلقة، وما عداها صفحة الإعدادات نفسها (لا عنوان تركّبه رسالة من سكربت المحتوى).
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, OPEN_OPTIONS_MESSAGE, OPTIONS_TARGETS, WELCOME_KEY, optionsPageUrl } from '../../../src/core';
import type { ExtensionApi } from '../../../src/core';
import { startBackground } from '../../../src/background/main';
import { fakeExtensionApi, flush, memorySettings } from './helpers';

function withInstalled() {
  const listeners = new Set<(details: { reason: string }) => void>();
  const fake = fakeExtensionApi();
  const api = { ...fake.api, runtime: { ...fake.api.runtime, onInstalled: { addListener: (l: (d: { reason: string }) => void) => void listeners.add(l), removeListener: () => {} } } } as ExtensionApi;
  return { fake, api, installed: (reason: string) => listeners.forEach((l) => l({ reason })) };
}

describe('الترحيب عند التثبيت', () => {
  it("التثبيت الأول يكتب 'pending'، والمستمع مسجَّل قبل جاهزية التخزين", async () => {
    const { api, installed } = withInstalled();
    const area = new MemoryStorageArea();
    const handle = startBackground({ api, target: 'chromium', binding: { area, changes: area }, tokens: null });
    installed('install');
    await handle.ready;
    await flush(5);
    const { settings } = await memorySettings(area);
    expect(settings.get(WELCOME_KEY)).toBe('pending');
  });

  it("التحديث وإعادة تحميل الإضافة لا يعيدانه: يبقى 'done'", async () => {
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) {
      const { api, installed } = withInstalled();
      const area = new MemoryStorageArea();
      const handle = startBackground({ api, target: 'chromium', binding: { area, changes: area }, tokens: null });
      installed(reason);
      await handle.ready;
      await flush(5);
      expect((await memorySettings(area)).settings.get(WELCOME_KEY)).toBe('done');
    }
  });
});

describe('فتح الإعدادات على موضع', () => {
  it('المواضع المعروفة وحدها تصير عنوانًا داخل الإضافة', () => {
    const getURL = (p: string) => `chrome-extension://id/${p}`;
    expect(OPTIONS_TARGETS).toEqual(['token', 'guide/github-token']);
    expect(optionsPageUrl(getURL, 'guide/github-token')).toBe('chrome-extension://id/options.html#guide/github-token');
    expect(optionsPageUrl(getURL, 'token')).toBe('chrome-extension://id/options.html#token');
    for (const bad of ['https://evil.example', '../options.html', 'token#x', 'guide/other', '', null, 3, { target: 'token' }]) expect(optionsPageUrl(getURL, bad)).toBeNull();
  });

  it('الرسالة بموضع معروف تفتح تبويبًا عليه؛ وبموضع مجهول أو بلا موضع تفتح صفحة الإعدادات نفسها', async () => {
    const fake = fakeExtensionApi();
    const area = new MemoryStorageArea();
    await startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area }, tokens: null }).ready;
    fake.message({ type: OPEN_OPTIONS_MESSAGE, target: 'guide/github-token' });
    expect(fake.api.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/options.html#guide/github-token' });
    fake.message({ type: OPEN_OPTIONS_MESSAGE, target: 'javascript:alert(1)' });
    fake.message({ type: OPEN_OPTIONS_MESSAGE });
    expect(fake.api.tabs.create).toHaveBeenCalledTimes(1);
    expect(fake.api.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fake.api.tabs.create).mock.calls.every(([p]) => p.url.startsWith('chrome-extension://test/options.html#'))).toBe(true);
  });
});
