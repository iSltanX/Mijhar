// رمز GitHub الاختياري للقراءة (T-5.5): المخزن والصيغة والقسم في الإعدادات وفحوص Actions بالرمز.
export { FINE_GRAINED_PREFIX, READ_ACCESS_LEVEL, READ_PERMISSIONS, TOKEN_FORMAT_MESSAGES, TOKEN_LIMITS, checkTokenFormat } from './format';
export type { ReadPermission, TokenFormat } from './format';
export { TOKEN_DB_NAME, TOKEN_SESSION_KEY, TokenStore, TokenUnavailableError, extensionTokenStore, indexedDbArea, sessionArea } from './store';
export type { SecretArea, SessionStorageLike, TokenInfo, TokenPlace, TokenRecord, TokenStoreOptions } from './store';
export { ACTIONS_ONLY_NOTE, MAX_ACTIONS_RUNS, failedStep, readActionsChecks } from './actions-checks';
export type { ActionsChecks, ActionsResult } from './actions-checks';
