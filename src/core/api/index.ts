// طبقة GitHub REST العامة (T-5.2): العميل في الخلفية وصفحات الإضافة، والمنفذ لسكربت المحتوى.
export { API_VERSION, PublicApiClient, isPublicPath } from './client';
export type { PagedResult, PublicApiClientOptions, PublicApiError, PublicApiFailure, PublicApiResult, PublicApiSuccess } from './client';
export { PUBLIC_API_MESSAGE, directPort, handlePublicApiRequest, isPublicApiRequest, pickPage, runtimePort } from './port';
export type { PagedKey, PublicApiPort, PublicApiRequest, PublicApiStatus } from './port';
export { RateLimitTracker, readRateLimit } from './rate-limit';
export type { RateLimit } from './rate-limit';
