// الواجهة العامة لإدارة نموذج الترجمة (T-4.4 / F-C5، DEC-03 ج-2). يستهلكها سكربت المحتوى (installManagedTranslationEngine) وواجهة الترجمة (بطاقة الاستئذان)
// وصفحة الإعدادات (MODEL_SECTION).
export { consentCard } from './consent';
export type { ConsentCard } from './consent';
export { ConsentPanel } from './consent-panel';
export { CONSENT_CSS } from './consent-style';
export { classifyModelError } from './errors';
export type { ModelError, ModelErrorContext, ModelErrorKind } from './errors';
export { installManagedTranslationEngine } from './install';
export { DEFAULT_STALL_MS, ManagedTranslationEngine } from './managed-engine';
export type { ManagedEngineOptions } from './managed-engine';
export { CONSENT_MESSAGES, MODEL_MESSAGES } from './messages';
export { describeModel, modelStateOf } from './model';
export type { ModelInfo, ModelState } from './model';
export { MODEL_SECTION } from './section';
