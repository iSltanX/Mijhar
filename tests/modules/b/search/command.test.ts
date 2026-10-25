// أمر فتح القاموس (AC-B6): يعمل بالاختصار الافتراضي المؤقت Alt+K ويمكن إعادة ربطه من إعدادات المتصفح — أي أنه أمر مانيفست عادي (commands) وليس
// _execute_action ولا اختصارًا داخل الصفحة؛ يفتح اللوحة أو الدرج ولا يغلق ما هو مفتوح، ويطلب تبويب القاموس. الضغطة الفعلية على لوحة المفاتيح
// تعالجها واجهة المتصفح نفسها وليست قابلة للمحاكاة من اختبار، فيقيس هذا الملف عقد المانيفست ومعالج الخلفية.
import { describe, expect, it, vi } from 'vitest';
import { DRAWER_MESSAGE, MemoryStorageArea, PANEL_COMMAND, PANEL_REQUEST_FRESH_MS, PANEL_REQUEST_KEY, PANEL_SHORTCUT, isFreshPanelRequest, isPanelRequest } from '../../../../src/core';
import { startBackground } from '../../../../src/background/main';
import { generateManifest } from '../../../../src/manifest/generate.mjs';
import { GLOSSARY_COMMAND, GLOSSARY_SHORTCUT, GLOSSARY_TAB } from '../../../../src/modules/b/search';
import { fakeExtensionApi, flush, memorySettings } from '../../../core/ui-host/helpers';

type Manifest = Record<string, any>;
const manifests: Record<string, Manifest> = {
  chromium: generateManifest('chromium', { version: '0.0.1' }),
  firefox: generateManifest('firefox', { version: '0.0.1' }),
};

describe.each(Object.keys(manifests))('مانيفست %s', (target) => {
  const command = manifests[target]!.commands[GLOSSARY_COMMAND];

  it('أمر open-glossary باختصاره النهائي (DEC-08 ح-2): Alt+K، وفي macOS Control+Shift+K، ووصف عربي، ويختلف عن اختصار اللوحة', () => {
    expect(GLOSSARY_COMMAND).toBe('open-glossary');
    expect(GLOSSARY_SHORTCUT).toBe('Alt+K');
    expect(command.suggested_key).toEqual({ default: 'Alt+K', mac: 'MacCtrl+Shift+K' });
    expect(command.suggested_key.mac).not.toBe(manifests[target]!.commands['toggle-panel'].suggested_key.mac);
    expect(command.description).toMatch(/[؀-ۿ]/);
    expect(command.suggested_key.default).not.toBe(PANEL_SHORTCUT);
  });

  it('أمر مانيفست قابل لإعادة الربط من إعدادات المتصفح: لا _execute_* ولا مفتاح مفروض (global) ولا اختصار ثابت خارج suggested_key', () => {
    expect(Object.keys(manifests[target]!.commands).filter((name) => name.startsWith('_execute'))).toEqual([]);
    expect(Object.keys(command).sort()).toEqual(['description', 'suggested_key']);
    // default لكل الأنظمة وmac وحده (MacCtrl مسموح في mac وحده، وثيقة chrome.commands).
    expect(Object.keys(command.suggested_key)).toEqual(['default', 'mac']);
  });

  it('لا صلاحية جديدة: الأمر لا يطلب شيئًا فوق الأساس', () => {
    expect(manifests[target]!.permissions).toEqual(target === 'chromium' ? ['sidePanel', 'storage'] : ['storage']);
    expect(manifests[target]!.host_permissions).toEqual(['https://github.com/*']);
  });
});

