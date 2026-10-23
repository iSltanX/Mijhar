// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// حاوية Shadow DOM وسطح الوحدة: البنية والعزل المعلَن والإزالة النظيفة عبر دورة الحياة (جزء من TEST-CORE-05).
// حساب الأنماط الفعلي (التتالي عبر حدود الظل) لا يحاكيه jsdom: يُقاس في المتصفحات الأربعة (tests/core/ui-host/browser).
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOST_ATTR, HOST_TAG, LifecycleManager, ModuleRegistry, PageDetector, STYLES_ATTR, createShadowHost, githubTheme, mountSurface } from '../../../src/core';
import type { ExtensionModule } from '../../../src/core';
import { fakeLifecycle, fakeUnitModules, mountedFakeUnits } from './fake-modules';
import { loadIntoDocument } from './helpers';

const styleText = (shadow: ShadowRoot): string =>
  [...(shadow.adoptedStyleSheets ?? [])].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n') + [...shadow.querySelectorAll('style')].map((s) => s.textContent).join('\n');

beforeEach(() => loadIntoDocument('pages/pr.html'));
afterEach(() => {
  fakeLifecycle.mounted.clear();
  fakeLifecycle.cleaned.clear();
});

describe('createShadowHost', () => {
  it('مضيف بعنصر مخصص وجذر ظل مفتوح وحاوية .mj-root عربية RTL، وأنماط العزل على :host', () => {
    const parts = createShadowHost(document, { name: 'a', label: 'تجربة' });
    expect(parts.host.localName).toBe(HOST_TAG);
    expect(parts.host.getAttribute(HOST_ATTR)).toBe('a');
    expect(parts.shadow.mode).toBe('open');
    expect(parts.root.className).toBe('mj-root');
    expect(parts.root.getAttribute('dir')).toBe('rtl');
    expect(parts.root.getAttribute('lang')).toBe('ar');
    expect(parts.root.getAttribute('aria-label')).toBe('تجربة');
    expect(['adopted', 'style-element']).toContain(parts.host.getAttribute(STYLES_ATTR));
    const css = styleText(parts.shadow);
    expect(css).toMatch(/:host\s*\{\s*all:\s*initial\s*!important/);
    // الرموز تُعرَّف على .mj-root (لا تبلغها محددات الصفحة) لا على :host.
    expect(css).toMatch(/\.mj-root\s*\{[^}]*--mijhar-bg-surface/);
    expect(parts.host.isConnected).toBe(false);
  });

  it('الوضع يتبع data-color-mode في صفحة GitHub حين يكون صريحًا', () => {
    document.documentElement.setAttribute('data-color-mode', 'dark');
    expect(githubTheme(document)).toBe('dark');
    expect(createShadowHost(document, { name: 'x' }).root.getAttribute('data-theme')).toBe('dark');
    document.documentElement.setAttribute('data-color-mode', 'auto');
    expect(githubTheme(document)).toBeUndefined();
    expect(createShadowHost(document, { name: 'x' }).root.hasAttribute('data-theme')).toBe(false);
  });
});

describe('mountSurface عبر دورة الحياة', () => {
  const start = (modules: readonly ExtensionModule[], enabled: Set<string>) => {
    const manager = new LifecycleManager({ registry: new ModuleRegistry(modules), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: (id) => enabled.has(id) });
    // act: تُنفَّذ تأثيرات Preact (useEffect) فورًا بدل انتظار إطار الرسم.
    act(() => manager.start());
    return manager;
  };

  it('يُدرج السطح في الصفحة ويرسم فيه، والإيقاف يفك Preact ثم يزيل المضيف ويعيد DOM كما كان', () => {
    const before = document.body.innerHTML;
    const enabled = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const manager = start(fakeUnitModules(), enabled);
    expect(mountedFakeUnits(document)).toEqual([...enabled].sort());
    expect(fakeLifecycle.mounted.get('a')).toBe(1);
    enabled.delete('a');
    manager.refresh();
    expect(mountedFakeUnits(document)).not.toContain('a');
    expect(fakeLifecycle.cleaned.get('a')).toBe(1);
    manager.stop();
    expect(document.querySelectorAll(HOST_TAG)).toHaveLength(0);
    expect(document.body.innerHTML).toBe(before);
  });

  it('render بعد الإيقاف لا يرسم شيئًا (استمرار غير متزامن بعد الإزالة)', () => {
    let surface: ReturnType<typeof mountSurface> | undefined;
    const module: ExtensionModule = {
      id: 'b',
      title: 'متأخرة',
      pages: '*',
      mount(ctx) {
        surface = mountSurface(ctx, { parent: ctx.document.body, display: 'inline' });
      },
    };
    const manager = start([module], new Set(['b']));
    const host = document.querySelector(HOST_TAG)!;
    expect(host.getAttribute('data-display')).toBe('inline');
    manager.stop();
    surface?.render(<p>متأخر</p>);
    expect(host.isConnected).toBe(false);
    expect(host.shadowRoot!.querySelector('p')).toBeNull();
  });

  it('سطحان من وحدتين منفصلان: إيقاف إحداهما لا يمس الأخرى', () => {
    const enabled = new Set(['c', 'd']);
    const manager = start(fakeUnitModules(), enabled);
    const d = [...document.querySelectorAll(HOST_TAG)].find((h) => h.getAttribute(HOST_ATTR) === 'd')!;
    enabled.delete('c');
    manager.refresh();
    expect(d.isConnected).toBe(true);
    expect(mountedFakeUnits(document)).toEqual(['d']);
    manager.stop();
  });
});
