// دليل موارد التعلّم العربية وآلية التحديث والمراجعة المحلية (T-9.5، F-H5).
export { DEFAULT_MAX_CHECKS, checkResources } from './check';
export type { CheckOutcome, CheckReport } from './check';
export {
  RESOURCE_FORMAT,
  RESOURCE_SCHEMA_VERSION,
  RESOURCE_STATUSES,
  STATUS_LABELS,
  draftProblems,
  githubRepoOf,
  isResource,
  parseResourceFile,
  resourceProblems,
  urlProblem,
} from './model';
export type { Category, ParsedFile, Resource, ResourceDraft, ResourceFile, ResourceStatus } from './model';
export { RESOURCE_PREFIX, ResourceInputError, ResourceNotFoundError, ResourcesRepository, resourceRecordName } from './repository';
export type { ImportMode, ImportPreview } from './repository';
export { ResourcesView, createResourcesView } from './ResourcesView';
