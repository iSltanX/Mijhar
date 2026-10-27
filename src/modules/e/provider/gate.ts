// بوابة طلبات المزوّد (T-11.6، T-11.10، AC-E10 (٢) و(٦)، AD-19): كل طلب يمر بها إلى مضيف مزوّده وحده، بعد صلاحية مضيفه الاختيارية الممنوحة بنقر صريح،
// بلا ملفات تعريف ارتباط ولا مرجِع، وبمفتاح ذلك المزوّد وحده (bindKey): فلا يصل مفتاح مزوّد ولا المحتوى إلى مضيف غيره. وصلاحية المضيف تُطلب من معالج
// نقر في صفحة الإعدادات وحدها (لا await قبلها، VER-05)، وتُقرأ من المتصفح في كل مرة ولا تُخزَّن. وفي Firefox تُطلب معها في الطلب نفسه موافقة مشاركة
// محتوى المواقع (data_collection: websiteContent، AD-15)، وهي واحدة للإضافة كلها: سحبها يوقف التحليل عند كل المزوّدين، وسحب مضيف يوقفه عند مزوّده.
import type { PermissionsApi, PermissionsSet } from '../../../core/ui-host/browser-api';
import type { GatedFetch, ProviderDescriptor } from './types';

export class ProviderPermissionError extends Error {
  readonly code = 'provider-permission';
  constructor(readonly origin: string) {
    super(`صلاحية ${origin} غير ممنوحة: امنحها من بطاقة «مزوّد التحليل» في الإعدادات أولًا`);
    this.name = 'ProviderPermissionError';
  }
}

/** مفتاح محفوظ مقرون بمزوّده: قرأته الخدمة من مخزن ذلك المزوّد وحده. */
export interface ProviderSecret {
  readonly provider: string;
  readonly token: string;
}

export class ProviderKeyMismatchError extends Error {
  readonly code = 'provider-key-mismatch';
  constructor(owner: string, target: string) {
    super(`مفتاح المزوّد ${owner} لا يُرسل إلى مضيف ${target}؛ لم يُرسل شيء`);
    this.name = 'ProviderKeyMismatchError';
  }
}

/** المفتاح لطلب إلى مزوّد بعينه: يرمي قبل أي طلب إن كان مفتاح مزوّد آخر (AC-E10 (٢)، RISK-14). */
export function bindKey(descriptor: Pick<ProviderDescriptor, 'id'>, secret: ProviderSecret): string {
  if (secret.provider !== descriptor.id) throw new ProviderKeyMismatchError(secret.provider, descriptor.id);
  return secret.token;
}

export interface GateDeps {
  readonly permissions: PermissionsApi;
  readonly fetch?: typeof fetch;
}

