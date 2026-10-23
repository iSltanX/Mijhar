// الجسر بين قائمة الجولات (اللوحة أو الدرج) ووحدة الصفحة التي تعرض الجولة. في الدرج (سكربت المحتوى) نداء مباشر للحالة المشتركة؛ وفي اللوحة الأصلية
// (صفحة إضافة لا تبلغ DOM الصفحة) رسالة إلى التبويب النشط، فإن لم يكن صفحة GitHub عاد null ولم يُفعل شيء.
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { TOUR_MESSAGE } from './ids';
import { TOUR_STATE, isTourMessage } from './state';
import type { TourAction, TourState, TourStatus } from './state';

export interface TourBridge {
  /** حالة الجولة الجارية في التبويب النشط، أو null إن تعذّر الوصول إلى صفحة GitHub. */
  status(): Promise<TourStatus | null>;
  send(action: TourAction, id?: string): Promise<TourStatus | null>;
  /** تغيّر الحالة من الشريط نفسه؛ لا يتوفر عبر الرسائل. */
  subscribe?(listener: () => void): () => void;
}

export function directBridge(state: TourState = TOUR_STATE): TourBridge {
  return {
    status: async () => state.status,
    send: async (action, id) => state.apply({ type: TOUR_MESSAGE, action, ...(id === undefined ? {} : { id }) }),
    subscribe: (listener) => state.subscribe(listener),
  };
}

const isStatus = (value: unknown): value is TourStatus =>
  typeof value === 'object' && value !== null && ((value as TourStatus).active === null || typeof (value as TourStatus).active === 'string') && typeof (value as TourStatus).step === 'number';

export function messageBridge(api: ExtensionApi): TourBridge {
  const call = async (action: TourAction, id?: string): Promise<TourStatus | null> => {
    const tabId = (await api.tabs?.query({ active: true, lastFocusedWindow: true }))?.[0]?.id;
    if (tabId === undefined || !api.tabs) return null;
    const message = { type: TOUR_MESSAGE, action, ...(id === undefined ? {} : { id }) };
    if (!isTourMessage(message)) return null;
    try {
      const response = await api.tabs.sendMessage(tabId, message);
      return isStatus(response) ? response : null;
    } catch {
      return null;
    }
  };
  return { status: () => call('status'), send: call };
}

/** الجسر المناسب للسياق: سكربت المحتوى (بلا tabs) مباشر، وصفحة الإضافة بالرسائل. */
export function defaultBridge(state: TourState = TOUR_STATE): TourBridge {
  try {
    const api = extensionApi();
    if (api.tabs) return messageBridge(api);
  } catch {
    // خارج سياق إضافة: الحالة المباشرة.
  }
  return directBridge(state);
}
