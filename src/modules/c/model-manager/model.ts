// وصف حالة نموذج الترجمة المحلي كما يراها المستخدم (T-4.4، DEC-03 ج-2). الدالة نقية: تأخذ حالة الزوج en→ar كما يعلنها المتصفح (Translator.availability)
// أو null حين لا محرك، وتعيد ما يُعرض: الحالة والحجم والوجهة وشرط الاتصال والحذف. الحجم «غير معلن» دائمًا: المتصفح لا يعلنه والإضافة لا تقيسه،
// فلا يُعرض رقم من خارج ما يعلنه (AC-C5 في ج-2).
import { MODEL_MESSAGES } from './messages';

export type ModelState = 'no-engine' | 'unsupported' | 'not-downloaded' | 'downloading' | 'ready' | 'unknown';

export interface ModelInfo {
  readonly state: ModelState;
  readonly stateLabel: string;
  /** الحجم: «غير معلن من المتصفح» حين توجد حزمة يديرها المتصفح؛ لا رقم أبدًا. */
  readonly size: string;
  readonly destination: string;
  readonly connection: string;
  readonly deletion: string;
  /** هل قد يبدأ تنزيل عند أول ترجمة (تحتاج موافقة قبل ذلك). */
  readonly needsConsent: boolean;
}

const STATE_OF: Readonly<Record<string, ModelState>> = {
  unavailable: 'unsupported',
  downloadable: 'not-downloaded',
  downloading: 'downloading',
  available: 'ready',
};

export function modelStateOf(browserState: string | null): ModelState {
  if (browserState === null) return 'no-engine';
  return STATE_OF[browserState] ?? 'unknown';
}

export function describeModel(browserState: string | null): ModelInfo {
  const state = modelStateOf(browserState);
  const stateLabel = MODEL_MESSAGES.stateLabels[state];
  if (state === 'no-engine' || state === 'unsupported') {
    return { state, stateLabel, size: MODEL_MESSAGES.noPack, destination: MODEL_MESSAGES.noDestination, connection: MODEL_MESSAGES.connectionNone, deletion: MODEL_MESSAGES.noDeletion, needsConsent: false };
  }
  const downloads = state === 'not-downloaded' || state === 'downloading';
  return {
    state,
    stateLabel,
    size: MODEL_MESSAGES.sizeUnknown,
    destination: MODEL_MESSAGES.destination,
    connection: downloads ? MODEL_MESSAGES.connectionFirst : MODEL_MESSAGES.connectionNone,
    deletion: MODEL_MESSAGES.deletion,
    needsConsent: state === 'not-downloaded',
  };
}
