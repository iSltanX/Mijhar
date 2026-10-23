// ميزة «الخطوط العربية وضبط الطباعة» (T-2.3، F-A3) في صفحة GitHub: كتلة أنماط واحدة في #mijhar-reading-styles (تُزال بإيقافها)
// فيها @font-face من حزمة الإضافة وقواعد الكتل العربية. تغيّر الإعداد يعيد تركيبها فتُستبدل الكتلة.
import type { SettingDefinition } from '../../../core';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ModuleAFeature } from '../scope/feature';
import { DEFAULT_TYPOGRAPHY, TYPOGRAPHY_KEY, isTypography, pageTypographyCss } from './fonts';
import type { Typography } from './fonts';

export const FONTS_FEATURE_ID = 'fonts';

const typographySetting: SettingDefinition<Typography & Record<string, string | number>> = {
  key: TYPOGRAPHY_KEY,
  default: { ...DEFAULT_TYPOGRAPHY },
  description: 'الطباعة العربية: family (plex أو cairo أو noto أو system)، وscale من 100 إلى 130، وlineHeight من 1.6 إلى 2.0، وspacing من 0.5 إلى 2.0',
  validate: (value): value is Typography & Record<string, string | number> => isTypography(value),
};

export interface FontsFeatureOptions {
  /** يحوّل مسار الحزمة إلى عنوان. الافتراضي runtime.getURL؛ وخارج سياق إضافة لا تُحمَّل خطوط (خط النظام). */
  readonly urlFor?: () => ((file: string) => string) | null;
}

const defaultUrlFor = (): ((file: string) => string) | null => {
  try {
    const api = extensionApi();
    return (file) => api.runtime.getURL(file);
  } catch {
    return null;
  }
};

export function createFontsFeature(options: FontsFeatureOptions = {}): ModuleAFeature {
  const getUrlFor = options.urlFor ?? defaultUrlFor;
  return {
    id: FONTS_FEATURE_ID,
    title: 'الخطوط العربية وضبط الطباعة',
    defaults: { enabled: true, scope: 'all', repos: [] },
    settings: [typographySetting as SettingDefinition],
    mount(ctx) {
      const stored = ctx.setting<Typography & Record<string, string | number>>(TYPOGRAPHY_KEY);
      const typography = isTypography(stored) ? stored : DEFAULT_TYPOGRAPHY;
      const urlFor = getUrlFor();
      ctx.styles.set(pageTypographyCss(urlFor ? typography : { ...typography, family: 'system' }, urlFor ?? ((file) => file)));
    },
  };
}

export const FONTS_FEATURE: ModuleAFeature = createFontsFeature();
