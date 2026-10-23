// مصدر الصفحة المفتوحة لواجهات الوحدات: يعيد وصفها (PageInfo) ويُعلم بتغيّرها.
//  - documentPageSource: الدرج وسكربت المحتوى؛ يرى DOM الصفحة فيُغني الوصف منه، ويتتبع التنقل والهاش.
//  - tabsPageSource: اللوحة الجانبية الأصلية (صفحة إضافة)؛ لا ترى DOM فتقرأ رابط التبويب النشط، وتجدّد عند تبديل التبويب أو تنقله.
//    رابط التبويب متاح لأن صلاحية المضيف https://github.com/* ممنوحة (بلا صلاحية tabs).
import { useEffect, useState } from 'preact/hooks';
import { enrichFromDocument, pageInfoFromUrl } from './page-info';
import type { PageInfo } from './page-info';

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
  query(query: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ url?: string; title?: string }>>;
  onActivated?: TabsEvent;
  onUpdated?: TabsEvent;
}

export function tabsPageSource(tabs: ActiveTabsApi | undefined): PageSource | null {
  if (!tabs) return null;
  return {
    async read() {
      const [tab] = await tabs.query({ active: true, currentWindow: true });
      return tab?.url ? pageInfoFromUrl(tab.url, tab.title ?? null) : null;
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
