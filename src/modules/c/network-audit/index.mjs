// تدقيق شبكة مسار الترجمة (T-4.5 / F-C6): السياسة والفحص الساكن والتصنيف الديناميكي. أداة قياس يستعملها scripts/network-audit.mjs وvitest؛ لا تُشحن مع الإضافة.
export { attachNetworkRecorder, browserWsUrl } from './capture.mjs';
export { auditWindow, classifyRequests, findLeaks, hostOf, isNetworkRequest, normalizeForSearch } from './dynamic.mjs';
export {
  ANALYSIS_PROVIDER_HOSTS,
  ALLOWED_MODEL_HOSTS,
  BROAD_HOST_PATTERNS,
  CLOUD_TRANSLATION_HOSTS,
  DECLARED_MANIFEST_HOSTS,
  hostCovers,
  hostMatches,
  NETWORK_API_PATTERNS,
  OTHER_ENGINE_PATTERNS,
  TRANSLATION_PATH_DIRS,
} from './policy.mjs';
export { auditBundle, auditManifest, auditSources, hostOfMatchPattern, hostsInText, stripComments } from './static.mjs';
