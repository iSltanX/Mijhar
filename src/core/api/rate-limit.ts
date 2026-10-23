// حدود طلبات api.github.com كما تعلنها ترويسات x-ratelimit-* في كل استجابة (evidence/T-0.3، AC-S3.4): تُقرأ ولا تُفترض أرقامها.
// عند remaining = 0 تتوقف الطلبات حتى reset دون إرسال شيء؛ فلا ترويسة retry-after في نفاد الحد الأساسي (مقيس في T-0.3).
// وردّ الحد (429، أو 403 بنفاد) بموعد إعادة (retry-after أو reset) يضع مهلة للمورد يحترمها كل طلب بعده حتى انقضائها (VR-07).

export interface RateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly used: number | null;
  /** وقت تجدد الحد بالثواني منذ epoch كما في الترويسة. */
  readonly reset: number | null;
  readonly resource: string;
  /** متى قُرئت الترويسات (ms). */
  readonly readAt: number;
}

const int = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
};

/** يقرأ ترويسات الحد، أو null حين لا تحملها الاستجابة. */
export function readRateLimit(headers: Pick<Headers, 'get'>, now: number): RateLimit | null {
  const limit = int(headers.get('x-ratelimit-limit'));
  const remaining = int(headers.get('x-ratelimit-remaining'));
  if (limit === null && remaining === null) return null;
  return {
    limit,
    remaining,
    used: int(headers.get('x-ratelimit-used')),
    reset: int(headers.get('x-ratelimit-reset')),
    resource: headers.get('x-ratelimit-resource')?.trim() || 'core',
    readAt: now,
  };
}

/** آخر حدّ معلن لكل مورد (core وsearch…)، ومنع الإرسال حتى reset حين يبلغ الصفر. */
export class RateLimitTracker {
  private readonly latest = new Map<string, RateLimit>();
  private readonly cooldowns = new Map<string, number>();

  update(rate: RateLimit | null): void {
    if (!rate) return;
    const previous = this.latest.get(rate.resource);
    if (!previous || previous.readAt <= rate.readAt) this.latest.set(rate.resource, rate);
  }

  snapshot(resource = 'core'): RateLimit | null {
    return this.latest.get(resource) ?? null;
  }

  /** مهلة لا يُرسل قبلها طلب للمورد (ms)، كما أعلنتها retry-after. تبقى الأبعد إن تكررت. */
  cooldown(resource: string, until: number): void {
    if (until > (this.cooldowns.get(resource) ?? 0)) this.cooldowns.set(resource, until);
  }

  /** أبعد الموعدين إن كان أحدهما قائمًا الآن: انقضاء المهلة، وتجدد الحد النافد؛ وإلا null. */
  blockedUntil(resource: string, now: number): number | null {
    const rate = this.latest.get(resource);
    const reset = rate && rate.remaining === 0 && rate.reset !== null ? rate.reset * 1000 : 0;
    const until = Math.max(this.cooldowns.get(resource) ?? 0, reset);
    return until > now ? until : null;
  }
}
