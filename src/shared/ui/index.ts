// مكوّنات Preact الأساسية المشتركة بين اللوحة الجانبية والدرج وصفحة الإعدادات وواجهات الوحدات.
export { BASE_CSS, COMPONENTS_CSS, TOKENS_CSS } from './tokens';
export { Tabs } from './Tabs';
export type { TabItem, TabsProps } from './Tabs';
export { Toggle } from './compat/Toggle';
export { Ltr } from './compat/Ltr';
export { isTrustedActivation } from './user-activation';
export { useOnVisible } from './useOnVisible';