/** طلب إلى مضيف المزوّد وحده. عنوان خارجه خطأ برمجي يرمي ولا يُرسل. */
export function gatedFetch(descriptor: Pick<ProviderDescriptor, 'host' | 'origin'>, deps: GateDeps): GatedFetch {
  const set: PermissionsSet = { origins: [descriptor.origin] };
  return async (path, init) => {
    const url = new URL(path, `https://${descriptor.host}/`);
    if (url.protocol !== 'https:' || url.host !== descriptor.host) throw new Error(`طلب المزوّد لا يقبل إلا https://${descriptor.host}: ${url.href}`);
    if (!(await deps.permissions.contains(set))) throw new ProviderPermissionError(descriptor.origin);
    // redirect: 'error': لا يُتبع تحويل من مضيف المزوّد إلى غيره ومعه ترويسة المفتاح والمحتوى (Fetch يُبقي الترويسات المخصصة عبر التحويل). عقد
    // الشبكة طلب إلى مضيف المزوّد نفسه، وواجهاته لا تحوّل في الاستعمال العادي؛ فالتحويل يُرفض خطأً معلنًا بدل اتباعه.
    return (deps.fetch ?? globalThis.fetch)(url.href, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
  };
}

/** يحذف المفتاح من نص (رسالة خطأ أو ردّ) إن ظهر فيه، احتياطًا: لا يظهر مفتاح في رسالة ولا سجل (AC-E9 (٤)). */
export function redactKey(text: string, key: string | null): string {
  return key && key.length >= 8 ? text.split(key).join('‹المفتاح›') : text;
}

/** حالة صلاحيتَي التحليل لمزوّد: مضيفه، وموافقة المحتوى المشتركة (null حيث لا يشترطها المتصفح). */
export interface HostPermissionState {
  readonly host: boolean;
  readonly content: boolean | null;
}

export const isGranted = (state: HostPermissionState): boolean => state.host && state.content !== false;

/**
 * صلاحية مضيف مزوّد الاختيارية، ومعها في Firefox موافقة جمع البيانات الاختيارية (websiteContent): تُطلبان معًا في نقرة واحدة؛ وتُسحب صلاحية المضيف
 * وحدها (فتخص مزوّدها) أو الموافقة وحدها (فتخص كل المزوّدين). وحالتهما من المتصفح في كل مرة.
 */
export class ProviderHostPermission {
  private readonly hostSet: PermissionsSet;
  private readonly contentSet: PermissionsSet | null;

  constructor(
    private readonly api: PermissionsApi,
    readonly origin: string,
    /** موافقات جمع البيانات المطلوبة معها (Firefox: websiteContent)؛ فارغة في عائلة Chromium. */
    readonly dataCollection: readonly string[] = [],
  ) {
    this.hostSet = { origins: [origin] };
    this.contentSet = dataCollection.length ? { data_collection: [...dataCollection] } : null;
  }

  async state(): Promise<HostPermissionState> {
    const [host, content] = await Promise.all([this.api.contains(this.hostSet), this.contentSet ? this.api.contains(this.contentSet) : Promise.resolve(null)]);
    return { host, content };
  }

  /** المضيف والموافقة معًا: ما يشترطه التحليل عند هذا المزوّد. */
  async has(): Promise<boolean> {
    return isGranted(await this.state());
  }

  /** يُستدعى متزامنًا من معالج نقر صريح قبل أي await (المتصفح يرفضه خارج فعل المستخدم): المضيف والموافقة في نافذة واحدة. */
  request(): Promise<boolean> {
    return this.api.request({ ...this.hostSet, ...(this.contentSet ?? {}) });
  }

  /** صلاحية المضيف وحدها لطلب لا يحمل محتوى (جلب قائمة النماذج واختبار النموذج، DEC-13 ن-5)؛ من معالج نقر قبل أي await، ولا تُطلب معها موافقة المحتوى. */
  requestHost(): Promise<boolean> {
    return this.api.request(this.hostSet);
  }

  /** يسحب صلاحية مضيف هذا المزوّد وحدها: يتوقف التحليل عنده وحده، وتبقى موافقة المحتوى ومضيفات غيره. */
  revoke(): Promise<boolean> {
    return this.api.remove(this.hostSet);
  }

  /** يسحب موافقة مشاركة محتوى المواقع (Firefox): يتوقف التحليل عند كل المزوّدين، وتبقى صلاحيات مضيفاتهم. */
  revokeContent(): Promise<boolean> {
    return this.contentSet ? this.api.remove(this.contentSet) : Promise.resolve(false);
  }

  subscribe(listener: () => void): () => void {
    const mentions = (set: PermissionsSet): boolean => (set.origins ?? []).includes(this.origin) || (set.data_collection ?? []).some((d) => this.dataCollection.includes(d));
    const changed = (set: PermissionsSet): void => {
      if (mentions(set)) listener();
    };
    this.api.onAdded?.addListener(changed);
    this.api.onRemoved?.addListener(changed);
    return () => {
      this.api.onAdded?.removeListener(changed);
      this.api.onRemoved?.removeListener(changed);
    };
  }
}
