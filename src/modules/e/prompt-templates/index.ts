// قوالب البرومبت الخمسة (T-11.4): التعريفات والتوليد من بنية السياق المشتركة. يستهلكها «نسخ البرومبت» (T-11.3) والتحليل (T-11.6، T-11.7).
export { CLOSING_LINE, MISSING_HEADING, NOT_RECEIVED_LINE, PART_INVENTORY, PROMPTS, PROMPT_IDS, promptOf, sectionsFor } from './definitions';
export type { PromptDef, PromptId, PromptPart, PromptSection } from './definitions';
export { promptFor, promptHeadings, renderPrompt } from './render';
export type { BuiltPrompt } from './render';
