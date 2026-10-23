// مصدر الصفحة المفتوحة لواجهات الوحدات: يعيد وصفها (PageInfo) ويُعلم بتغيّرها.
//  - documentPageSource: الدرج وسكربت المحتوى؛ يرى DOM الصفحة فيُغني الوصف منه، ويتتبع التنقل والهاش.
//  - tabsPageSource: اللوحة الجانبية الأصلية (صفحة إضافة)؛ لا ترى DOM فتقرأ رابط التبويب النشط، وتجدّد عند تبديل التبويب أو تنقله.
//    رابط التبويب متاح لأن صلاحية المضيف https://github.com/* ممنوحة (بلا صلاحية tabs). وفي صفحة الملف يطلب المرجع والمسار من
//    سكربت المحتوى في التبويب (جسر tabs.sendMessage، VR-10): الرابط وحده لا يفصل فرعًا في اسمه «/» عن المسار.
import { useEffect, useState } from 'preact/hooks';
import { enrichFromDocument, pageInfoFromUrl } from './page-info';
import type { PageInfo } from './page-info';

/** طلب اللوحة وصف الصفحة من سكربت المحتوى في التبويب النشط. */
export const PAGE_INFO_MESSAGE = 'mijhar/page-info';

export interface PageSource {
  /** الوصف الحالي، أو null إن لم تتوفر صفحة (لا تبويب نشط). */
  read(): Promise<PageInfo | null>;
  /** يُستدعى عند احتمال تغيّر الصفحة؛ يعيد دالة الإلغاء. */
  subscribe(notify: () => void): () => void;
}

const NAVIGATION_EVENTS = ['popstate', 'hashchange', 'pageshow'] as const;
const TURBO_EVENTS = ['turbo:render', 'turbo:load'] as const;

export function documentPageSource(doc: Document = document): PageSource {
  const view = doc.defaultView;
  return {
    read: async () => enrichFromDocument(pageInfoFromUrl(view?.location.href ?? doc.URL, doc.title || null), doc),
    subscribe(notify) {
      const targets: Array<[EventTarget, string]> = [];
      for (const type of TURBO_EVENTS) targets.push([doc, type]);
      if (view) {
        for (const type of NAVIGATION_EVENTS) targets.push([view, type]);
        const navigation = (view as { navigation?: EventTarget }).navigation;
        if (navigation) targets.push([navigation, 'navigatesuccess']);
      }
      for (const [target, type] of targets) target.addEventListener(type, notify);
      return () => {
        for (const [target, type] of targets) target.removeEventListener(type, notify);
      };
    },
  };
}

interface TabsEvent {
  addListener(listener: () => void): void;
  removeListener(listener: () => void): void;
}

