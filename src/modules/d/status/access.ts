// حالات الوصول إلى بيانات API (T-11.5، AC-D8، BLK-TOKEN-SCOPE وBLK-RATELIMIT-AUTH): لكل قراءة حالة بنصها الخاص لا تلتبس بالنجاح، على
// جدول إشارات evidence/T-0.5: 401 = رمز منتهٍ أو ملغى؛ 403 تسمّي ترويستها صلاحية = ناقص الصلاحية لهذه النقطة بعينها (وما لا يُتاح للرموز
// دقيقة الحبيبات أصلًا، Checks، غير متاح بالرمز لا نقص)؛ نفاد الحد = متجاوز الحد بموعد إعادة المحاولة من الترويسات؛ 404 = غير متاحة لهذا
// المستودع (خاص أو لا يشمله الرمز أو غير موجود: لا تميّزها GitHub)؛ ولم يُضغط الزر = لم تُطلب بعد. وكل ما لم يُقرأ «غير معروف».
import type { PublicApiResult } from '../../../core/api';
import { acceptedPermissions } from '../../../core/connections/health';
import { READ_PERMISSIONS } from '../token/format';

export const UNKNOWN_TEXT = 'غير معروف';

export type AccessKind = 'not-requested' | 'no-permission' | 'read' | 'expired' | 'insufficient' | 'rate-limited' | 'unavailable' | 'failed';

export interface AccessState {
  readonly kind: AccessKind;
  /** أُرسل الطلب بالرمز المحفوظ. */
  readonly authenticated: boolean;
  /** الصلاحية الناقصة باسمها في GitHub (insufficient)، أو ما لا يُتاح بالرمز (unavailable). */
  readonly permission?: string;
  /** لا يُرسل طلب قبله (ms)، من retry-after أو x-ratelimit-reset. */
  readonly retryAt?: number | null;
  readonly status?: number | null;
  /** السبب كما أعلنته الطبقة (منقّح من الرمز فيها). */
  readonly reason?: string;
}

export const ACCESS_LABEL: Readonly<Record<AccessKind, string>> = {
  'not-requested': 'لم تُطلب بعد',
  'no-permission': 'لم تُطلب: صلاحية api.github.com غير ممنوحة',
  read: 'قُرئت',
  expired: 'الرمز منتهٍ أو ملغى',
  insufficient: 'ينقص الرمزَ صلاحيةُ هذه البيانات',
  'rate-limited': 'تجاوز حد الطلبات',
  unavailable: 'غير متاحة لهذا المستودع',
  failed: 'تعذّرت القراءة',
};

const permissionName = (param: string): string => READ_PERMISSIONS.find((p) => p.param === param)?.name ?? param;
const FIXABLE = new Set(READ_PERMISSIONS.map((p) => p.param));

export const NOT_REQUESTED: AccessState = { kind: 'not-requested', authenticated: false };

/** حالة الوصول من نتيجة طلب واحد. */
export function accessOf(result: PublicApiResult<unknown>): AccessState {
  const authenticated = Boolean(result.authenticated);
  if (result.ok) return { kind: 'read', authenticated };
  const base = { authenticated, status: result.status, reason: result.message };
  switch (result.failure) {
    case 'permission':
      return { ...base, kind: 'no-permission' };
    case 'unauthorized':
      return { ...base, kind: 'expired' };
    case 'rate-limit':
      return { ...base, kind: 'rate-limited', retryAt: result.retryAt };
    case 'forbidden': {
      const accepted = authenticated ? acceptedPermissions(result.accepted) : [];
      const fixable = accepted.find((p) => FIXABLE.has(p));
      if (fixable) return { ...base, kind: 'insufficient', permission: permissionName(fixable) };
      if (accepted.length) return { ...base, kind: 'unavailable', permission: accepted.join('، '), reason: 'لا تتيح GitHub هذه الصلاحية للرموز دقيقة الحبيبات، فلا تُقرأ بالرمز' };
      return { ...base, kind: 'unavailable' };
    }
    case 'not-found':
      return { ...base, kind: 'unavailable', reason: authenticated ? 'غير موجود أو لا يشمله الرمز (404)' : 'غير موجود أو غير عام (404)؛ قد يكون المستودع خاصًا' };
    default:
      return { ...base, kind: 'failed' };
  }
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

/** جملة الحالة لجزء من البيانات («فحوص API»…). كل حالة غير «قُرئت» تعلن قيمه «غير معروف» ولا تَعِد بنجاح ولا خلو من المشكلات. */
export function accessText(part: string, access: AccessState): string {
  // بلفظ AC-D8: لا تُعرض نجاحًا ولا خلوًّا من المشكلات.
  const unknown = `قيمه ${UNKNOWN_TEXT}، ولا تُعدّ نجاحًا ولا خلوًّا من المشكلات`;
  switch (access.kind) {
    case 'read':
      return `${part}: قُرئت${access.authenticated ? ' بالرمز' : ''}.`;
    case 'not-requested':
      return `${part}: لم تُطلب بعد؛ ${unknown}.`;
    case 'no-permission':
      return `${part}: لم تُطلب لأن صلاحية api.github.com الاختيارية غير ممنوحة؛ ${unknown}.`;
    case 'expired':
      return `${part}: رفض GitHub الرمز (401): منتهٍ أو ملغى، ولم يُعَد الطلب بلا رمز؛ ${unknown}.`;
    case 'insufficient':
      return `${part}: ينقص الرمزَ ${access.permission ?? 'صلاحية'}: Read لهذه البيانات، فاستُبعدت؛ ${unknown}.`;
    case 'rate-limited':
      return `${part}: تجاوز حد الطلبات${access.authenticated ? ' الموثَّقة' : ''}${typeof access.retryAt === 'number' ? `؛ لا يُرسل طلب قبل ${clock(access.retryAt)}` : ''}؛ ${unknown}.`;
    case 'unavailable':
      return `${part}: غير متاحة لهذا المستودع${access.reason ? ` (${access.reason})` : ''}؛ ${unknown}.`;
    case 'failed':
      return `${part}: تعذّرت القراءة${access.reason ? ` (${access.reason})` : ''}؛ ${unknown}.`;
  }
}
