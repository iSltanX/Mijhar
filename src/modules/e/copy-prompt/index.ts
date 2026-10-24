// زر «نسخ البرومبت» (T-11.3، F-E7): وحدة e.copy-prompt وقسمها في الإعدادات. يستهلك طبقة السياق المشتركة (T-11.2) وقوالب البرومبت (T-11.4) وحدهما.
export { COPY_PROMPT_MODULE, COPY_PROMPT_MODULE_ID, createCopyPromptModule, promptFileName } from './module';
export type { CopyPromptOptions } from './module';
export { clipboardReason, copyText } from './clipboard';
export type { CopyFn, CopyOutcome } from './clipboard';
export { AUTO_TEMPLATE, DEFAULT_COPY_PROMPT_SETTINGS, TEMPLATE_DEFAULT, TEMPLATE_KEY, defineCopyPromptSettings, isTemplateChoice, storedCopyPromptSettings, templateFor } from './settings';
export type { CopyPromptSettings, TemplateChoice } from './settings';
export { CopyPromptView, MENU_FOOT, MENU_TITLE, STATE_LABEL, TEMPLATE_BLURB } from './view';
export type { CopyPromptViewProps, CopyState, DownloadState, PrivateNote } from './view';
export { COPY_PROMPT_CSS } from './style';
export { COPY_PROMPT_SECTION } from './section';
