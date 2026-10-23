// الوحدة (ز): مرساة السطر الاحتمالية (T-8.3، F-G3) وصيغة الحفظ وفق DEC-05 (ز-1).
export { anchorStore, connectAnchors } from './context';
export { AnchorController, RECENT_MS, STATUS_OF, anchorLinks } from './controller';
export type { AnchorControllerDeps, AnchorView, UnanchoredReason } from './controller';
export { comparableLines, hashLine, makeFingerprint, newSalt, normalizeLine, pageLinesFrom, saltIdOf, sha256 } from './fingerprint';
export type { FingerprintOutcome, PageLines } from './fingerprint';
export { ANCHOR_SELECTORS, currentCommit, readCodeLines, readPageView, visibilityOf } from './page-view';
export type { PageView } from './page-view';
export { ANCHOR_PRIVACY_POINTS } from './privacy';
export { locate, reanchor } from './reanchor';
export type { MatchResult } from './reanchor';
export { AnchorStore } from './store';
export { ANCHOR_PREFIX, ANCHOR_SCHEMA_VERSION, MAX_ANCHOR_LINES, SALT_RECORD, anchorRecordName, branchUrl, isLineAnchor, permalinkUrl } from './types';
export type { Fingerprint, LineAnchor, NoFingerprintReason, Visibility } from './types';
export { AnchorStatusView } from './ui/AnchorStatusView';
