// منشئ حزمة السياق (T-6.1): الجمع من الصفحة، وتوليد الحزمة، ونافذة الاختيار والمعاينة، والوحدة.
export { BUILDER_SELECTORS, blockText, collectContext } from './collect';
export type { CheckLine, CommentInfo, ContextPageKind, ContextSource, Gap, GapKind } from './collect';
export { DEFAULT_LIMITS, GAPS_HEADING, ITEM, availableItems, buildBundle, fence, gapLine } from './build';
export type { BuiltBundle, Limits, Snippet } from './build';
export { BuilderPanel } from './view';
export type { BuilderPanelProps, CopyResult } from './view';
export { BUILDER_MODULE_ID, CONTEXT_BUILDER_MODULE, copyWithFallback, createContextBuilderModule } from './module';
export type { BuilderOptions } from './module';