/** الجزء الذي نستعمله من tabs؛ الأحداث اختيارية لأن ExtensionApi في النواة لا يعلنها. */
export interface ActiveTabsApi {
  query(query: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string; title?: string }>>;
  /** جسر وصف الصفحة إلى سكربت المحتوى (VR-10). */
  sendMessage?(tabId: number, message: unknown): Promise<unknown>;
  onActivated?: TabsEvent;
  onUpdated?: TabsEvent;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const lower = (value: unknown): unknown => (typeof value === 'string' ? value.toLowerCase() : value);

/** ردّ سكربت المحتوى عن الملف نفسه: المستودع ومقطع الرابط بعد blob/ كما في رابط التبويب، والمرجع مقروء من الصفحة لا من الرابط. */
function blobAnswer(reply: unknown, info: PageInfo): { ref: string; refKind: 'ref' | 'sha'; path: string } | null {
  if (!isRecord(reply) || reply.type !== 'blob' || lower(reply.owner) !== lower(info.owner) || lower(reply.repo) !== lower(info.repo)) return null;
  const { ref, path, refKind } = reply;
  if (typeof ref !== 'string' || !ref || typeof path !== 'string' || !path || (refKind !== 'ref' && refKind !== 'sha')) return null;
  return `${ref}/${path}` === info.blobRest ? { ref, refKind, path } : null;
}

/**
 * المرجع والمسار لصفحة ملف في التبويب من سكربت المحتوى فيه. إن تعذّر الجسر (لا سكربت محتوى بعد، أو صفحة لم تُرسم) أو أجاب عن
 * ملف آخر أُسقط المرجع والمسار: لا يُحفظ هدف من تقسيم الرابط. ويبقى blobRest لمطابقة الملاحظات المحفوظة (relationTo).
 */
async function blobFromTab(tabs: ActiveTabsApi, tabId: number | undefined, info: PageInfo): Promise<PageInfo> {
  if (tabs.sendMessage && tabId !== undefined) {
    try {
      const answer = blobAnswer(await tabs.sendMessage(tabId, { type: PAGE_INFO_MESSAGE }), info);
      if (answer) return { ...info, ...answer };
    } catch {
      // لا مستمع في التبويب: يُعامل كتعذّر الجسر.
    }
  }
  return { ...info, ref: null, refKind: 'unknown', path: null };
}

export function tabsPageSource(tabs: ActiveTabsApi | undefined): PageSource | null {
  if (!tabs) return null;
  return {
    async read() {
      const [tab] = await tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return null;
      const info = pageInfoFromUrl(tab.url, tab.title ?? null);
      return info.type === 'blob' && info.blobRest !== null ? blobFromTab(tabs, tab.id, info) : info;
    },
    subscribe(notify) {
      const events = [tabs.onActivated, tabs.onUpdated].filter((e): e is TabsEvent => Boolean(e));
      for (const event of events) event.addListener(notify);
      const doc = typeof document === 'undefined' ? null : document;
      // الرجوع إلى اللوحة بعد تغيير التبويب من خارجها.
      const onVisible = (): void => {
        if (doc?.visibilityState === 'visible') notify();
      };
      doc?.addEventListener('visibilitychange', onVisible);
      return () => {
        for (const event of events) event.removeListener(notify);
        doc?.removeEventListener('visibilitychange', onVisible);
      };
    },
  };
}

interface MessageEvents {
  readonly onMessage: {
    addListener(listener: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown): void;
    removeListener(listener: (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown): void;
  };
}

/** مستجيب سكربت المحتوى لجسر وصف الصفحة: يعيد وصفها من DOM (documentPageSource). يعيد دالة الإلغاء. */
export function respondPageInfo(runtime: MessageEvents, doc: Document = document): () => void {
  const source = documentPageSource(doc);
  const listener = (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): true | undefined => {
    if (!isRecord(message) || message.type !== PAGE_INFO_MESSAGE) return undefined;
    source.read().then(sendResponse, () => sendResponse(null));
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage.removeListener(listener);
}

/** تبويبات الإضافة الفعلية (browser ثم chrome)، أو undefined خارج سياق إضافة. */
export function extensionTabs(): ActiveTabsApi | undefined {
  const scope = globalThis as { browser?: { tabs?: ActiveTabsApi; runtime?: unknown }; chrome?: { tabs?: ActiveTabsApi; runtime?: unknown } };
  return (scope.browser?.runtime ? scope.browser : scope.chrome)?.tabs;
}

export interface ActivePageState {
  readonly page: PageInfo | null;
  /** false حتى تُقرأ الصفحة أول مرة. */
  readonly ready: boolean;
}

/** يربط مكوّنًا بمصدر صفحة. المصدر null (لا واجهة تبويبات) يعطي page = null. */
export function useActivePage(source: PageSource | null, debounceMs = 60): ActivePageState {
  const [state, setState] = useState<ActivePageState>({ page: null, ready: source === null });
  useEffect(() => {
    if (!source) {
      setState({ page: null, ready: true });
      return undefined;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = (): void => {
      source.read().then(
        (page) => {
          if (!alive) return;
          setState((previous) => (previous.ready && sameInfo(previous.page, page) ? previous : { page, ready: true }));
        },
        () => alive && setState({ page: null, ready: true }),
      );
    };
    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(refresh, debounceMs);
    };
    refresh();
    const unsubscribe = source.subscribe(schedule);
    return () => {
      alive = false;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [source, debounceMs]);
  return state;
}

export const sameInfo = (a: PageInfo | null, b: PageInfo | null): boolean => (a === b ? true : a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));
