export { MODULE_A_ID, PageOverrides, featureSettingKey, isFeatureSetting, normalizeRepo, pageIdentity, resolveScope } from './scope';
export type { FeatureSetting, ScopeDecision, ScopeKind, ScopeReason } from './scope';
export type { FeatureContext, FeatureText, ModuleAFeature } from './feature';
export { ModuleARuntime, READING_STYLES_ID } from './runtime';
export type { FeatureStopReason, FeatureStopReport, ModuleARuntimeOptions, SettingsReader } from './runtime';
export { MODULE_A, MODULE_A_FEATURES, MODULE_A_OVERRIDES, connectModuleA, createModuleA, defineModuleASettings } from './module';
export type { ModuleAOptions } from './module';
