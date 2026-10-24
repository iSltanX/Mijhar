// بوابة طلبات المزوّد (T-11.6، AC-E9 (٤)، AD-19): كل طلب يمر بها إلى مضيف المحوّل وحده، بعد صلاحية المضيف الاختيارية الممنوحة بنقر صريح،
// بلا ملفات تعريف ارتباط ولا مرجِع، فلا يصل المفتاح ولا المحتوى إلى وجهة أخرى. وصلاحية المضيف تُطلب من معالج نقر في صفحة الإعدادات وحدها
// (لا await قبلها، VER-05)، وتُقرأ من المتصفح في كل مرة ولا تُخزَّن.
import type { PermissionsApi, PermissionsSet } from '../../../core/ui-host/browser-api';
import type { GatedFetch, ProviderAdapter } from './types';

export class ProviderPermissionError extends Error {
  readonly code = 'provider-permission';
  constructor(readonly origin: string) {
    super(`صلاحية ${origin} غير ممنوحة: امنحها من بطاقة مفتاح المزوّد في الإعدادات أولًا`);
    this.name = 'ProviderPermissionError';
  }
}

export interface GateDeps {
  readonly permissions: PermissionsApi;
  readonly fetch?: typeof fetch;
}

/** طلب إلى مضيف المحوّل وحده. عنوان خارجه خطأ برمجي يرمي ولا يُرسل. */
export function gatedFetch(adapter: Pick<ProviderAdapter, 'host' | 'origin'>, deps: GateDeps): GatedFetch {
  const set: PermissionsSet = { origins: [adapter.origin] };
  return async (path, init) => {
    const url = new URL(path, `https://${adapter.host}/`);
    if (url.protocol !== 'https:' || url.host !== adapter.host) throw new Error(`طلب المزوّد لا يقبل إلا https://${adapter.host}: ${url.href}`);
    if (!(await deps.permissions.contains(set))) throw new ProviderPermissionError(adapter.origin);
    return (deps.fetch ?? globalThis.fetch)(url.href, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  };
}

/** يحذف المفتاح من نص (رسالة خطأ أو ردّ) إن ظهر فيه، احتياطًا: لا يظهر مفتاح في رسالة ولا سجل (AC-E9 (٤)). */
export function redactKey(text: string, key: string | null): string {
  return key && key.length >= 8 ? text.split(key).join('‹المفتاح›') : text;
}

/** صلاحية مضيف المزوّد الاختيارية: تُطلب وتُسحب من صفحة الإعدادات، وحالتها من المتصفح في كل مرة. */
export class ProviderHostPermission {
  private readonly set: PermissionsSet;

  constructor(
    private readonly api: PermissionsApi,
    readonly origin: string,
  ) {
    this.set = { origins: [origin] };
  }

  has(): Promise<boolean> {
    return this.api.contains(this.set);
  }

  /** يُستدعى متزامنًا من معالج نقر صريح قبل أي await (المتصفح يرفضه خارج فعل المستخدم). */
  request(): Promise<boolean> {
    return this.api.request(this.set);
  }

  revoke(): Promise<boolean> {
    return this.api.remove(this.set);
  }

  subscribe(listener: (granted: boolean) => void): () => void {
    const mentions = (set: PermissionsSet): boolean => (set.origins ?? []).includes(this.origin);
    const added = (set: PermissionsSet): void => {
      if (mentions(set)) listener(true);
    };
    const removed = (set: PermissionsSet): void => {
      if (mentions(set)) listener(false);
    };
    this.api.onAdded?.addListener(added);
    this.api.onRemoved?.addListener(removed);
    return () => {
      this.api.onAdded?.removeListener(added);
      this.api.onRemoved?.removeListener(removed);
    };
  }
}
