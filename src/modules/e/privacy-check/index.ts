// لافتة البيانات الخاصة والفاحص التحذيري غير الجازم (T-6.3): القائمة المعرّفة والفحص ولافتة الواجهة وإخلاء المسؤولية.
export { SECRET_PATTERNS, findingView, scanText } from './scan';
export type { Finding, FindingView, SecretPattern } from './scan';
export { MAX_SHOWN_FINDINGS, PRIVACY_BANNER, PRIVACY_DISCLAIMER, PrivacyCheck } from './view';
export type { PrivacyCheckProps } from './view';
export { PRIVACY_CSS } from './style';
