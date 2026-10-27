// التصنيفات السبعة للفحوص (F-D2) وجدول ربط الحالات الذي أنتجته T-0.3 (evidence/T-0.3/report.md «AC-S3.1»).
// التصنيفات السبعة تصنيف الواجهة في الخطة وليست قائمة حالات رسمية من GitHub. كل قيمة status وconclusion موثقة (VER-07) وكل حالة
// commit status قديمة تُربط بتصنيف؛ وما لم يُعرف أو غاب يصير «غير معروف» ولا يُهمل.
// عمود verified من التقرير: true = رُصدت في المجموعة المرجعية (12 PR على مستودعات عامة)، وfalse = رُبطت من التوثيق وتحتاج تحققًا عند ظهورها.

export const CHECK_CATEGORIES = ['success', 'failure', 'running', 'skipped', 'cancelled', 'not-run', 'unknown'] as const;
export type CheckCategory = (typeof CHECK_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<CheckCategory, string>> = {
  success: 'ناجح',
  failure: 'فاشل',
  running: 'قيد التشغيل',
  skipped: 'متجاوز',
  cancelled: 'ملغى',
  'not-run': 'لم يُشغَّل',
  unknown: 'غير معروف',
};

export interface Classification {
  readonly category: CheckCategory;
  /** القيمة كما وردت (أو «غائب» حين لم تَرِد). */
  readonly raw: string;
  /** هل رُصدت هذه القيمة في المجموعة المرجعية، أم رُبطت من التوثيق فقط. */
  readonly verified: boolean;
  /** وسم إضافي يحفظ ما يضيع في التصنيف (محايد، يحتاج إجراءً بشريًا…). */
  readonly note?: string;
}

interface Row {
  readonly category: CheckCategory;
  readonly verified: boolean;
  readonly note?: string;
}

/** check run — status لم تكتمل بعد (completed تُقرأ من conclusion). */
export const CHECK_RUN_STATUS: Readonly<Record<string, Row>> = {
  in_progress: { category: 'running', verified: true },
  queued: { category: 'running', verified: false },
  requested: { category: 'running', verified: false },
  waiting: { category: 'running', verified: false },
  pending: { category: 'running', verified: false },
};

/** check run — conclusion بعد status = completed. */
export const CHECK_RUN_CONCLUSION: Readonly<Record<string, Row>> = {
  success: { category: 'success', verified: true },
  // DOM لا يميّزه عن النجاح (الرمز نفسه)، ويعدّه ملخص status-details بين الناجحة؛ فهو «ناجح» بوسم «محايد» (T-0.3).
  neutral: { category: 'success', verified: true, note: 'محايد' },
  failure: { category: 'failure', verified: true },
  skipped: { category: 'skipped', verified: true },
  cancelled: { category: 'cancelled', verified: true },
  timed_out: { category: 'failure', verified: false, note: 'انتهت مهلته' },
  startup_failure: { category: 'failure', verified: false, note: 'فشل عند البدء' },
  action_required: { category: 'not-run', verified: false, note: 'يحتاج إجراءً بشريًا' },
  stale: { category: 'unknown', verified: false, note: 'لم تُعرف نتيجته' },
};

/** commit status القديمة — state. */
export const COMMIT_STATUS_STATE: Readonly<Record<string, Row>> = {
  success: { category: 'success', verified: true },
  failure: { category: 'failure', verified: true },
  error: { category: 'failure', verified: true, note: 'خطأ' },
  pending: { category: 'running', verified: false },
};

export const DOCUMENTED_CHECK_RUN_STATUSES = ['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending'] as const;
export const DOCUMENTED_CHECK_RUN_CONCLUSIONS = ['action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'startup_failure'] as const;
export const DOCUMENTED_COMMIT_STATUS_STATES = ['error', 'failure', 'pending', 'success'] as const;

const norm = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const rawOf = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || 'غائب';
};
const unknown = (raw: string, note?: string): Classification => ({ category: 'unknown', raw, verified: false, ...(note ? { note } : {}) });
const from = (row: Row, raw: string): Classification => ({ category: row.category, raw, verified: row.verified, ...(row.note ? { note: row.note } : {}) });

/** يصنّف check run بقيمتي status وconclusion كما تعيدهما API. status غير completed يحسم التصنيف؛ وcompleted يحسمه conclusion. */
export function classifyCheckRun(run: { readonly status?: unknown; readonly conclusion?: unknown }): Classification {
  const status = norm(run.status);
  const conclusion = norm(run.conclusion);
  if (status === 'completed') {
    if (!conclusion) return unknown('completed', 'اكتمل بلا نتيجة');
    const row = CHECK_RUN_CONCLUSION[conclusion];
    return row ? from(row, conclusion) : unknown(conclusion, 'نتيجة غير موثقة');
  }
  if (status) {
    const row = CHECK_RUN_STATUS[status];
    return row ? from(row, status) : unknown(status, 'حالة غير موثقة');
  }
  return unknown('غائب', 'لا status');
}

/** يصنّف حالة commit status القديمة (state). */
export function classifyCommitStatus(state: unknown): Classification {
  const key = norm(state);
  const row = key ? COMMIT_STATUS_STATE[key] : undefined;
  return row ? from(row, key) : unknown(rawOf(state), key ? 'حالة غير موثقة' : 'لا state');
}

// ---- ما يظهر في DOM ----

export interface DomCheckSignal {
  /** فئات svg الرمز (octicon-check color-fg-success…). */
  readonly iconClass?: string | null;
  /** aria-label على الرمز («This job succeeded»…). */
  readonly label?: string | null;
  /** الوصف النصي في status-details («Successful in 2m»، «Failing after 4m»…). */
  readonly description?: string | null;
}

const has = (text: string, ...needles: string[]): boolean => needles.some((n) => text.includes(n));

/** عدّادات أداة الاختبار في الوصف («12 passed, 0 failed, 2 skipped»): تصف مخرجات الأداة لا حالة الفحص، فلا تُقرأ حالةً (GEMINI-003). */
const TOOL_COUNTS = /\b\d+\s+(?:passed|failed|failing|failures?|errors?|errored|skipped|cancell?ed|succeeded|successful|warnings?|tests?|pending|todo)\b/g;

/**
 * يصنّف فحصًا من رمزه ونصه في DOM (جدول الربط في T-0.3: ما يظهر في DOM بلا تسجيل دخول). DOM لا يميّز neutral عن success،
 * ولا يعرض timed_out/action_required/stale بشكل رُصد، فتظهر ضمن «غير معروف» أو ما يطابقها نصًّا فقط.
 * الأولوية (GEMINI-003): رمز الحالة ثم وسمه (aria-label) يحسمان؛ ونص الوصف لا يُقرأ إلا إن لم يحسماها، وبعد إسقاط عدّادات الأدوات منه،
 * فلا يصير فحص ناجح فاشلًا لأن وصفه «0 failed» أو متخطّى لأن فيه «2 skipped».
 */
export function classifyDomCheck(signal: DomCheckSignal): Classification {
  const icon = (signal.iconClass ?? '').toLowerCase();
  const label = norm(signal.label);
  const text = norm(signal.description);
  const raw = [icon && icon.split(/\s+/).find((c) => c.startsWith('octicon-')), signal.label?.trim()].filter(Boolean).join(' · ') || 'غائب';

  // «Expected — Waiting for status to be reported»: فحص إلزامي منتظر لم يُبلَّغ بعد (DOM المسجَّل فقط، octicon-dot-fill).
  if (has(text, 'expected') && has(text, 'waiting for status')) return { category: 'not-run', raw, verified: true, note: 'منتظر الإبلاغ' };

  // ١) الرمز.
  if (has(icon, 'anim-rotate') || has(icon, 'spinner')) return { category: 'running', raw, verified: true };
  if (has(icon, 'octicon-skip')) return { category: 'skipped', raw, verified: true };
  if (has(icon, 'octicon-stop')) return { category: 'cancelled', raw, verified: true };
  if (has(icon, 'octicon-x')) return { category: 'failure', raw, verified: true };
  if (has(icon, 'octicon-check')) return { category: 'success', raw, verified: true };
  // ٢) وسم الرمز.
  if (has(label, 'in progress')) return { category: 'running', raw, verified: true };
  if (has(label, 'skipped')) return { category: 'skipped', raw, verified: true };
  if (has(label, 'cancelled', 'canceled')) return { category: 'cancelled', raw, verified: true };
  if (has(label, 'failed', 'failing', 'error')) return { category: 'failure', raw, verified: true };
  if (has(label, 'succeeded', 'passed', 'successful')) return { category: 'success', raw, verified: true };
  // ٣) نص الوصف بلا عدّادات الأدوات.
  const status = text.replace(TOOL_COUNTS, ' ');
  if (/^in progress\b/.test(status) || has(status, 'queued', 'awaiting approval', 'waiting')) return { category: 'running', raw, verified: false };
  if (/\bskipped\b/.test(status)) return { category: 'skipped', raw, verified: true };
  if (/\bcancell?ed\b/.test(status)) return { category: 'cancelled', raw, verified: true };
  if (/\b(failing|failed|errored)\b/.test(status)) return { category: 'failure', raw, verified: true };
  if (/\b(successful|succeeded|passed)\b/.test(status)) return { category: 'success', raw, verified: true };
  if (has(icon, 'dot-fill') || has(icon, 'pending')) return { category: 'running', raw, verified: false, note: 'في الانتظار' };
  return { category: 'unknown', raw, verified: false };
}

export type CategoryCounts = Readonly<Record<CheckCategory, number>>;

export function emptyCounts(): Record<CheckCategory, number> {
  return { success: 0, failure: 0, running: 0, skipped: 0, cancelled: 0, 'not-run': 0, unknown: 0 };
}

export function countCategories(items: Iterable<{ readonly category: CheckCategory }>): CategoryCounts {
  const counts = emptyCounts();
  for (const item of items) counts[item.category] += 1;
  return counts;
}
