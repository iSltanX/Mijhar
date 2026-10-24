// طبقة مزوّد التحليل (T-11.6، F-E9): ما يصل سكربت المحتوى وصفحات الإضافة. خدمة الخلفية (service.ts) وبطاقة المفتاح (KeySection.tsx) تُستوردان
// بمسارهما في الخلفية وصفحة الإعدادات وحدهما، فلا تصل شيفرة الأسرار سكربت المحتوى.
export { PROVIDER_MESSAGE, isProviderRequest, runtimeProviderPort } from './port';
export type { AnalysisOutcome, AnalyzeInput, AnalyzeResponse, ProviderInfo, ProviderPort, ProviderRequest, ProviderStatus, VerifyResponse } from './port';
export { RESPONSE_SHAPE, prepareAnalysis, systemText } from './request';
export type { AnalysisSpec, ConsentSummary, PreparedAnalysis } from './request';
export { parseAnalysis } from './result';
export type { EvidenceQuote, Finding, ParsedAnalysis } from './result';
export { PROVIDERS, createProviderRegistry, defaultModel, isModelId } from './registry';
export type { ProviderRegistry } from './registry';
export { PROVIDER_ID_KEY, PROVIDER_MODEL_KEY, defineProviderSettings, isProviderId } from './settings';
export type { AnalysisReply, AnalysisRequest, ModelsList, ProviderAdapter, ProviderCall, ProviderFailure, ProviderModel, ProviderResult } from './types';
export { ConsentSheet } from './ui/ConsentSheet';
export type { ConsentDestination, ConsentSheetProps } from './ui/ConsentSheet';
export { CONSENT_CSS } from './ui/styles';
