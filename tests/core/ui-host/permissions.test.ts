// تدفق صلاحية api.github.com الاختيارية والبوابة الوحيدة إليه (جزء من TEST-CORE-06): لا طلب قبل المنح.
import { describe, expect, it, vi } from 'vitest';
import { API_GITHUB_ORIGIN, ApiGithubPermission, PermissionNotGrantedError, fetchApiGithub } from '../../../src/core';
import { fakePermissions } from './helpers';

describe('ApiGithubPermission', () => {
  it('يقرأ الحالة من المتصفح، ويطلب ويسحب api.github.com وحدها', async () => {
    const api = fakePermissions();
    const permission = new ApiGithubPermission(api);
    expect(await permission.has()).toBe(false);
    expect(await permission.request()).toBe(true);
    expect(api.request).toHaveBeenCalledWith({ origins: [API_GITHUB_ORIGIN] });
    expect(await permission.has()).toBe(true);
    expect(await permission.revoke()).toBe(true);
    expect(api.remove).toHaveBeenCalledWith({ origins: [API_GITHUB_ORIGIN] });
    expect(await permission.has()).toBe(false);
  });

  it('subscribe يتبع المنح والسحب من خارج الصفحة ويتجاهل غير api.github.com', () => {
    const api = fakePermissions();
    const permission = new ApiGithubPermission(api);
    const seen: boolean[] = [];
    const stop = permission.subscribe((granted) => seen.push(granted));
    api.external('added', { origins: ['https://example.com/*'] });
    api.external('added', { origins: [API_GITHUB_ORIGIN] });
    api.external('removed', { origins: [API_GITHUB_ORIGIN] });
    stop();
    api.external('added', { origins: [API_GITHUB_ORIGIN] });
    expect(seen).toEqual([true, false]);
  });
});

describe('fetchApiGithub', () => {
  it('بلا صلاحية: يرمي PermissionNotGrantedError ولا يرسل أي طلب', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(fetchApiGithub('/repos/octo/demo', undefined, { permissions: fakePermissions(), fetch })).rejects.toBeInstanceOf(PermissionNotGrantedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('بعد المنح: يطلب العنوان المطلق على api.github.com', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}'));
    await fetchApiGithub('/repos/octo/demo/pulls/42', { method: 'GET' }, { permissions: fakePermissions([API_GITHUB_ORIGIN]), fetch });
    expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/octo/demo/pulls/42', { method: 'GET' });
  });

  it('يرفض أي مضيف أو بروتوكول غير https://api.github.com ولو مُنحت الصلاحية', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const deps = { permissions: fakePermissions([API_GITHUB_ORIGIN]), fetch };
    await expect(fetchApiGithub('https://github.com/octo/demo', undefined, deps)).rejects.toThrow(/api\.github\.com/);
    await expect(fetchApiGithub('http://api.github.com/x', undefined, deps)).rejects.toThrow(/api\.github\.com/);
    await expect(fetchApiGithub('https://api.github.com.evil.test/x', undefined, deps)).rejects.toThrow(/api\.github\.com/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
