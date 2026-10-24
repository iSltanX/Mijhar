// الجزء الذي يستعمله المضيف من واجهات الإضافة، بأنواع دنيا تُختبر عليها بدائل وهمية. browser (Firefox) ثم chrome؛
// والواجهات الموعودة متاحة في MV3 في الاثنين.

export interface ExtEvent<L extends (...args: any[]) => unknown> {
  addListener(listener: L): void;
  removeListener(listener: L): void;
}

export interface PermissionsSet {
  origins?: string[];
  permissions?: string[];
}

export interface PermissionsApi {
  contains(permissions: PermissionsSet): Promise<boolean>;
  request(permissions: PermissionsSet): Promise<boolean>;
  remove(permissions: PermissionsSet): Promise<boolean>;
  onAdded?: ExtEvent<(permissions: PermissionsSet) => void>;
  onRemoved?: ExtEvent<(permissions: PermissionsSet) => void>;
}

export interface TabLike {
  id?: number;
  windowId?: number;
  url?: string;
}

export interface CommandInfo {
  name?: string;
  description?: string;
  shortcut?: string;
}

export interface ExtensionApi {
  runtime: {
    getURL(path: string): string;
    openOptionsPage?(): Promise<void>;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: ExtEvent<(message: unknown, sender: { tab?: TabLike; url?: string }, sendResponse: (response?: unknown) => void) => unknown>;
    onStartup?: ExtEvent<() => void>;
    onInstalled?: ExtEvent<(details: { reason: string }) => void>;
  };
  permissions?: PermissionsApi;
  tabs?: {
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    query(query: { active?: boolean; currentWindow?: boolean; lastFocusedWindow?: boolean }): Promise<TabLike[]>;
    create(properties: { url: string }): Promise<TabLike>;
    /** MJ18 (T-11.1): العودة إلى تبويب الميزة بعد الربط. */
    update?(tabId: number, properties: { active?: boolean }): Promise<TabLike | undefined>;
  };
  windows?: { getCurrent(): Promise<{ id?: number }>; update?(windowId: number, properties: { focused?: boolean }): Promise<unknown> };
  commands?: {
    getAll(): Promise<CommandInfo[]>;
    onCommand: ExtEvent<(command: string, tab?: TabLike) => void>;
    /** Firefox 137 فأعلى: يفتح صفحة إدارة الاختصارات. */
    openShortcutSettings?(): Promise<void>;
  };
  /** عائلة Chromium (Chrome 114 فأعلى، VER-03). */
  sidePanel?: {
    open(options: { windowId?: number; tabId?: number }): Promise<void>;
    setOptions(options: { enabled?: boolean; path?: string; tabId?: number }): Promise<void>;
  };
  /** Firefox (VER-11). */
  sidebarAction?: {
    open(): Promise<void>;
    close(): Promise<void>;
    toggle?(): Promise<void>;
    isOpen?(details: { windowId?: number }): Promise<boolean>;
  };
}

export function extensionApi(): ExtensionApi {
  const scope = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
  const api = scope.browser?.runtime ? scope.browser : scope.chrome;
  if (!api?.runtime) throw new Error('واجهات الإضافة غير متاحة: يجب أن يعمل المضيف داخل سياق إضافة');
  return api;
}
