// @vitest-environment jsdom
// قسم رمز الوصول في الإعدادات (AC-5.5 ‏(١) و(٥) و(٦)، AC-D7، TEST-SEC-03): الإدخال في صفحة الإعدادات وحدها لا في الدرج ولا في اللوحة،
// والقائمة الدنيا ظاهرة عند الإدخال بلا أي صلاحية كتابة، والجلسة افتراضًا والقرص بنص صريح (ومحجوب في Firefox بقيده)، ولا يبقى الرمز في
// DOM بعد الحفظ، والتحقق عبر الخلفية، والمسح متاح في كل وقت.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, openSettings } from '../../../../src/core';
import type { PublicApiPort } from '../../../../src/core';
import { createSettingsRegistry } from '../../../../src/core/ui-host/units';
import { TokenStore } from '../../../../src/modules/d/token/store';
import { TokenSection } from '../../../../src/modules/d/token/TokenSection';
import { defineSectionSettings, SETTINGS_SECTIONS } from '../../../../src/options/sections';
import { SettingsTab } from '../../../../src/options/SettingsTab';
import { FIXTURE, TOKEN_PATTERN, fakeToken, memoryArea } from './helpers';

const TOKEN = fakeToken('D');

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
};

function fakePort(result: unknown = { ok: true, status: 200, data: {}, fromCache: false, readAt: 1, rate: { limit: 5000, remaining: 4999, used: 1, reset: 1, resource: 'core', readAt: 1 }, authenticated: true }): PublicApiPort & { get: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => result),
    getAll: vi.fn(),
    status: vi.fn(async () => ({ granted: true, rate: null, authenticated: true, tokenExpiresAt: Date.UTC(2026, 9, 30, 14, 25, 10) })),
  } as never;
}

