// طبقة السياق المشتركة (T-11.2، F-E6، AD-22): جامع لكل نوع صفحة ← منقّح يمرّ عليه كل محتوى ← بانٍ يخرج بنية سياق واحدة. يستهلكها منشئ حزمة
// السياق وقوالبه (T-6.1 وT-6.2) وقوالب البرومبت (T-11.4)، ومن بعدها «نسخ البرومبت» (T-11.3) والتحليل (T-11.6)؛ ولا قسم يجمع أو ينقّح أو يبني لنفسه.
import type { PageState, SelectorEntry, SelectorsRegistry } from '../../../core';
import { COMPARE_SELECTORS } from '../../d/compare/extract';
import { JOB_PAGE_SELECTORS } from '../../d/log-parser/job-page';
import { PR_STATUS_SELECTORS } from '../../d/pr-status/extract';
import { buildContext } from './build';
import type { ContextOptions, ContextStructure } from './build';
import { CONTEXT_SELECTORS, collectContext, pageKind } from './collect';
import type { CollectExtras } from './collect';

export { CONTEXT_SELECTORS, blockText, collectContext, pageKind } from './collect';
export type { ChangedFile, Changes, CheckLine, CollectExtras, CommentInfo, ContextPageKind, ContextSource, Gap, GapKind, LogExtra, PrStatus, Snippet } from './collect';
export { readSelection } from './selection';
export { CONTEXT_LIMITS, ITEM, contextItems, limitsOf, maskOf, sanitize } from './sanitize';
export type { Limits, SanitizeOptions, SanitizedChanges, SanitizedContext, SanitizedLog, SecretHit, SecretPolicy, SecretsReport } from './sanitize';
export { PART_KEYS, buildContext, formatParts } from './build';
export type { ContextOptions, ContextParts, ContextStructure, PartKey, PartState } from './build';
export { GAPS_HEADING, PAGE_TEXT, fence, gapLine, gapsSection, partHeading, quote, sectionLines } from './format';
export type { Part } from './format';
export { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, defineContextSettings, isLineLimit } from './settings';

/** كل محددات الجامع: محدداته وقرّاء الوحدة (د) الذين يستدعيهم، لأي نوع صفحة. */
export const COLLECTOR_SELECTORS: readonly SelectorEntry[] = [...PR_STATUS_SELECTORS, ...JOB_PAGE_SELECTORS, ...COMPARE_SELECTORS, ...CONTEXT_SELECTORS];

/** الجمع ثم الطبقة في خطوة لنوع الصفحة المكتشف، أو null لصفحة لا سياق لها. الإضافات (سجل مقروء، قراءة API) اختيارية. */
export function prepareContext(doc: Document, selectors: SelectorsRegistry, page: PageState, options: ContextOptions & { readonly extras?: CollectExtras } = {}): ContextStructure | null {
  const kind = pageKind(page);
  return kind ? buildContext(collectContext(doc, selectors, page, kind, options.extras), options) : null;
}
