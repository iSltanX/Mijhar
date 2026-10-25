// @vitest-environment jsdom
// PI-1 (MJ26): بطاقتا رمز GitHub (القراءة والكتابة) تقرآن الرمز من جديد حين تعود صفحة الإعدادات إلى الواجهة، فرمز حُفظ أو مُسح من صفحة إعدادات أخرى
// لا يبقى بحالته القديمة حتى إعادة التحميل؛ وتأكيد مسح رمز لم يعد هو المحفوظ يُغلق. ولا يُقرأ شيء والصفحة مخفية.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ApiGithubPermission } from '../../../../src/core/ui-host/permissions';
import { TokenStore } from '../../../../src/modules/d/token/store';
import { TokenSection } from '../../../../src/modules/d/token/TokenSection';
import { WriteTokenSection } from '../../../../src/modules/f/execution/WriteTokenSection';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { fakeToken, memoryArea } from './helpers';

let container: HTMLElement;
let visibility: DocumentVisibilityState = 'visible';
beforeEach(() => {
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => {});
};
const show = async (state: DocumentVisibilityState) => {
  visibility = state;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await flush();
};
const port = { get: vi.fn(), getAll: vi.fn(), status: vi.fn(async () => null) } as never;

describe('بطاقة رمز القراءة', () => {
  it('رمز حُفظ ثم مُسح من صفحة أخرى يظهر هنا عند العودة إلى الصفحة لا قبلها', async () => {
    const session = memoryArea();
    const disk = memoryArea();
    const here = new TokenStore({ session, disk, now: () => 1000 });
    const other = new TokenStore({ session, disk, now: () => 2000 });
    await act(async () => render(<TokenSection store={here} port={port} target="chromium" />, container));
    await flush();
    const state = () => container.querySelector('[data-token-state]')?.getAttribute('data-token-state');
    expect(state()).toBe('none');

    await other.save(fakeToken('V'), 'session');
    await show('hidden');
    expect(state()).toBe('none');
    await show('visible');
    expect(state()).toBe('session');

    await act(async () => (container.querySelector('[data-action="token-clear"]') as HTMLButtonElement | null)?.click());
    await flush();
    const confirmOpen = () => Boolean(container.querySelector('[data-token-confirm]'));
    expect(confirmOpen()).toBe(true);
    await other.clear();
    await show('visible');
    expect(state()).toBe('none');
    expect(confirmOpen()).toBe(false);
  });
});

describe('بطاقة رمز الكتابة', () => {
  it('رمز كتابة حُفظ أو مُسح من صفحة أخرى يظهر هنا عند العودة إلى الصفحة', async () => {
    const session = memoryArea();
    const disk = memoryArea();
    const here = new SecretStore({ session, disk, now: () => 1000 });
    const other = new SecretStore({ session, disk, now: () => 2000 });
    await act(async () => render(<WriteTokenSection store={here} readToken={async () => null} permission={new ApiGithubPermission(fakePermissions([]))} />, container));
    await flush();
    const state = () => container.querySelector('[data-write-state]')?.getAttribute('data-write-state');
    expect(state()).toBe('none');
    await other.save(fakeToken('W'), 'session');
    await show('visible');
    expect(state()).toBe('session');
    await other.clear();
    await show('visible');
    expect(state()).toBe('none');
  });
});
