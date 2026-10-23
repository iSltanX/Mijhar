// تعريف الوحدة (أ) في سجل الوحدات: تُركَّب في كل صفحات GitHub، وتركّب داخلها كل ميزة بحسب نطاقها (ModuleARuntime).
// ModuleContext في النواة لا يحمل الإعدادات، فتصل إلى الوحدة بالربط: يستدعي سكربت المحتوى defineModuleASettings على سجل
// الإعدادات قبل فتحه، ثم connectModuleA(settings) قبل تشغيل مدير دورة الحياة. وقبل الربط تعمل الميزات بافتراضياتها.
// ميزات بقية الوحدة (أ) (MJ7) تُضاف إلى MODULE_A_FEATURES أو تُمرَّر إلى createModuleA.
import type { ExtensionModule, JsonValue, SettingsRegistry } from '../../../core';
import { DIRECTION_FEATURE } from '../direction/feature';
import type { ModuleAFeature } from './feature';
import { ModuleARuntime } from './runtime';
import type { FeatureStopReport, SettingsReader } from './runtime';
import { MODULE_A_ID, PageOverrides, featureSettingKey, isFeatureSetting } from './scope';

export const MODULE_A_FEATURES: readonly ModuleAFeature[] = [DIRECTION_FEATURE];

export interface ModuleAOptions {
  /** قارئ الإعدادات وقت التركيب، أو null فتُستعمل الافتراضيات. */
  readonly settings?: () => SettingsReader | null;
  readonly overrides?: PageOverrides;
  readonly features?: readonly ModuleAFeature[];
  readonly onReport?: (report: FeatureStopReport) => void;
  readonly onError?: (featureId: string, error: unknown) => void;
  readonly now?: () => number;
}

export function createModuleA(options: ModuleAOptions = {}): ExtensionModule {
  const features = options.features ?? MODULE_A_FEATURES;
  const overrides = options.overrides ?? new PageOverrides();
  const ids = new Set<string>();
  for (const feature of features) {
    if (ids.has(feature.id)) throw new Error(`ميزة مكررة في الوحدة (أ): ${feature.id}`);
    ids.add(feature.id);
  }
  return {
    id: MODULE_A_ID,
    title: 'اتجاه عربي وقراءة مريحة',
    pages: '*',
    selectors: features.flatMap((feature) => feature.selectors ?? []),
    mount(ctx) {
      const runtime = new ModuleARuntime(ctx, {
        settings: options.settings?.() ?? null,
        overrides,
        features,
        ...(options.onReport ? { onReport: options.onReport } : {}),
        ...(options.onError ? { onError: options.onError } : {}),
        ...(options.now ? { now: options.now } : {}),
      });
      runtime.start();
    },
  };
}

/** يعرّف إعدادات الميزات (النطاق لكل ميزة، وإعداداتها الخاصة) في سجل الإعدادات. */
export function defineModuleASettings(registry: SettingsRegistry, features: readonly ModuleAFeature[] = MODULE_A_FEATURES): void {
  for (const feature of features) {
    registry.define({
      key: featureSettingKey(feature.id),
      default: feature.defaults as unknown as JsonValue,
      description: `نطاق «${feature.title}»: enabled، وscope (all أو repos)، وrepos بصيغة owner/repo`,
      validate: (value): value is JsonValue => isFeatureSetting(value),
    });
    for (const definition of feature.settings ?? []) registry.define(definition);
  }
}

let connected: SettingsReader | null = null;

/** تجاوزات «الصفحة الحالية مؤقتًا» للوحدة المسجَّلة؛ تكتبها واجهة الإعدادات أو اللوحة. */
export const MODULE_A_OVERRIDES = new PageOverrides();

/** يربط الوحدة المسجَّلة بسجل الإعدادات؛ يسري على التركيب التالي (يُستدعى قبل تشغيل مدير دورة الحياة). */
export function connectModuleA(settings: SettingsReader | null): void {
  connected = settings;
}

export const MODULE_A: ExtensionModule = createModuleA({ settings: () => connected, overrides: MODULE_A_OVERRIDES });
