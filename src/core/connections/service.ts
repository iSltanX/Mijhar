// خدمة سجل الاتصالات في الخلفية (T-11.1): تسجّل صحة كل اتصال من الاستجابات الفعلية التي تمر بها، وتعرض الحالة بلا سرّ، وتدير العودة
// إلى الميزة التي طلبت الربط. الخلفية وحدها ترى استجابات الطلبات الموثَّقة، فهي وحدها تكتب الصحة.
//  - السجل يُحفظ في storage.session (لا سرّ فيه: حالة وأرقام وأسباب منقّحة)، فيبقى بعد إيقاظ الخلفية ويُمحى بإغلاق المتصفح؛ وإن تعذّر
//    فالذاكرة. سجل لكل اتصال مربوط بوقت حفظ سرّه.
//  - التعديلات متسلسلة في طابور واحد، فلا تُسقط استجابتان متزامنتان إحداهما الأخرى.
import type { PublicApiResult } from '../api/client';
import type { ExtensionApi, TabLike } from '../ui-host/browser-api';
import { CONNECTION_IDS } from './definitions';
import type { ConnectionId } from './definitions';
import { isFeatureId } from './features';
import type { FeatureId } from './features';
import { resolveStatus, verdictFromUsage, verdictFromVerification } from './health';
import type { ConnectionStatus, HealthRecord, Verdict } from './health';
import { CONNECTIONS_CHANGED_MESSAGE } from './port';
import type { ConnectionsChangedMessage, ConnectionsRequest, PendingReturn } from './port';
import type { SecretStore, SessionStorageLike } from './secrets';

export const HEALTH_LOG_KEY = 'mijhar.connections.health';

/** حفظ سجلات الصحة. */
export interface HealthLog {
  load(): Promise<readonly HealthRecord[]>;
  save(records: readonly HealthRecord[]): Promise<void>;
}

export function memoryHealthLog(): HealthLog & { records: readonly HealthRecord[] } {
  const log = {
    records: [] as readonly HealthRecord[],
    load: async () => log.records,
    save: async (records: readonly HealthRecord[]) => {
      log.records = records;
    },
  };
  return log;
}

const isRecord = (value: unknown): value is HealthRecord => {
  const v = value as Partial<HealthRecord> | null;
  return typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.savedAt === 'number' && typeof v.health === 'string' && typeof v.checkedAt === 'number';
};

export function sessionHealthLog(session: SessionStorageLike): HealthLog {
  return {
    async load() {
      const value = (await session.get(HEALTH_LOG_KEY))[HEALTH_LOG_KEY];
      return Array.isArray(value) ? value.filter(isRecord) : [];
    },
    save: (records) => session.set({ [HEALTH_LOG_KEY]: records }),
  };
}

/** سجل الصحة في storage.session للإضافة إن وُجدت، وإلا الذاكرة. */
export function extensionHealthLog(scope: typeof globalThis = globalThis): HealthLog {
  const g = scope as { browser?: { storage?: { session?: SessionStorageLike } }; chrome?: { storage?: { session?: SessionStorageLike } } };
  const session = g.browser?.storage?.session ?? g.chrome?.storage?.session;
  return session ? sessionHealthLog(session) : memoryHealthLog();
}

export interface ConnectionsServiceOptions {
  /** مخزن سرّ كل اتصال (يُقرأ منه وقت الحفظ ومكانه فقط). */
  readonly stores: Partial<Record<ConnectionId, Pick<SecretStore, 'info'>>>;
  readonly log?: HealthLog;
  /** صلاحيات القراءة التي يضيفها المستخدم للرمز (READ_PERMISSIONS)، ليُميَّز نقص الرمز مما لا يُتاح له أصلًا. */
  readonly fixable: readonly string[];
  readonly api?: Pick<ExtensionApi, 'tabs' | 'windows'>;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
}

interface Pending {
  readonly tabId: number;
  readonly windowId: number | null;
  readonly feature: FeatureId;
}

