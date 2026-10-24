// @vitest-environment jsdom
// دليل رمز GitHub (AD-29، الإطار O-17): رابط القالب يملأ صلاحيات القراءة الست وحدها، والدليل يعرض فائدة الرمز وحدوده من الشيفرة نفسها،
// وكل خطوة نصّ كامل ورسم موسوم بأنه توضيحي، والروابط الخارجية في تبويب جديد بلا opener؛ ومدخل «كيف تحصل على الرمز؟» قرب إعداد الرمز
// يفتح الدليل داخل صفحة الإعدادات، والرجوع يعيد التركيز إليه. لا طلب شبكة من الدليل.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_PERMISSIONS, TOKEN_LIMITS } from '../../src/modules/d/token/format';
import { TokenGuide } from '../../src/options/guide/TokenGuide';
import { TOKEN_NEW_URL, TOKEN_TEMPLATE, tokenTemplateUrl } from '../../src/options/guide/template-url';
import { OptionsApp } from '../../src/options/OptionsApp';

describe('رابط قالب إنشاء الرمز', () => {
  it('الاسم والوصف والمدة، وست صلاحيات read تطابق READ_PERMISSIONS، ولا كتابة ولا إدارة ولا مالك', () => {
    const url = new URL(tokenTemplateUrl());
    expect(`${url.origin}${url.pathname}`).toBe(TOKEN_NEW_URL);
    expect(url.searchParams.get('name')).toBe(TOKEN_TEMPLATE.name);
    expect(TOKEN_TEMPLATE.name.length).toBeLessThanOrEqual(40);
    expect(TOKEN_TEMPLATE.description.length).toBeLessThanOrEqual(1024);
    expect(url.searchParams.get('expires_in')).toBe('90');
    const perms = [...url.searchParams.entries()].filter(([k]) => !['name', 'description', 'expires_in'].includes(k));
    expect(perms).toEqual(READ_PERMISSIONS.map((p) => [p.param, 'read']));
    expect(perms.map(([k]) => k)).toEqual(['metadata', 'contents', 'pull_requests', 'statuses', 'actions', 'issues']);
    expect(url.search).not.toMatch(/write|admin|target_name|none/);
  });
});

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  history.replaceState(null, '', '/');
});

describe('صفحة الدليل', () => {
  it('سبع خطوات، لكل منها نص ورسم بوسمه واسم وصفي، وحدود الرمز والصلاحيات من الشيفرة', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    act(() => render(<TokenGuide onBack={() => {}} />, container));
    const steps = [...container.querySelectorAll('.step')];
    expect(steps).toHaveLength(7);
    for (const step of steps) {
      expect(step.querySelector('h3')?.textContent?.trim().length).toBeGreaterThan(5);
      expect(step.querySelector('.step-text p')?.textContent?.length).toBeGreaterThan(20);
      const fig = step.querySelector('figure.guide-figure');
      expect(fig?.querySelector('figcaption')?.textContent).toMatch(/رسم توضيحي، ليس لقطة من GitHub|من واجهة مِجهَر/);
      expect(fig?.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toMatch(/^رسم توضيحي/);
    }
    expect([...container.querySelectorAll('[data-guide-permissions] li')].map((li) => li.getAttribute('data-permission'))).toEqual(READ_PERMISSIONS.map((p) => p.name));
    expect([...container.querySelectorAll('[data-token-limits] li')].map((li) => li.textContent)).toEqual([...TOKEN_LIMITS]);
    expect(container.textContent).toContain('الرمز لا يجعل النتائج أدق');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('كل رابط خارجي إلى github.com أو docs.github.com في تبويب جديد بلا opener ولا referrer، ولا يحمل رمزًا', () => {
    act(() => render(<TokenGuide onBack={() => {}} />, container));
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')];
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const a of links) {
      expect(['github.com', 'docs.github.com']).toContain(new URL(a.href).hostname);
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.href).not.toMatch(/github_pat_|ghp_/);
    }
    expect(container.querySelector('[data-action="token-template"]')?.getAttribute('href')).toBe(tokenTemplateUrl());
  });

  it('الرسم لا يحوي رمزًا ولا اسم حساب حقيقيًا: الرمز مقنَّع والأسماء نائبة', () => {
    act(() => render(<TokenGuide onBack={() => {}} />, container));
    const svgText = [...container.querySelectorAll('svg text')].map((t) => t.textContent).join(' ');
    expect(svgText).toMatch(/github_pat_•+/);
    expect(svgText).not.toMatch(/github_pat_[A-Za-z0-9]/);
    expect(svgText).toContain('your-account');
    expect(svgText).not.toMatch(/iSltanX|sultan/i);
  });
});

describe('التنقل في صفحة الإعدادات', () => {
  const settingsView = () => (
    <section data-section="token">
      <h2>رمز GitHub للقراءة (اختياري)</h2>
      <a href="#guide/github-token" data-action="token-guide">
        كيف تحصل على الرمز؟
      </a>
    </section>
  );

  it('#guide/github-token يعرض الدليل ويركّز عنوانه، والرجوع يعيد #token ويركّز مدخل الدليل', async () => {
    location.hash = 'guide/github-token';
    act(() => render(<OptionsApp settings={settingsView} />, container));
    expect(container.querySelector('[data-guide="github-token"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('mj-guide-title');
    expect(document.title).toBe('دليل رمز GitHub — مِجهَر');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    await act(async () => {
      (container.querySelector('[data-action="guide-back"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(location.hash).toBe('#token');
    expect(container.querySelector('[data-guide]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-action')).toBe('token-guide');
  });

  it('النقر على المدخل يغيّر العنوان فيُفتح الدليل (ويعمل زر الرجوع في المتصفح)', async () => {
    act(() => render(<OptionsApp settings={settingsView} />, container));
    await act(async () => {
      (container.querySelector('[data-action="token-guide"]') as HTMLAnchorElement).click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(location.hash).toBe('#guide/github-token');
    expect(container.querySelector('[data-guide="github-token"]')).not.toBeNull();
  });
});
