// الوحدة (و): حارس «القالب أولًا» (T-7.2، F-F2): Issue Forms وقوالب Markdown والهيكل غير المعروف.
export { conceptOf } from './concepts';
export { applyEdits, undoGroup } from './apply';
export type { GroupUndo } from './apply';
export { NO_TEMPLATE, detectTemplate } from './detect';
export type { TemplateInfo } from './detect';
export { analyzeForm } from './form';
export type { FormAnalysis, FormControlType, FormFieldInfo } from './form';
export { applicationOrder, applyToString, isMarkdownTemplate, mapHeadings, parseMarkdownTemplate, planFill, preservesOriginal, simulateInsert } from './markdown';
export type { FillEdit, FillOptions, FillPlan, ParsedTemplate, TemplateHeading } from './markdown';
export { buildOutput, formatForField, isEmptyOutput, previewText } from './output';
export type { Output, OutputInput } from './output';
export { IssueFormGuide, MarkdownTemplateNotice, UnknownTemplateNotice } from './panel';
