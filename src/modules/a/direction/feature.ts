// ميزة «اتجاه النص العربي والمختلط» (T-2.1، F-A1) داخل الوحدة (أ): تقلب الكتل حين تُركَّب، وتراقب ما يضيفه GitHub أو يغيّره بعدها،
// وكل أثرها (السمتان وكتلة الأنماط) يُزال بإيقافها عبر سجلها الخاص. عتبات الكشف إعداد قابل للضبط (modules.a.direction.options).
import type { SettingDefinition } from '../../../core';
import type { ModuleAFeature } from '../scope/feature';
import { DEFAULT_DIRECTION_OPTIONS, isDirectionOptions } from './decide';
import type { DirectionOptions } from './decide';
import { DIR_ATTR, DirectionProcessor, ORIG_DIR_ATTR } from './processor';
import { DIRECTION_SELECTORS } from './selectors';

export const DIRECTION_FEATURE_ID = 'direction';
export const DIRECTION_OPTIONS_KEY = 'modules.a.direction.options';

// direction وحده دون text-align: محاذاة الخلايا الموضوعة بـalign في Markdown تبقى (CSS المؤلف يتقدم على سمات العرض).
// القائمة المقلوبة كلها تعكس حشوتها؛ وخصوصيتها (0,2,1) تعلو .markdown-body ul في أنماط GitHub.
export const DIRECTION_CSS = [
  `[${DIR_ATTR}="rtl"]{direction:rtl}`,
  `:is(ul,ol)[${DIR_ATTR}="rtl"][${ORIG_DIR_ATTR}]{padding-inline-start:2em;padding-inline-end:0}`,
].join('\n');

const directionOptions: SettingDefinition<DirectionOptions & Record<string, number>> = {
  key: DIRECTION_OPTIONS_KEY,
  default: { ...DEFAULT_DIRECTION_OPTIONS },
  description: 'عتبات الكشف الموزون للاتجاه: strong وmixed وcontext نسب بين 0 و1، وminRun وlatinSentence أعداد كلمات',
  validate: (value): value is DirectionOptions & Record<string, number> => isDirectionOptions(value),
};

export const DIRECTION_FEATURE: ModuleAFeature = {
  id: DIRECTION_FEATURE_ID,
  title: 'اتجاه النص العربي والمختلط',
  defaults: { enabled: true, scope: 'all', repos: [] },
  settings: [directionOptions as SettingDefinition],
  selectors: DIRECTION_SELECTORS,
  mount(ctx) {
    const options = ctx.setting<DirectionOptions & Record<string, number>>(DIRECTION_OPTIONS_KEY);
    const processor = new DirectionProcessor(ctx, isDirectionOptions(options) ? options : DEFAULT_DIRECTION_OPTIONS);
    ctx.styles.set(DIRECTION_CSS);
    processor.scan(ctx.document);
    const body = ctx.document.body;
    if (body) ctx.observe(body, { childList: true, characterData: true, subtree: true }, (records) => processor.update(records));
  },
};
