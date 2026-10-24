// الوحدة (و): مسار الإنجاز التدريجي (T-11.8، F-F6): ما تصل إليه اللوحة. خدمة الخلفية (service.ts) وبطاقة رمز الكتابة (WriteTokenSection.tsx)
// تُستوردان بمسارهما في الخلفية وصفحة الإعدادات وحدهما، فلا تصل شيفرتهما اللوحة ولا سكربت المحتوى.
export { CONTEXT_LINES, NO_EOL_MARK, diffLines, fileDiff, unifiedDiff } from './diff';
export type { DiffLine, FileDiff, Hunk } from './diff';
export { DiffBlock } from './DiffBlock';
export { ExecutionPath } from './ExecutionPath';
export type { ExecutionDeps, PathPage } from './ExecutionPath';
export { EXECUTION_MESSAGE, isExecutionRequest, notRun, runtimeExecutionPort } from './port';
export type { ExecutionPort, ExecutionRequest, RunOutcome, WriteStatus } from './port';
export { DEFAULT_PATH, bodyFor, branchFor, planOf, proposalFor, titleFor } from './proposal';
export type { Proposal } from './proposal';
export { prepare, readBase, readFile, readRepo } from './read';
export type { BaseInfo, FileInfo, Prepared, ReadResult, RepoInfo } from './read';
export { EXECUTION_PANEL_VIEWS, ExecutionView, createExecutionView, defaultExecutionDeps } from './view';
