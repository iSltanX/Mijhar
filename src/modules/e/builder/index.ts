// منشئ حزمة السياق (T-6.1): الجمع من الصفحة، وتوليد الحزمة، ونافذة الاختيار والمعاينة، والوحدة.
export { BUILDER_SELECTORS, blockText, collectContext } from './collect';
export type { CheckLine, CommentInfo, ContextPageKind, ContextSource, Gap, GapKind } from './collect';
export { DEFAULT_LIMITS, GAPS_HEADING, ITEM, PAGE_TEXT, allGaps, availableItems, buildBundle, buildParts, fence, footerLines, gapLine, gapsSection, partHeading, sectionLines } from './build';
export type { BuiltBundle, BundleParts, Limits, Part, Snippet } from './build';
export { BuilderPanel } from './view';
export type { BuilderPanelProps, CopyResult, DownloadResult } from './view';
export { BUILDER_MODULE_ID, CONTEXT_BUILDER_MODULE, copyWithFallback, createContextBuilderModule, downloadMarkdown } from './module';
export type { BuilderOptions } from './module';
