// دقة حالة البيانات الموثَّقة (T-11.5): مصنّف حالات الوصول، وربط كل نتيجة بالمستودع والفرع والالتزام ووقت القراءة، وعرضهما.
export { ACCESS_LABEL, NOT_REQUESTED, UNKNOWN_TEXT, accessOf, accessText } from './access';
export type { AccessKind, AccessState } from './access';
export { FIELD_TEXT, compareBinding, shortSha } from './binding';
export type { BindingField, BindingMatch, ReadBinding } from './binding';
export { AccessReport, BindingLine, MismatchNotice, STATUS_CSS } from './view';
