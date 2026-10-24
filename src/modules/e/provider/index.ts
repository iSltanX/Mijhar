// طبقة مزوّد التحليل (T-11.6، T-11.10، F-E9): ما يصل سكربت المحتوى وصفحات الإضافة. السجل الوصفي (catalog.ts) وحده لا المحوّلات: سجل المحوّلات
// (registry.ts) وخدمة الخلفية (service.ts) وبطاقة «مزوّد التحليل» (ProviderCard.tsx) تُستورد بمسارها في الخلفية وصفحة الإعدادات وحدهما، فلا تصل
// ترويسات المحوّلات ولا شيفرة الأسرار سكربت المحتوى ولا اللوحة (I-2).
export { PROVIDER_MESSAGE, isProviderRequest, runtimeProviderPort } from './port';
export type { AnalysisOutcome, AnalyzeInput, AnalyzeResponse, ProbeResponse, ProviderPort, ProviderRequest, ProviderStatus, ProviderSummary, VerifyResponse } from './port';
export { RESPONSE_SHAPE, prepareAnalysis, systemText } from './request';
export type { AnalysisSpec, ConsentSummary, PreparedAnalysis } from './request';
export { parseAnalysis } from './result';
export type { EvidenceQuote, Finding, ParsedAnalysis } from './result';
export { PROVIDER_DESCRIPTORS, checkKey, descriptorById, providerHosts, providerInfo, providerNames } from './catalog';
export { compatibleModels, defaultModel, isModelId, uncheckedModels } from './models';
export { PROVIDER_ID_KEY, PROVIDER_MODEL_KEY, defineProviderSettings, isProviderId, modelSettingKey } from './settings';
export type {
  AnalysisReply,
  AnalysisRequest,
  KeyFormat,
  ModelCompatibility,
  ModelsList,
  ProviderAdapter,
  ProviderCall,
  ProviderDescriptor,
  ProviderFailure,
  ProviderInfo,
  ProviderModel,
  ProviderPolicy,
  ProviderResult,
} from './types';
export { ConsentSheet } from './ui/ConsentSheet';
export type { ConsentDestination, ConsentSheetProps } from './ui/ConsentSheet';
export { CONSENT_CSS } from './ui/styles';
