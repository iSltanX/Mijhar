// منشئ حزمة السياق (T-6.1): توليد الحزمة من بنية طبقة السياق المشتركة، ونافذة الاختيار والمعاينة، والوحدة. الجمع والتنقيح والبناء في
// modules/e/context (T-11.2)؛ وتُصدَّر هنا أسماؤها التي كانت للمنشئ قبل النقل (ومنها BUILDER_SELECTORS) كما هي.
export { CONTEXT_SELECTORS as BUILDER_SELECTORS, GAPS_HEADING, ITEM, PAGE_TEXT, blockText, collectContext, fence, gapLine, gapsSection, partHeading, sectionLines } from '../context';
export type { CheckLine, CommentInfo, ContextPageKind, ContextSource, Gap, GapKind, Part, Snippet } from '../context';
export { DEFAULT_LIMITS, availableItems, buildBundle, bundleContext, footerLines } from './build';
export type { BuiltBundle, Limits } from './build';
export { BuilderPanel } from './view';
export type { BuilderPanelProps, CopyResult, DownloadResult } from './view';
export { BUILDER_MODULE_ID, CONTEXT_BUILDER_MODULE, copyWithFallback, createContextBuilderModule, downloadMarkdown } from './module';
export type { BuilderOptions } from './module';
