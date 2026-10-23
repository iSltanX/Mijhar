// صفحة اختبار داخل الإضافة الاختبارية: زر يفتح اللوحة الأصلية بفعل مستخدم حقيقي (نقر المشغّل)، ومساعدات على window.__t
// يستدعيها المشغّل: سياقات الإضافة، والتبويبات، وإرسال رسائل الدرج، والصلاحية، والأوامر، وخطافات الخلفية.
import { API_GITHUB_PERMISSION, DRAWER_MESSAGE, extensionApi } from '../../../../../src/core';
import type { DrawerAction } from '../../../../../src/core';

const api = extensionApi();
const out = document.getElementById('out')!;
const show = (value: unknown): void => {
  out.textContent = JSON.stringify(value);
};
let windowId: number | undefined;
void api.windows?.getCurrent().then((w) => {
  windowId = w.id;
  document.documentElement.setAttribute('data-ready', 'true');
});

type Scope = typeof globalThis & { browser?: any; chrome?: any };
const raw = (globalThis as Scope).browser ?? (globalThis as Scope).chrome;

// لا await قبل الفتح: يقبله المتصفح داخل فعل المستخدم وحده.
document.getElementById('open-native')!.addEventListener('click', () => {
  show({ pending: true });
  const opening: Promise<void> = __TARGET__ === 'firefox' ? raw.sidebarAction.open() : raw.sidePanel.open({ windowId });
  opening.then(() => show({ opened: true }), (error: Error) => show({ opened: false, error: String(error) }));
});
document.getElementById('grant')!.addEventListener('click', () => {
  show({ pending: true });
  api.permissions!.request(API_GITHUB_PERMISSION).then((granted) => show({ granted }), (error: Error) => show({ error: String(error) }));
});

(globalThis as any).__t = {
  out: () => out.textContent,
  async contexts() {
    if (!raw.runtime.getContexts) return null;
    const all = await raw.runtime.getContexts({});
    return all.map((c: { contextType: string; documentUrl?: string }) => ({ type: c.contextType, url: c.documentUrl ?? null }));
  },
  /** Firefox: وثيقة الشريط الجانبي إن فُتح (getViews)، وما رُسم فيها. */
  sidebarView() {
    const views: Window[] = raw.extension?.getViews?.({ type: 'sidebar' }) ?? [];
    return views.map((w) => ({
      url: w.location.href,
      ready: w.document.getElementById('app')?.getAttribute('data-ready') ?? null,
      tabs: [...w.document.querySelectorAll('[role="tab"]')].map((t) => t.textContent),
    }));
  },
  async sidebarOpen() {
    return raw.sidebarAction?.isOpen ? raw.sidebarAction.isOpen({}) : null;
  },
  async githubTabs() {
    const tabs = await raw.tabs.query({ url: 'https://github.com/*' });
    return tabs.map((t: { id: number; url: string; active: boolean; windowId: number }) => ({ id: t.id, url: t.url, active: t.active, windowId: t.windowId }));
  },
  drawer: (tabId: number, action: DrawerAction) => raw.tabs.sendMessage(tabId, { type: DRAWER_MESSAGE, action }).then(() => true, (e: Error) => String(e)),
  contains: () => api.permissions!.contains(API_GITHUB_PERMISSION),
  remove: () => api.permissions!.remove(API_GITHUB_PERMISSION),
  commands: () => api.commands!.getAll(),
  fetchApi: (path?: string) => api.runtime.sendMessage({ type: 'test:fetch-api', path }),
  command: (tab: { id: number; windowId: number }) => api.runtime.sendMessage({ type: 'test:command', tab }),
  outcomes: () => api.runtime.sendMessage({ type: 'test:outcomes' }),
  sidePanelOptions: (enabled: boolean) => raw.sidePanel?.setOptions({ enabled }),
};
