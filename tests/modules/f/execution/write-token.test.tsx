// @vitest-environment jsdom
// بطاقة «صلاحية الكتابة في GitHub» (T-11.8، AC-F7 (١)، AD-27): الحفظ موافقة على صلاحية الكتابة، فيقبل النقرة الموثوقة وحدها ويطلب صلاحية
// api.github.com في النقرة نفسها؛ ويُحفظ الرمز في ذاكرة الجلسة وحدها بمفتاحه المستقل؛ ويُرفض رمز القراءة نفسه؛ ولا يُرسل شيء إلى GitHub (لا تحقق
// بطلب قراءة)؛ ولا يبقى الرمز في الحقل ولا في الصفحة بعد الحفظ؛ والمسح يعطّل خطوة التنفيذ وحدها.
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ApiGithubPermission } from '../../../../src/core/ui-host/permissions';
import { WriteTokenSection, writeTokenTemplateUrl } from '../../../../src/modules/f/execution/WriteTokenSection';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { trustedClick } from '../../../shared/trusted-click';
import { flush } from '../../d/helpers';
import { fakeToken, memoryArea } from '../../d/token/helpers';

let container: HTMLElement | null = null;
let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

async function mount(options: { granted?: boolean; readToken?: string | null } = {}) {
  const session = memoryArea();
  const disk = memoryArea();
  const store = new SecretStore({ session, disk, now: () => 1000 });
  const permissions = fakePermissions(options.granted ? ['https://api.github.com/*'] : []);
  const onChange = vi.fn();
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  render(<WriteTokenSection store={store} readToken={async () => options.readToken ?? null} permission={new ApiGithubPermission(permissions)} onChange={onChange} />, container);
  await flush();
  const root = container;
  const input = root.querySelector('#mj-write-input') as HTMLInputElement;
  const save = root.querySelector('[data-consent="write-token-save"]') as HTMLButtonElement;
  return { store, session, disk, permissions, onChange, root, input, save };
}

describe('بطاقة صلاحية الكتابة', () => {
  it('النقر البرمجي على «احفظ» لا يحفظ ولا يطلب صلاحية', async () => {
    const ui = await mount();
    ui.input.value = fakeToken('W');
    ui.save.click();
    await flush(10);
    expect(ui.session.value).toBeNull();
    expect(ui.permissions.request).not.toHaveBeenCalled();
  });

  it('النقرة الموثوقة: تطلب api.github.com في النقرة نفسها، وتحفظ في الجلسة وحدها، وتفرغ الحقل، ولا ترسل شيئًا', async () => {
    const ui = await mount();
    const token = fakeToken('W');
    ui.input.value = token;
    trustedClick(ui.save);
    // الطلب متزامن في النقرة قبل أي await.
    expect(ui.permissions.request).toHaveBeenCalledTimes(1);
    await flush(20);
    expect(ui.session.value?.token).toBe(token);
    expect(ui.disk.value).toBeNull();
    expect(ui.input.value).toBe('');
    expect(ui.root.innerHTML).not.toContain(token);
    expect(ui.root.querySelector('[data-write-message]')?.textContent).toContain('لم يُرسل إلى GitHub شيء');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ui.onChange).toHaveBeenCalled();
  });

  it('رمز القراءة المحفوظ نفسه: يُرفض ولا يُحفظ', async () => {
    const token = fakeToken('R');
    const ui = await mount({ granted: true, readToken: token });
    ui.input.value = token;
    trustedClick(ui.save);
    await flush(20);
    expect(ui.session.value).toBeNull();
    expect(ui.root.querySelector('[data-write-message]')?.textContent).toContain('رمز القراءة المحفوظ نفسه');
  });

  it('رمز كلاسيكي أو صيغة غير صالحة: يُرفض بسببه', async () => {
    const ui = await mount({ granted: true });
    ui.input.value = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
    trustedClick(ui.save);
    await flush(10);
    expect(ui.session.value).toBeNull();
    expect(ui.root.querySelector('[data-write-message]')?.textContent).toContain('كلاسيكي');
  });

  it('المسح يمحو الرمز من الموضعين ويذكر ما يتعطل وحده', async () => {
    const ui = await mount({ granted: true });
    ui.input.value = fakeToken('W');
    trustedClick(ui.save);
    await flush(20);
    (ui.root.querySelector('[data-action="write-token-clear"]') as HTMLButtonElement).click();
    await flush();
    expect(ui.root.querySelector('[data-write-confirm] [data-disables]')?.textContent).toContain('نفّذ: أنشئ الفرع وافتح الطلب');
    (ui.root.querySelector('[data-action="write-token-clear-confirm"]') as HTMLButtonElement).click();
    await flush(20);
    expect(ui.session.value).toBeNull();
    expect(ui.root.querySelector('[data-write-message]')?.textContent).toContain('تتوقف خطوة التنفيذ وحدها');
  });

  it('قالب إنشاء الرمز: صلاحيتا الكتابة وحدهما ومدة قصيرة، ولا صلاحية غيرهما', () => {
    const url = new URL(writeTokenTemplateUrl());
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new');
    expect(url.searchParams.get('contents')).toBe('write');
    expect(url.searchParams.get('pull_requests')).toBe('write');
    expect(url.searchParams.get('expires_in')).toBe('7');
    const permissionParams = [...url.searchParams.keys()].filter((k) => !['name', 'description', 'expires_in'].includes(k));
    expect(permissionParams.sort()).toEqual(['contents', 'pull_requests']);
  });
});
