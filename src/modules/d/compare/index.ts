export { COMPARE_MODULE, COMPARE_MODULE_ID, createCompareModule } from './module';
export type { CompareOptions } from './module';
export { COMPARE_KIND_LABELS, COMPARE_SELECTORS, inferCompareKind, parseCompareRefs, readCompare, readCompareFiles, tally } from './extract';
export type { Agreement, CompareFile, CompareKind, CompareSummary, KindTotals, Reconciliation } from './extract';
export { FILE_KINDS, FILE_KIND_LABELS, classifyFile, cleanPath } from './file-kinds';
export type { FileKind } from './file-kinds';
export { IMPACT_REVIEW_LABEL, buildImpactNotes } from './impact';
export type { ImpactNote } from './impact';
export { CompareFacts, CompareImpact } from './view';