describe('معالج الخلفية لأمر فتح القاموس', () => {
  const tab = { id: 3, windowId: 11 };

  it('عائلة Chromium: يفتح اللوحة متزامنًا (قيد فعل المستخدم) ثم يكتب طلب تبويب القاموس', async () => {
    const open = vi.fn(async () => {});
    const fake = fakeExtensionApi({ sidePanel: { open, setOptions: vi.fn(async () => {}) } });
    const area = new MemoryStorageArea();
    const handle = startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area } });
    const before = Date.now();
    fake.command(GLOSSARY_COMMAND, tab);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ windowId: 11 });
    await handle.ready;
    await flush(20);
    const { settings } = await memorySettings(area);
    const request = settings.get(PANEL_REQUEST_KEY) as { tab: string; at: number };
    expect(request.tab).toBe(GLOSSARY_TAB);
    expect(request.at).toBeGreaterThanOrEqual(before);
    expect(isFreshPanelRequest(request)).toBe(true);
  });

  it('Firefox: يفتح الشريط الجانبي ولا يبدّله، فلا يغلقه إن كان مفتوحًا (أمر اللوحة وحده يبدّل)', async () => {
    const open = vi.fn(async () => {});
    const toggle = vi.fn(async () => {});
    const fake = fakeExtensionApi({ sidebarAction: { open, close: vi.fn(async () => {}), toggle } });
    const area = new MemoryStorageArea();
    const handle = startBackground({ api: fake.api, target: 'firefox', binding: { area, changes: area } });
    fake.command(GLOSSARY_COMMAND, { id: 3 });
    expect(open).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    fake.command(PANEL_COMMAND, { id: 3 });
    expect(toggle).toHaveBeenCalledTimes(1);
    await handle.ready;
  });

  it('تفضيل الدرج أو رفض الفتح: يفتح الدرج بالفعل open (لا toggle) في التبويب النشط', async () => {
    const fake = fakeExtensionApi({ sidePanel: { open: vi.fn(async () => Promise.reject(new Error('No active side panel'))), setOptions: vi.fn(async () => {}) } });
    const area = new MemoryStorageArea();
    const handle = startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area } });
    fake.command(GLOSSARY_COMMAND, tab);
    await handle.ready;
    await flush(20);
    expect(fake.sent).toEqual([{ tabId: 3, message: { type: DRAWER_MESSAGE, action: 'open' } }]);
  });

  it('أمر اللوحة القديم لا يكتب طلب تبويب، وأمر مجهول لا يفعل شيئًا', async () => {
    const open = vi.fn(async () => {});
    const fake = fakeExtensionApi({ sidePanel: { open, setOptions: vi.fn(async () => {}) } });
    const area = new MemoryStorageArea();
    const handle = startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area } });
    fake.command(PANEL_COMMAND, tab);
    fake.command('unknown', tab);
    expect(open).toHaveBeenCalledTimes(1);
    await handle.ready;
    await flush(20);
    const { settings } = await memorySettings(area);
    expect(settings.get(PANEL_REQUEST_KEY)).toBeNull();
  });
});

describe('طلب تبويب اللوحة', () => {
  it('حديث ضمن المهلة فقط، والمستقبلي أو القديم أو الفارغ لا', () => {
    const now = 1_000_000;
    expect(isFreshPanelRequest({ tab: 'glossary', at: now }, now)).toBe(true);
    expect(isFreshPanelRequest({ tab: 'glossary', at: now - PANEL_REQUEST_FRESH_MS }, now)).toBe(true);
    expect(isFreshPanelRequest({ tab: 'glossary', at: now - PANEL_REQUEST_FRESH_MS - 1 }, now)).toBe(false);
    expect(isFreshPanelRequest({ tab: 'glossary', at: now + 1 }, now)).toBe(false);
    expect(isFreshPanelRequest(null, now)).toBe(false);
  });

  it('المدقق يقبل null والشكل الصحيح ويرفض غيره', () => {
    expect(isPanelRequest(null)).toBe(true);
    expect(isPanelRequest({ tab: 'glossary', at: 5 })).toBe(true);
    for (const bad of [undefined, 5, 'glossary', {}, { tab: 1, at: 5 }, { tab: 'g', at: 'x' }, { tab: 'g', at: Number.NaN }]) expect(isPanelRequest(bad), String(bad)).toBe(false);
  });
});
