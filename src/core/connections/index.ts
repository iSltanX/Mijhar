// سجل الاتصالات والمفاتيح (T-11.1): التعريفات والصحة وعقد «ميزة تحتاج ربطًا» والرسائل. بلا واجهة ولا مفاتيح أسرار: مخزن الأسرار
// ومفاتيحه (secrets.ts وkeys.ts) والخدمة (service.ts) يُستوردان بمسارهما في الخلفية وصفحة الإعدادات وحدهما، فلا تصل شيفرتها سكربت
// المحتوى؛ والواجهة في ui/.
export { CONNECTIONS, CONNECTION_IDS, connectionById, isConnectionId } from './definitions';
export type { ConnectionDefinition, ConnectionId } from './definitions';
export { CONNECTED_FEATURES, dependentsOf, featureById, gate, isFeatureId } from './features';
export type { ConnectedFeature, FeatureId, Gate } from './features';
export { HEALTH_LABEL, HEALTH_STATES, HEALTH_TONE, acceptedPermissions, isLinked, repoOfPath, resolveStatus, verdictFromUsage, verdictFromVerification } from './health';
export type { ConnectionStatus, Health, HealthDetail, HealthRecord, HealthTone, RecordedHealth, UsageOptions, Verdict } from './health';
export { CONNECTIONS_CHANGED_MESSAGE, CONNECTIONS_MESSAGE, isConnectionsChanged, isConnectionsRequest, runtimeConnectionsPort } from './port';
export type { ConnectionsChangedMessage, ConnectionsOp, ConnectionsPort, ConnectionsRequest, PendingReturn } from './port';
