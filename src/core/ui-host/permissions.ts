// تدفق صلاحية api.github.com الاختيارية (optional_host_permissions). يملكه تبويب «الإعدادات والخصوصية» وحده
// (T-1.4)، وتستعمله كل مهمة تحتاج api.github.com (T-5.2 وT-8.3 وT-9.5 وT-5.5) ولا تطلب صلاحية مضيف بنفسها.
//  - request() لا تُستدعى إلا من معالج نقر، وأول ما فيه: المتصفح يرفضها خارج فعل المستخدم (VER-05)، وFirefox يرفضها
//    بعد أي await. لذا لا await قبلها في أي مسار.
//  - fetchApiGithub() البوابة الوحيدة إلى api.github.com: تتحقق من الصلاحية قبل كل طلب، وبدونها ترمي ولا تُرسل شيئًا.
//  - حالة الصلاحية تُقرأ من المتصفح في كل مرة (contains) ولا تُخزَّن نسخةً قد تتقادم، وتتبع onAdded وonRemoved
//    فيظهر سحبها من إعدادات المتصفح أيضًا.
import type { PermissionsApi, PermissionsSet } from './browser-api';

export const API_GITHUB_HOST = 'api.github.com';
export const API_GITHUB_ORIGIN = `https://${API_GITHUB_HOST}/*`;
export const API_GITHUB_PERMISSION: PermissionsSet = { origins: [API_GITHUB_ORIGIN] };

export class PermissionNotGrantedError extends Error {
  readonly code = 'permission-not-granted';
  constructor(readonly origin: string) {
    super(`صلاحية ${origin} غير ممنوحة: امنحها من «الإعدادات والخصوصية» أولًا`);
    this.name = 'PermissionNotGrantedError';
  }
}

const mentionsApiGithub = (set: PermissionsSet): boolean => (set.origins ?? []).includes(API_GITHUB_ORIGIN);

export class ApiGithubPermission {
  constructor(private readonly api: PermissionsApi) {}

  has(): Promise<boolean> {
    return this.api.contains(API_GITHUB_PERMISSION);
  }

  /** يُستدعى متزامنًا من معالج نقر صريح. يعيد true إن مُنحت. */
  request(): Promise<boolean> {
    return this.api.request(API_GITHUB_PERMISSION);
  }

  /** يسحب الصلاحية. يعيد true إن سُحبت. */
  revoke(): Promise<boolean> {
    return this.api.remove(API_GITHUB_PERMISSION);
  }

  /** يُستدعى بالحالة الجديدة عند منحها أو سحبها من أي مكان (هذه الصفحة أو غيرها أو إعدادات المتصفح). */
  subscribe(listener: (granted: boolean) => void): () => void {
    const added = (set: PermissionsSet): void => {
      if (mentionsApiGithub(set)) listener(true);
    };
    const removed = (set: PermissionsSet): void => {
      if (mentionsApiGithub(set)) listener(false);
    };
    this.api.onAdded?.addListener(added);
    this.api.onRemoved?.addListener(removed);
    return () => {
      this.api.onAdded?.removeListener(added);
      this.api.onRemoved?.removeListener(removed);
    };
  }
}

export interface ApiFetchDeps {
  readonly permissions: PermissionsApi;
  readonly fetch?: typeof fetch;
}

/** طلب إلى api.github.com بعد التحقق من الصلاحية. عنوان خارج https://api.github.com خطأ برمجي. */
export async function fetchApiGithub(pathOrUrl: string, init: RequestInit | undefined, deps: ApiFetchDeps): Promise<Response> {
  const url = new URL(pathOrUrl, `https://${API_GITHUB_HOST}/`);
  if (url.protocol !== 'https:' || url.host !== API_GITHUB_HOST) throw new Error(`fetchApiGithub لا يقبل إلا https://${API_GITHUB_HOST}: ${url.href}`);
  if (!(await deps.permissions.contains(API_GITHUB_PERMISSION))) throw new PermissionNotGrantedError(API_GITHUB_ORIGIN);
  return (deps.fetch ?? globalThis.fetch)(url.href, init);
}
