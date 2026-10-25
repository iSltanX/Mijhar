// @vitest-environment jsdom
// «الإبلاغ عن مشكلة» (O-20، AC-10.3، MJ26): لا طلب ولا صلاحية قبل «أرسل البلاغ» بنقرة موثوقة؛ والصلاحية أول ما في النقرة بمضيف القناة وحده (ومعه
// technicalAndInteraction في Firefox)؛ وما يُرسل هو النص المعروض حرفًا؛ وإعادة المحاولة بالمفتاح نفسه والنص المعدَّل بمفتاح جديد؛ والنسخ بلا شبكة.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostics } from '../../src/core/report/payload';
import { ReportPage } from '../../src/options/report/ReportPage';
import { trustedClick } from '../shared/trusted-click';

const DIAG: Diagnostics = { appVersion: '0.1.0', os: 'macos', osVersion: '27.0.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.8078.47', buildTarget: 'chromium', surface: 'native', disabledUnits: [], test: false };

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
  for (let i = 0; i < 8; i += 1) await act(async () => {});
};

async function mount(options: { target?: 'chromium' | 'firefox'; granted?: boolean; reply?: unknown } = {}) {
  const settings = { isModuleEnabled: () => true, get: () => 'native' } as never;
  const permissions = { request: vi.fn(async () => options.granted ?? true), contains: vi.fn(async () => false), remove: vi.fn() };
  const port = { send: vi.fn(async () => options.reply ?? { ok: true, id: 12, replayed: false }) };
  const copy = vi.fn(async () => {});
  let n = 0;
  const newKey = vi.fn(() => `00000000-0000-4000-8000-00000000000${++n}`);
  await act(async () => render(<ReportPage settings={settings} permissions={permissions as never} target={options.target ?? 'chromium'} port={port as never} onBack={() => {}} diagnostics={async () => DIAG} copy={copy} newKey={newKey} />, container));
  await flush();
  const q = <E extends Element = HTMLElement>(s: string) => container.querySelector(s) as E;
  const type = async (value: string) => {
    const t = q<HTMLTextAreaElement>('[data-report-text]');
    t.value = value;
    await act(async () => void t.dispatchEvent(new Event('input', { bubbles: true })));
    await flush();
  };
  const click = async (sel: string, trusted = true) => {
    await act(async () => (trusted ? trustedClick(q(sel)) : q<HTMLButtonElement>(sel).click()));
    await flush();
  };
  return { permissions, port, copy, newKey, q, type, click };
}

describe('الإبلاغ عن مشكلة', () => {
  it('لا صلاحية ولا طلب قبل النقر، والإرسال معطّل بلا وصف', async () => {
    const ui = await mount();
    expect(ui.q<HTMLButtonElement>('[data-action="report-send"]').disabled).toBe(true);
    await ui.type('البطاقة فارغة بعد التحديث');
    expect(ui.q<HTMLButtonElement>('[data-action="report-send"]').disabled).toBe(false);
    expect(ui.permissions.request).not.toHaveBeenCalled();
    expect(ui.port.send).not.toHaveBeenCalled();
  });

  it('المعاينة تعرض كل حقل مرسل، والنص الكامل هو الجسم الذي يصل إلى الخلفية حرفًا', async () => {
    const ui = await mount();
    await ui.type('  وصف  ');
    const fields = [...container.querySelectorAll('[data-report-field]')].map((r) => r.getAttribute('data-report-field'));
    expect(fields).toEqual(['product', 'kind', 'app_version', 'diagnostics.browser · browser_version', 'diagnostics.build_target', 'os · os_version · arch', 'locale', 'diagnostics.surface', 'diagnostics.disabled_units']);
    const shown = JSON.parse(ui.q('[data-report-json] pre').textContent ?? '');
    await ui.click('[data-action="report-send"]');
    expect(ui.port.send).toHaveBeenCalledTimes(1);
    expect((ui.port.send.mock.calls[0] as unknown[])[0]).toEqual(shown);
    expect(shown.description).toBe('وصف');
    expect(ui.q('[data-report-result="sent"]').textContent).toContain('#12');
  });

  it('النقرة البرمجية لا ترسل ولا تطلب صلاحية', async () => {
    const ui = await mount();
    await ui.type('وصف');
    await ui.click('[data-action="report-send"]', false);
    expect(ui.permissions.request).not.toHaveBeenCalled();
    expect(ui.port.send).not.toHaveBeenCalled();
  });

  it('الصلاحية أول ما في النقرة: مضيف القناة وحده في Chromium، ومعه technicalAndInteraction في Firefox؛ ورفضها لا يرسل شيئًا', async () => {
    const chrome = await mount({ granted: false });
    await chrome.type('وصف');
    await chrome.click('[data-action="report-send"]');
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://app-reports.isultantf.workers.dev/*'] });
    expect(chrome.port.send).not.toHaveBeenCalled();
    expect(chrome.q('[data-report-result="failed"]').textContent).toContain('لم يُمنح إذن');
    render(null, container);
    const ff = await mount({ target: 'firefox' });
    await ff.type('وصف');
    await ff.click('[data-action="report-send"]');
    expect(ff.permissions.request).toHaveBeenCalledWith({ origins: ['https://app-reports.isultantf.workers.dev/*'], data_collection: ['technicalAndInteraction'] });
  });

  it('الفشل القابل للإعادة: المحاولة الثانية بالمفتاح نفسه، والنص المعدَّل بمفتاح جديد', async () => {
    const ui = await mount({ reply: { ok: false, failure: 'server', status: 503 } });
    await ui.type('وصف أول');
    await ui.click('[data-action="report-send"]');
    await ui.click('[data-action="report-send"]');
    const [k1, k2] = ui.port.send.mock.calls.map((c) => (c as unknown[])[1]);
    expect(k1).toBe(k2);
    expect(ui.q('[data-report-result="failed"]').textContent).toContain('أعد المحاولة');
    await ui.type('وصف معدَّل');
    await ui.click('[data-action="report-send"]');
    expect((ui.port.send.mock.calls[2] as unknown[])[1]).not.toBe(k1);
  });

  it('نص فيه ما يشبه رمزًا أو مفتاحًا: تنبيه باسم الصيغة، ولا إرسال ولا نسخ ولا صلاحية حتى يُحذف', async () => {
    const ui = await mount();
    await ui.type(`الرمز ${'ghp_'}${'a'.repeat(36)} لا يعمل`);
    expect(ui.q('[data-report-secret]')?.textContent).toContain('رمز GitHub');
    expect(ui.q<HTMLButtonElement>('[data-action="report-send"]').disabled).toBe(true);
    expect(ui.q<HTMLButtonElement>('[data-action="report-copy"]').disabled).toBe(true);
    await ui.click('[data-action="report-send"]');
    expect(ui.permissions.request).not.toHaveBeenCalled();
    expect(ui.port.send).not.toHaveBeenCalled();
    await ui.type('الرمز لا يعمل');
    expect(ui.q('[data-report-secret]')).toBeNull();
    expect(ui.q<HTMLButtonElement>('[data-action="report-send"]').disabled).toBe(false);
  });

  it('«انسخ البلاغ» ينسخ النص الكامل نفسه بلا صلاحية ولا طلب', async () => {
    const ui = await mount();
    await ui.type('وصف');
    await ui.click('[data-action="report-copy"]');
    expect(ui.copy).toHaveBeenCalledWith(ui.q('[data-report-json] pre').textContent);
    expect(ui.permissions.request).not.toHaveBeenCalled();
    expect(ui.port.send).not.toHaveBeenCalled();
  });
});
