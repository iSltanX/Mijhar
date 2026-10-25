// نصوص حالات الاتصال (AC-11.1 ‏(٢)): لكل حالة نصها الخاص، ولا يقول أيٌّ منها «سليم» إلا بعد قبول فعلي، ولا يَعِد بما لم يُتحقق.
import { connectionById } from './definitions';
import type { ConnectionId } from './definitions';
import type { ConnectionStatus } from './health';

const DAY = 86_400_000;

/** «2026-10-30 14:25 UTC». */
export const utcText = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export interface HealthTextOptions {
  readonly now: number;
  /** اسم صلاحية GitHub من معاملها (actions ← Actions). */
  readonly permissionName?: (param: string) => string;
  /** MJ23: اسم الخدمة الفعلية بدل وصفها العام (مزوّد التحليل المختار «Anthropic» بدل «المزوّد»). */
  readonly service?: string;
}

/** الجملة التي تشرح الحالة. */
export function healthText(id: ConnectionId, status: Pick<ConnectionStatus, 'health' | 'detail'>, options: HealthTextOptions): string {
  const { noun, service: generic } = connectionById(id);
  const service = options.service ?? generic;
  const d = status.detail;
  switch (status.health) {
    case 'none':
      return 'غير مربوط. الميزات الأساسية وحزمة السياق تعمل بدونه.';
    case 'unverified':
      return d.reason ?? `محفوظ ولم يُتحقق منه بعد؛ لا يُعدّ سليمًا قبل طلب تحقق.`;
    case 'healthy': {
      let text = `قبِل ${service} ${noun}`;
      if (typeof d.limit === 'number') {
        text += `: حد الطلبات الموثَّقة ${d.limit} في الساعة`;
        if (typeof d.remaining === 'number') text += ` (المتبقي ${d.remaining})`;
      }
      text += '.';
      if (typeof d.expiresAt === 'number') text += ` ينتهي في ${utcText(d.expiresAt)}${d.expiresAt - options.now < 7 * DAY ? ' — قريبًا؛ جدّده قبل انتهائه.' : '.'}`;
      return text;
    }
    case 'expired':
      return typeof d.expiresAt === 'number' && options.now >= d.expiresAt
        ? `انتهت مدة ${noun} في ${utcText(d.expiresAt)}. يتعطل ما يعتمد عليه وحده؛ امسحه واحفظ بدلًا منه.`
        : // L-5 (MJ26): رمز الرفض يختلف بين المزوّدين (Google ترفض المفتاح بـ400)، فلا يُكتب إلا لـGitHub؛ والمحوّل يلحق الرمز الفعلي برسالته.
          `رفض ${service} ${noun}${id === 'provider-key' ? '' : ' (401)'}: انتهت مدته أو أُلغي أو لم يعد صالحًا. يتعطل ما يعتمد عليه وحده، ولا تُرسل الطلبات بلا ${noun} ما دام محفوظًا؛ امسحه أو استبدله.`;
    case 'insufficient': {
      // MJ21: رفض مزوّد التحليل (403) بسببه المعلن، بلا صلاحية GitHub تُسمّى.
      if (!d.permission && d.reason) return `رفض ${service} الطلب (403): ${d.reason}. يتعطل ما يعتمد عليه وحده؛ راجع صلاحيات ${noun} لدى ${service} ثم تحقق.`;
      const name = d.permission ? `صلاحية ${options.permissionName?.(d.permission) ?? d.permission} (قراءة)` : 'صلاحية قراءة';
      return `ينقصه ${name}${d.where ? ` في المستودع ${d.where}` : ''}. تُستبعد هذه البيانات ويُعلَن ذلك حيث تُعرض؛ أضف الصلاحية من ${service} ثم تحقق.`;
    }
    case 'rate-limited':
      return `تجاوز حد الطلبات الموثَّقة${typeof d.retryAt === 'number' ? `؛ لا يُرسل طلب قبل ${utcText(d.retryAt)}` : ''}. ما لم يُقرأ يُعلَن «غير معروف» ولا يُعرض نجاحًا.`;
    case 'unavailable':
      return `تعذّر الوصول إلى ${service}${d.reason ? ` (${d.reason})` : ''}؛ لم يتغير شيء، أعد المحاولة.`;
  }
}
