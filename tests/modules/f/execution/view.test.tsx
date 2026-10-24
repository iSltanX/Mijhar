// @vitest-environment jsdom
// «تجهيز تعديل» في اللوحة (T-11.8): يُرسم في اللوحة الأصلية وحدها (صفحة إضافة)، وفي الدرج المحقون في صفحة GitHub رسالة تدل عليه بلا حقل ولا زر
// موافقة (DEC-04، AD-27)؛ ويتبع المستودع المفتوح، ويبقى التعديل الجاري على مستودعه إن تغيّر التبويب النشط (فتح الإعدادات لإضافة الصلاحية).
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { createExecutionView } from '../../../../src/modules/f/execution';
import type { ExecutionDeps } from '../../../../src/modules/f/execution';
import { pageInfoFromUrl } from '../../../../src/shared/page';
import type { PageInfo, PageSource } from '../../../../src/shared/page';
import { flush } from '../../d/helpers';
import { execSystem } from './helpers';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = null;
});

function source(initial: string) {
  let page: PageInfo = pageInfoFromUrl(initial);
  const listeners = new Set<() => void>();
  const src: PageSource = { read: async () => page, subscribe: (n) => (listeners.add(n), () => listeners.delete(n)) };
  return { src, go: (url: string) => ((page = pageInfoFromUrl(url)), listeners.forEach((l) => l())) };
}

describe('مكان المسار', () => {
  it('اللوحة الأصلية وحدها؛ وفي الدرج رسالة بلا حقل ولا زر موافقة', async () => {
    const native = PANEL_VIEWS.filter((v) => v.id.startsWith('f-execution') && (v.surfaces ?? ['native', 'drawer']).includes('native'));
    const drawer = PANEL_VIEWS.filter((v) => v.id.startsWith('f-execution') && (v.surfaces ?? ['native', 'drawer']).includes('drawer'));
    expect(native.map((v) => v.id)).toEqual(['f-execution']);
    expect(drawer.map((v) => v.id)).toEqual(['f-execution-drawer']);
    expect(native[0]?.tab).toBe('context');
    container = document.createElement('div');
    document.body.append(container);
    const Drawer = drawer[0]?.component as NonNullable<(typeof drawer)[0]>['component'];
    render(<Drawer settings={{} as never} surface="drawer" />, container);
    expect(container.querySelector('[data-native-only="تجهيز تعديل"]')).not.toBeNull();
    expect(container.querySelector('input, textarea, button, [data-consent]')).toBeNull();
  });
});

describe('اللوحة الأصلية: المستودع المفتوح والتعديل الجاري', () => {
  it('صفحة خارج GitHub: دعوة لفتح مستودع؛ ومستودع: الاقتراح؛ وتعديل جارٍ يبقى على مستودعه بعد تغيّر التبويب', async () => {
    const s = await execSystem();
    const deps: ExecutionDeps = { api: s.panel.api, exec: s.panel.exec, copy: vi.fn(async () => true), openSettings: vi.fn(), now: () => Date.UTC(2026, 9, 24) };
    const tabs = source('https://example.org/');
    const View = createExecutionView({ source: () => tabs.src, deps: () => deps });
    container = document.createElement('div');
    container.className = 'mj-root';
    document.body.append(container);
    render(<View settings={{} as never} surface="native" />, container);
    await flush(80);
    expect(container.querySelector('[data-exec-empty="no-repo"]')).not.toBeNull();

    tabs.go('https://github.com/octo/demo/issues/3');
    await flush(120);
    expect(container.querySelector('[data-exec-step]')?.getAttribute('data-exec-step')).toBe('propose');
    (container.querySelector('[data-action="exec-prepare"]') as HTMLButtonElement).click();
    await flush(40);
    expect(container.querySelector('[data-exec-step]')?.getAttribute('data-exec-step')).toBe('preview');

    // فتح الإعدادات (تبويب خارج GitHub) لا يُسقط التعديل الجاري.
    tabs.go('chrome-extension://mijhar/options.html');
    await flush(120);
    expect(container.querySelector('[data-exec-step]')?.getAttribute('data-exec-step')).toBe('preview');
    expect(container.querySelector('[data-exec-held]')?.textContent).toContain('octo/demo');

    // الإلغاء يحرّره فيتبع التبويب النشط من جديد.
    (container.querySelector('[data-action="exec-cancel"]') as HTMLButtonElement).click();
    await flush(40);
    expect(container.querySelector('[data-exec-empty="no-repo"]')).not.toBeNull();
  });
});
