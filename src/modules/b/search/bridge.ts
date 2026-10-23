// الجسر بين واجهة البحث (اللوحة أو الدرج) ووحدة الصفحة التي تحدد العنصر وتبرزه. في الدرج (سكربت المحتوى) نداء مباشر للمتحكم المركَّب؛
// وفي اللوحة الأصلية (صفحة إضافة لا تبلغ DOM الصفحة) رسالة إلى التبويب النشط، فإن لم يكن صفحة GitHub عاد 'unavailable' ولم يُفعل شيء.
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { LOCATE_MESSAGE } from './ids';
import type { LocateResult } from './locate';

export type LocateAction = 'show' | 'clear';

export interface LocateMessage {
  readonly type: typeof LOCATE_MESSAGE;
  readonly action: LocateAction;
  readonly entryId?: string;
}

export const isLocateMessage = (message: unknown): message is LocateMessage =>
  typeof message === 'object' &&
  message !== null &&
  (message as LocateMessage).type === LOCATE_MESSAGE &&
  ['show', 'clear'].includes((message as LocateMessage).action) &&
  ((message as LocateMessage).entryId === undefined || typeof (message as LocateMessage).entryId === 'string');

export interface LocateBridge {
  locate(entryId: string): Promise<LocateResult>;
  clear(): Promise<void>;
}

/** المتحكم المركَّب في صفحة هذا السكربت (تضعه الوحدة عند التركيب وتزيله عند الإيقاف). */
export interface Locator {
  locate(entryId: string): LocateResult;
  clear(): void;
}
export const ACTIVE_LOCATOR: { current: Locator | null } = { current: null };

const UNAVAILABLE: LocateResult = { status: 'unavailable' };

export function directBridge(): LocateBridge {
  return {
    locate: async (entryId) => ACTIVE_LOCATOR.current?.locate(entryId) ?? UNAVAILABLE,
    clear: async () => ACTIVE_LOCATOR.current?.clear(),
  };
}

const isResult = (value: unknown): value is LocateResult => typeof value === 'object' && value !== null && typeof (value as { status?: unknown }).status === 'string';

export function messageBridge(api: ExtensionApi): LocateBridge {
  const send = async (message: LocateMessage): Promise<unknown> => {
    const tabId = (await api.tabs?.query({ active: true, lastFocusedWindow: true }))?.[0]?.id;
    if (tabId === undefined || !api.tabs) return undefined;
    try {
      return await api.tabs.sendMessage(tabId, message);
    } catch {
      return undefined;
    }
  };
  return {
    locate: async (entryId) => {
      const response = await send({ type: LOCATE_MESSAGE, action: 'show', entryId });
      return isResult(response) ? response : UNAVAILABLE;
    },
    clear: async () => void (await send({ type: LOCATE_MESSAGE, action: 'clear' })),
  };
}

/** الجسر المناسب للسياق: سكربت المحتوى (بلا tabs) مباشر، وصفحة الإضافة بالرسائل. */
export function defaultBridge(): LocateBridge {
  try {
    const api = extensionApi();
    if (api.tabs) return messageBridge(api);
  } catch {
    // خارج سياق إضافة: النداء المباشر.
  }
  return directBridge();
}