async function mount(options: { disk?: boolean; target?: 'chromium' | 'firefox'; port?: ReturnType<typeof fakePort> } = {}) {
  const session = memoryArea();
  const disk = memoryArea();
  const store = new TokenStore({ session, disk: options.disk === false ? null : disk, now: () => Date.UTC(2026, 9, 24, 9) });
  const port = options.port ?? fakePort();
  await act(async () => render(<TokenSection store={store} port={port} target={options.target ?? 'chromium'} now={() => Date.UTC(2026, 9, 24, 9)} />, container));
  await flush();
  const q = <E extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as E | null;
  const type = async (value: string) => {
    const input = q<HTMLInputElement>('#mj-token-input');
    if (!input) throw new Error('no input');
    input.value = value;
    await act(async () => {
      q<HTMLFormElement>('[data-token-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
  };
  const click = async (sel: string) => {
    await act(async () => q<HTMLButtonElement>(sel)?.click());
    await flush();
  };
  return { session, disk, store, port, q, type, click };
}

describe('القائمة الدنيا ظاهرة عند الإدخال، ولا صلاحية كتابة في الواجهة', () => {
  it('ست صلاحيات Read-only بجوار الحقل، وما لا يتاح بالرمز معلن؛ ولا ذكر لكتابة', async () => {
    const ui = await mount();
    const perms = [...container.querySelectorAll('[data-permission]')].map((li) => li.getAttribute('data-permission'));
    expect(perms).toEqual(['Metadata', 'Contents', 'Pull requests', 'Commit statuses', 'Actions', 'Issues']);
    for (const li of container.querySelectorAll('[data-permission]')) expect(li.textContent).toContain('Read-only');
    expect(ui.q('#mj-token-input')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Read and write|write|Admin/i);
    expect(container.textContent).toContain('Checks');
  });
});

describe('الحفظ: الجلسة افتراضًا، والقرص بنص صريح', () => {
  it('الافتراضي ذاكرة الجلسة؛ الحفظ يكتب فيها وحدها ويفرّغ الحقل ولا يبقى الرمز في DOM، ثم يتحقق عبر الخلفية', async () => {
    const ui = await mount();
    expect(ui.q<HTMLInputElement>('input[value="session"]')?.checked).toBe(true);
    expect(ui.q('[data-token-state]')?.getAttribute('data-token-state')).toBe('none');
    await ui.type(TOKEN);
    expect(ui.session.value?.token).toBe(TOKEN);
    expect(ui.disk.set).not.toHaveBeenCalled();
    expect(ui.q<HTMLInputElement>('#mj-token-input')?.value).toBe('');
    expect(container.innerHTML).not.toMatch(TOKEN_PATTERN);
    expect(ui.q('[data-token-state]')?.getAttribute('data-token-state')).toBe('session');
    expect(ui.port.get).toHaveBeenCalledWith('/rate_limit');
    expect(ui.q('[data-token-check]')?.getAttribute('data-token-check')).toBe('ok');
    expect(ui.q('[data-token-check]')?.textContent).toContain('5000');
    expect(ui.q('[data-token-check]')?.textContent).toContain('2026-10-30 14:25 UTC');
    expect(ui.q('[data-token-check]')?.textContent).toContain('قريبًا');
  });

  it('القرص بعد نص صريح «غير مشفَّر»، ويُحفظ هناك وحده', async () => {
    const ui = await mount();
    expect(ui.q('[data-disk-note]')?.textContent).toContain('غير مشفَّر');
    await act(async () => ui.q<HTMLInputElement>('input[value="disk"]')?.click());
    await ui.type(TOKEN);
    expect(ui.disk.value?.token).toBe(TOKEN);
    expect(ui.session.value).toBeNull();
    expect(ui.q('[data-token-state]')?.getAttribute('data-token-state')).toBe('disk');
  });

  it('Firefox: خيار القرص محجوب ويُعلن قيده (setAccessLevel)، والجلسة تعمل', async () => {
    const ui = await mount({ disk: false, target: 'firefox' });
    const disk = ui.q<HTMLInputElement>('input[value="disk"]');
    expect(disk?.disabled).toBe(true);
    expect(ui.q('[data-disk-note]')?.getAttribute('data-disk-note')).toBe('blocked');
    expect(ui.q('[data-disk-note]')?.textContent).toContain('setAccessLevel');
    await ui.type(TOKEN);
    expect(ui.session.value?.token).toBe(TOKEN);
  });

  it('رمز كلاسيكي يُرفض قبل أي حفظ أو طلب، ورسالته لا تحمل ما أُدخل', async () => {
    const ui = await mount();
    const classic = ['ghp', 'Z'.repeat(36)].join('_');
    await ui.type(classic);
    expect(ui.session.set).not.toHaveBeenCalled();
    expect(ui.port.get).not.toHaveBeenCalled();
    expect(ui.q('[data-token-message]')?.textContent).toContain('بصلاحيات محددة');
    expect(ui.q('[data-token-message]')?.textContent).not.toContain(classic);
  });
});

describe('التحقق والمسح', () => {
  it('رفض GitHub (401) يُعلن خطرًا، ويبقى المسح متاحًا', async () => {
    const port = fakePort({ ok: false, failure: 'unauthorized', status: 401, message: 'x', retryAt: null, readAt: 1, rate: null, authenticated: true });
    const ui = await mount({ port });
    await ui.type(TOKEN);
    expect(ui.q('[data-token-check]')?.getAttribute('data-tone')).toBe('danger');
    expect(ui.q('[data-token-check]')?.textContent).toContain('401');
    expect(ui.q<HTMLButtonElement>('[data-action="token-clear"]')?.disabled).toBe(false);
  });

  it('بلا صلاحية api.github.com: الرمز محفوظ ويُعلن أنه لن يُستعمل قبلها', async () => {
    const port = fakePort({ ok: false, failure: 'permission', status: null, message: 'x', retryAt: null, readAt: 1, rate: null, authenticated: true });
    const ui = await mount({ port });
    await ui.type(TOKEN);
    expect(ui.q('[data-token-check]')?.textContent).toContain('api.github.com');
  });

  it('«امسح الرمز» يسرد ما يتعطل وحده ثم يمحوه من الجلسة والقرص ويُبلغ الخلفية بقراءة الحالة', async () => {
    const ui = await mount();
    await ui.type(TOKEN);
    ui.disk.value = { token: TOKEN, savedAt: 1 };
    ui.port.status.mockClear();
    await ui.click('[data-action="token-clear"]');
    // MJ18 (AC-11.1 ‏(٥)): لا مسح قبل التأكيد، والتأكيد يسمّي ما يتعطل وحده وما يبقى.
    expect(ui.session.value).not.toBeNull();
    expect(ui.q('[data-token-confirm] [data-disables]')?.textContent).toContain('مستودع خاص');
    expect(ui.q('[data-token-confirm] [data-keeps]')?.textContent).toContain('حزمة السياق');
    await ui.click('[data-action="token-clear-confirm"]');
    expect(ui.session.value).toBeNull();
    expect(ui.disk.value).toBeNull();
    expect(ui.port.status).toHaveBeenCalled();
    expect(ui.q('[data-token-state]')?.getAttribute('data-token-state')).toBe('none');
  });
});

describe('الإدخال في صفحة الإعدادات وحدها', () => {
  it('SettingsTab يرسم قسم الأسرار في options وحده: لا في الدرج ولا في اللوحة الأصلية', async () => {
    const area = new MemoryStorageArea();
    const { settings } = await openSettings({ registry: createSettingsRegistry((r) => defineSectionSettings(r)), binding: { area, changes: area } });
    const section = <p data-secret-section="">secret</p>;
    for (const surface of ['drawer', 'native', 'options'] as const) {
      await act(async () => render(<SettingsTab settings={settings} surface={surface} sections={SETTINGS_SECTIONS} secretSections={section} />, container));
      expect(Boolean(container.querySelector('[data-secret-section]'))).toBe(surface === 'options');
      expect(Boolean(container.querySelector('input[type="password"]'))).toBe(false);
      render(null, container);
    }
  });

  it('لا قسم من أقسام الوحدات المشتركة (SETTINGS_SECTIONS) يحمل حقل رمز', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id).join(' ')).not.toMatch(/token/i);
    expect(FIXTURE.states.valid?.status).toBe(200);
  });
});
