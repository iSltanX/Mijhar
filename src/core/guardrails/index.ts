// ضوابط الأمان التنفيذي (T-11.9، F-F7) وما يحرس مسار الإنجاز (T-11.8): نطاق الكتابة الوحيد، وبوابة طلبات الكتابة الثلاثة، وحدود المحتوى المنقول
// في البرومبت. بوابة الكتابة (write-gate.ts) تستوردها خدمة الخلفية بمسارها وحدها، فلا تصل شيفرتها سكربت المحتوى ولا اللوحة (فحص ساكن).
export { BOUNDARY_RULE, TRANSPORTED_CLOSE, TRANSPORTED_OPEN, bounded, neutralize } from './boundaries';
export { base64ToUtf8, lineEnding, toLf, utf8ToBase64, withEnding } from './text';
export type { LineEnding } from './text';
export {
  MAX_BODY,
  MAX_TEXT_CHARS,
  MAX_TEXT_LINES,
  MAX_TITLE,
  TEXT_EXTENSIONS,
  TEXT_NAMES,
  checkPlan,
  isBaseBranchName,
  isNewBranchName,
  isRepoSlug,
  isTextPath,
  pathProblem,
  textProblem,
  titleProblem,
} from './write-scope';
export type { PlanCheck, WritePlan } from './write-scope';
