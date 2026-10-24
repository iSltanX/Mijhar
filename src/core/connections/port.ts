// رسائل سجل الاتصالات بين الخلفية وصفحاتها وسكربت المحتوى (T-11.1). لا سرّ يعبرها: الحالة والمكان ووقت الحفظ والتحقق وحدها.
//  - status: حالة كل اتصال الآن (الإعدادات لعرضها، والأقسام لبواباتها).
//  - pending / return / dismiss: العودة إلى الميزة التي طلبت الربط (AC-11.1 ‏(٣)). الخلفية تحفظ التبويب من مرسل رسالة فتح الإعدادات
//    (sender.tab، لا من محتواها) والميزة من القائمة المغلقة، ثم تعيد إليه وتبلغه بتغيّر الاتصال.
import type { ExtensionApi } from '../ui-host/browser-api';
import type { FeatureId } from './features';
import type { ConnectionStatus } from './health';

export const CONNECTIONS_MESSAGE = 'mijhar/connections';
/** من الخلفية إلى تبويب الميزة بعد العودة إليها: تقرأ حالة اتصالها من جديد. */
export const CONNECTIONS_CHANGED_MESSAGE = 'mijhar/connections-changed';

export type ConnectionsOp = 'status' | 'pending' | 'return' | 'dismiss';

export interface ConnectionsRequest {
  readonly type: typeof CONNECTIONS_MESSAGE;
  readonly op: ConnectionsOp;
}

export interface ConnectionsChangedMessage {
  readonly type: typeof CONNECTIONS_CHANGED_MESSAGE;
  readonly feature: FeatureId | null;
}

/** طلب ربط من ميزة ينتظر العودة إليها. */
export interface PendingReturn {
  readonly feature: FeatureId;
}

export interface ConnectionsPort {
  status(): Promise<readonly ConnectionStatus[]>;
  pending(): Promise<PendingReturn | null>;
  /** يعيد المستخدم إلى تبويب الميزة ويبلغها. false: لا طلب معلّق أو أُغلق تبويبه. */
  returnToFeature(): Promise<boolean>;
  dismiss(): Promise<void>;
}

const OPS: readonly ConnectionsOp[] = ['status', 'pending', 'return', 'dismiss'];

export const isConnectionsRequest = (message: unknown): message is ConnectionsRequest =>
  typeof message === 'object' && message !== null && (message as ConnectionsRequest).type === CONNECTIONS_MESSAGE && OPS.includes((message as ConnectionsRequest).op);

export const isConnectionsChanged = (message: unknown): message is ConnectionsChangedMessage =>
  typeof message === 'object' && message !== null && (message as ConnectionsChangedMessage).type === CONNECTIONS_CHANGED_MESSAGE;

/** منفذ الصفحات وسكربت المحتوى: رسائل إلى الخلفية. تعذّر الرسالة نفسها لا يُعرض حالةً: قائمة فارغة أو null أو false. */
export function runtimeConnectionsPort(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>): ConnectionsPort {
  const send = async <R>(op: ConnectionsOp, fallback: R): Promise<R> => {
    try {
      const response = await runtime.sendMessage({ type: CONNECTIONS_MESSAGE, op } satisfies ConnectionsRequest);
      return (response ?? fallback) as R;
    } catch {
      return fallback;
    }
  };
  return {
    status: () => send<readonly ConnectionStatus[]>('status', []),
    pending: () => send<PendingReturn | null>('pending', null),
    returnToFeature: () => send<boolean>('return', false),
    dismiss: async () => {
      await send<unknown>('dismiss', null);
    },
  };
}
