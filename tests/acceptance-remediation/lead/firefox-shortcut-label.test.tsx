// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
/**
 * MJ-F-03 (Fable): Firefox في macOS يعيد الاختصار من commands.getAll بصيغة المانيفست «MacCtrl+Shift+G»، فكانت الإعدادات تعرض الاسم الداخلي كما هو
 * بينما المساعدة وREADME تقولان «Control+Shift+G». الإصلاح يعرض Control، ويُبقي ما تعيده عائلة Chromium (⌃⇧G، Alt+G) كما هو.
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayShortcut } from '../../../src/core/ui-host/commands';
import { SettingsTab } from '../../../src/options/SettingsTab';
import { flush, memorySettings } from '../../core/ui-host/helpers';

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

describe('MJ-F-03: الاختصار في Firefox بلا اسم داخلي', () => {
  it('displayShortcut: MacCtrl يصير Control، وغيره كما هو', () => {
    expect(displayShortcut('MacCtrl+Shift+G')).toBe('Control+Shift+G');
    expect(displayShortcut('MacCtrl+Shift+K')).toBe('Control+Shift+K');
    expect(displayShortcut('⌃⇧G')).toBe('⌃⇧G');
    expect(displayShortcut('Alt+G')).toBe('Alt+G');
    expect(displayShortcut('')).toBe('');
  });

  it('قسم الاختصار في الإعدادات يعرض Control+Shift+G لا MacCtrl', async () => {
    const { settings } = await memorySettings();
    const getAll = vi.fn(async () => [{ name: 'toggle-panel', shortcut: 'MacCtrl+Shift+G' }]);
    act(() => render(<SettingsTab settings={settings} surface="options" shortcuts={{ getAll, openSettings: vi.fn() }} />, container));
    await act(async () => {
      await flush(5);
    });
    const text = container.querySelector('[data-section="shortcut"] [data-shortcut]')?.textContent ?? '';
    expect(text).toContain('Control+Shift+G');
    expect(text).not.toContain('MacCtrl');
  });
});