export class ConnectionsService {
  private records: Map<ConnectionId, HealthRecord> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingReturn: Pending | null = null;
  private readonly log: HealthLog;
  private readonly now: () => number;

  constructor(private readonly options: ConnectionsServiceOptions) {
    this.log = options.log ?? memoryHealthLog();
    this.now = options.now ?? (() => Date.now());
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async loaded(): Promise<Map<ConnectionId, HealthRecord>> {
    if (!this.records) {
      const list = await this.log.load().catch((error: unknown) => {
        this.options.onError?.(error);
        return [] as readonly HealthRecord[];
      });
      this.records = new Map(list.map((r) => [r.id, r]));
    }
    return this.records;
  }

  private async write(id: ConnectionId, savedAt: number, verdict: Verdict): Promise<void> {
    const records = await this.loaded();
    records.set(id, { id, savedAt, health: verdict.health, checkedAt: this.now(), detail: verdict.detail });
    await this.log.save([...records.values()]).catch((error: unknown) => this.options.onError?.(error));
  }

  /** حالة كل الاتصالات الآن. */
  status(): Promise<ConnectionStatus[]> {
    return this.serial(async () => {
      const records = await this.loaded();
      const now = this.now();
      return Promise.all(
        CONNECTION_IDS.map(async (id) => {
          const info = (await this.options.stores[id]?.info().catch(() => null)) ?? null;
          return resolveStatus(id, info, records.get(id) ?? null, now);
        }),
      );
    });
  }

  /**
   * يسجّل استجابة طلب GitHub مرّ بالخلفية: /rate_limit تحقق صريح، وغيره استعمال. expiresAt من حالة العميل بعد الطلب. لا يُسجَّل شيء
   * حين لا سرّ محفوظ.
   */
  observeGithub(path: string, result: PublicApiResult<unknown>, expiresAt: number | null): Promise<void> {
    return this.serial(async () => {
      const info = await this.options.stores['github-token']?.info().catch(() => null);
      if (!info) return;
      const records = await this.loaded();
      const current = records.get('github-token');
      const same = current && current.savedAt === info.savedAt ? current.health : null;
      const verdict = path === '/rate_limit' ? verdictFromVerification(result, expiresAt) : verdictFromUsage(path, result, same, { fixable: this.options.fixable, expiresAt });
      if (verdict) await this.write('github-token', info.savedAt, verdict);
    });
  }

  /** طلب ربط من ميزة في تبويب: يُحفظ للعودة إليه. الميزة من القائمة المغلقة وحدها. */
  setPending(tab: TabLike | undefined, feature: unknown): void {
    if (tab?.id === undefined || !isFeatureId(feature)) return;
    this.pendingReturn = { tabId: tab.id, windowId: tab.windowId ?? null, feature };
  }

  pending(): PendingReturn | null {
    return this.pendingReturn ? { feature: this.pendingReturn.feature } : null;
  }

  dismiss(): void {
    this.pendingReturn = null;
  }

  /** يعيد إلى تبويب الميزة ويبلغها بتغيّر الاتصال. */
  async returnToFeature(): Promise<boolean> {
    const target = this.pendingReturn;
    const tabs = this.options.api?.tabs;
    if (!target || !tabs?.update) return false;
    this.pendingReturn = null;
    try {
      await tabs.update(target.tabId, { active: true });
      if (target.windowId !== null) await this.options.api?.windows?.update?.(target.windowId, { focused: true }).catch(() => undefined);
    } catch {
      return false;
    }
    await tabs.sendMessage(target.tabId, { type: CONNECTIONS_CHANGED_MESSAGE, feature: target.feature } satisfies ConnectionsChangedMessage).catch(() => undefined);
    return true;
  }

  /** يعالج رسالة السجل. لا يرمي. */
  async handle(request: ConnectionsRequest): Promise<unknown> {
    switch (request.op) {
      case 'status':
        return this.status();
      case 'pending':
        return this.pending();
      case 'return':
        return this.returnToFeature();
      case 'dismiss':
        this.dismiss();
        return true;
    }
  }
}
