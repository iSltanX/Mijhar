// واجهة النواة العامة. تضيف كل طبقة تصديرها هنا (ملف مشترك يُضم بترتيب الدمج).
export * from './detector';
export * from './lifecycle';
export { BUILTIN_MODULES, ModuleRegistry, createModuleRegistry, moduleMatchesPage } from './registry';
export type { ExtensionModule, ModuleContext } from './registry';
export * from './storage';
export * from './settings';
