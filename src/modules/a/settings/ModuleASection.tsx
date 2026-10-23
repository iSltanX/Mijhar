// قسم الوحدة (أ) في تبويب «الإعدادات والخصوصية» (صفحة الإعدادات واللوحة الأصلية): لكل ميزة تشغيلها ونطاقها (كل GitHub أو
// مستودعات محددة، F-A7)، ثم إعدادات الخطوط والطباعة (T-2.3) بزر إعادة الافتراضي، والتلميح الهجري (T-2.6)، ووضع القراءة (T-2.5).
// كل تغيير يُحفظ في سجل الإعدادات فيسري في الصفحات المفتوحة دون إعادة تحميل. «الصفحة الحالية مؤقتًا» تجاوز في الصفحة نفسها.
import { useState } from 'preact/hooks';
import type { SettingsStore } from '../../../core/settings';
import type { JsonValue } from '../../../core/settings';
import { Toggle } from '../../../shared/ui/compat/Toggle';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSectionProps } from '../../../options/sections';
import { UNSUPPORTED_EDITORS } from '../editor/feature';
import { FONT_CHOICES, FONT_LABELS, TYPOGRAPHY_KEY, TYPOGRAPHY_LIMITS, DEFAULT_TYPOGRAPHY, isTypography } from '../fonts/fonts';
import type { Typography } from '../fonts/fonts';
import { DEFAULT_HIJRI_OPTIONS, HIJRI_OPTIONS_KEY, isHijriOptions } from '../hijri/hijri';
import type { HijriOptions } from '../hijri/hijri';
import { DEFAULT_READING_OPTIONS, READING_OPTIONS_KEY, isReadingOptions } from '../reading/options';
import type { ReadingOptions } from '../reading/options';
import { MODULE_A_FEATURES } from '../scope/module';
import { featureSettingKey, isFeatureSetting, normalizeRepo } from '../scope/scope';
import type { FeatureSetting } from '../scope/scope';
import type { ModuleAFeature } from '../scope/feature';

/** وصف قصير لكل ميزة تحت عنوانها. */
export const FEATURE_SUMMARIES: Readonly<Record<string, string>> = {
  direction: 'يضبط اتجاه الفقرات العربية والمختلطة حيث يعرضها GitHub من اليسار، ولا يقلب هيكل الصفحة.',
  isolation: 'يعزل الكود والمسارات والإصدارات و#123 و@الإشارات والروابط اللاتينية فلا ينعكس ترتيبها داخل السطر العربي، دون تغيير النص المنسوخ.',
  fonts: 'خط عربي مضمّن في الإضافة (لا يُحمَّل من الإنترنت) مع حجم الخط وارتفاع السطر وتباعد الفقرات للكتل العربية.',
  digits: 'يعرض الأرقام المشرقية (٠١٢٣) في النثر العربي وحده، ويبقي أرقام الكود والمعرّفات والإصدارات والتواريخ والنسب.',
  hijri: 'يعرض التاريخ الهجري في تلميح عند المرور على تاريخ في GitHub أو تركيزه، ولا يغيّر التاريخ نفسه.',
  'editor-toggle': 'زر في شريط أدوات المحرر يبدّل اتجاه الكتابة: من اليمين، ثم من اليسار، ثم تلقائي، دون تغيير النص أو المؤشر.',
  reading: 'زر يفتح محتوى الصفحة في عارض قراءة مستقل، مع خيار إخفاء التشكيل في العرض فقط. صفحة GitHub لا تتغير.',
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function useSaver(settings: SettingsStore): { error: string | null; save: (key: string, value: JsonValue) => void; reset: (key: string) => void } {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    save: (key, value) => {
      setError(null);
      settings.set(key, value).catch((e: unknown) => setError(`تعذّر الحفظ: ${describeError(e)}`));
    },
    reset: (key) => {
      setError(null);
      settings.reset(key).catch((e: unknown) => setError(`تعذّر الإعادة: ${describeError(e)}`));
    },
  };
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p class="notice" data-tone="danger" role="alert">
      {error}
    </p>
  ) : null;
}

function FeatureRow({ settings, feature }: { settings: SettingsStore; feature: ModuleAFeature }) {
  const key = featureSettingKey(feature.id);
  const stored = useSetting<FeatureSetting & Record<string, JsonValue>>(settings, key);
  const value: FeatureSetting = isFeatureSetting(stored) ? stored : feature.defaults;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const { error, save } = useSaver(settings);
  const id = `mj-a-${feature.id}`;
  const update = (next: Partial<FeatureSetting>): void => save(key, { ...value, ...next } as unknown as JsonValue);
  const saveRepos = (): void => {
    const entries = (draft ?? value.repos.join('\n')).split(/[\s,]+/).filter(Boolean);
    const bad = entries.filter((entry) => normalizeRepo(entry) === null);
    setInvalid(bad);
    if (bad.length) return;
    update({ repos: [...new Set(entries.map((entry) => normalizeRepo(entry) as string))] });
    setDraft(null);
  };
  return (
    <div class="feature" data-feature={feature.id}>
      <div class="toggle-row">
        <label class="label" for={id}>
          <strong>{feature.title}</strong>
          <span class="muted small">{FEATURE_SUMMARIES[feature.id] ?? ''}</span>
        </label>
        <Toggle id={id} checked={value.enabled} label={feature.title} onChange={(enabled) => update({ enabled })} />
      </div>
      {value.enabled && (
        <div class="scope" role="radiogroup" aria-label={`نطاق «${feature.title}»`}>
          <label class="choice">
            <input type="radio" name={`${id}-scope`} checked={value.scope === 'all'} onChange={() => update({ scope: 'all' })} />
            <span>كل صفحات GitHub</span>
          </label>
          <label class="choice">
            <input type="radio" name={`${id}-scope`} checked={value.scope === 'repos'} onChange={() => update({ scope: 'repos' })} />
            <span>مستودعات محددة فقط</span>
          </label>
          {value.scope === 'repos' && (
            <div class="repos">
              <label class="small muted" for={`${id}-repos`}>
                مستودع في كل سطر بصيغة <span class="ltr-inline mono">owner/repo</span>
              </label>
              <textarea
                id={`${id}-repos`}
                dir="ltr"
                rows={3}
                value={draft ?? value.repos.join('\n')}
                onInput={(event) => setDraft(event.currentTarget.value)}
                aria-invalid={invalid.length > 0}
              />
              <div class="row">
                <button type="button" class="btn" onClick={saveRepos}>
                  احفظ المستودعات
                </button>
              </div>
              {invalid.length > 0 && (
                <p class="notice" data-tone="danger" role="alert">
                  صيغة غير صالحة: <span class="ltr-inline mono">{invalid.join('، ')}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

const range = ({ min, max, step }: { min: number; max: number; step: number }): number[] => {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

function Select<T extends string | number>({ id, label, value, options, format, onChange }: { id: string; label: string; value: T; options: readonly T[]; format: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select
        id={id}
        value={String(value)}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          const next = options.find((option) => String(option) === raw);
          if (next !== undefined) onChange(next);
        }}
      >
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {format(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function TypographyGroup({ settings }: { settings: SettingsStore }) {
  const stored = useSetting<Typography & Record<string, JsonValue>>(settings, TYPOGRAPHY_KEY);
  const value = isTypography(stored) ? stored : DEFAULT_TYPOGRAPHY;
  const { error, save, reset } = useSaver(settings);
  const set = (next: Partial<Typography>): void => save(TYPOGRAPHY_KEY, { ...value, ...next } as unknown as JsonValue);
  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_TYPOGRAPHY);
  return (
    <fieldset class="group" data-group="typography">
      <legend>الخطوط والطباعة</legend>
      <div class="fields">
        <Select id="mj-a-font" label="الخط العربي" value={value.family} options={FONT_CHOICES} format={(v) => FONT_LABELS[v]} onChange={(family) => set({ family })} />
        <Select id="mj-a-scale" label="حجم الخط" value={value.scale} options={range(TYPOGRAPHY_LIMITS.scale)} format={(v) => `${v}%`} onChange={(scale) => set({ scale })} />
        <Select id="mj-a-line" label="ارتفاع السطر" value={value.lineHeight} options={range(TYPOGRAPHY_LIMITS.lineHeight)} format={(v) => v.toFixed(1)} onChange={(lineHeight) => set({ lineHeight })} />
        <Select id="mj-a-spacing" label="تباعد الفقرات" value={value.spacing} options={range(TYPOGRAPHY_LIMITS.spacing)} format={(v) => `×${v}`} onChange={(spacing) => set({ spacing })} />
      </div>
      <p class="muted small">الخطوط الثلاثة مرخّصة بـSIL Open Font License 1.1 ومضمّنة في الإضافة. تسري على الحروف العربية وحدها، والحجم وارتفاع السطر والتباعد على الكتل العربية.</p>
      <div class="row">
        <button type="button" class="btn" data-action="reset-typography" disabled={isDefault} onClick={() => reset(TYPOGRAPHY_KEY)}>
          أعد الافتراضي
        </button>
      </div>
      <ErrorNote error={error} />
    </fieldset>
  );
}

const OFFSETS = [-2, -1, 0, 1, 2] as const;

function HijriGroup({ settings }: { settings: SettingsStore }) {
  const stored = useSetting<HijriOptions & Record<string, JsonValue>>(settings, HIJRI_OPTIONS_KEY);
  const value = isHijriOptions(stored) ? stored : DEFAULT_HIJRI_OPTIONS;
  const { error, save } = useSaver(settings);
  const set = (next: Partial<HijriOptions>): void => save(HIJRI_OPTIONS_KEY, { ...value, ...next } as unknown as JsonValue);
  return (
    <fieldset class="group" data-group="hijri">
      <legend>التاريخ الهجري</legend>
      <div class="fields">
        <Select id="mj-a-hijri-offset" label="تعديل التاريخ" value={value.offset} options={OFFSETS} format={(v) => (v === 0 ? 'بلا تعديل' : `${v > 0 ? '+' : '−'}${Math.abs(v)} يوم`)} onChange={(offset) => set({ offset })} />
        <Select id="mj-a-hijri-numerals" label="أرقام التلميح" value={value.numerals} options={['latn', 'arab'] as const} format={(v) => (v === 'latn' ? '0123' : '٠١٢٣')} onChange={(numerals) => set({ numerals })} />
      </div>
      <p class="muted small">يُحسب بتقويم أم القرى في متصفحك؛ وإن لم يتوفر فيه أُعلن ذلك في التلميح.</p>
      <ErrorNote error={error} />
    </fieldset>
  );
}

function ReadingGroup({ settings }: { settings: SettingsStore }) {
  const stored = useSetting<ReadingOptions & Record<string, JsonValue>>(settings, READING_OPTIONS_KEY);
  const value = isReadingOptions(stored) ? stored : DEFAULT_READING_OPTIONS;
  const { error, save } = useSaver(settings);
  return (
    <fieldset class="group" data-group="reading">
      <legend>وضع القراءة</legend>
      <div class="toggle-row">
        <label class="label" for="mj-a-reading-hide">
          <strong>إخفاء التشكيل عند فتح العارض</strong>
          <span class="muted small">في العارض وحده. النسخ منه يحمل النص بتشكيله الأصلي.</span>
        </label>
        <Toggle id="mj-a-reading-hide" checked={value.hideDiacritics} label="إخفاء التشكيل عند فتح العارض" onChange={(hideDiacritics) => save(READING_OPTIONS_KEY, { hideDiacritics })} />
      </div>
      <ErrorNote error={error} />
    </fieldset>
  );
}

export const MODULE_A_SECTION_CSS = `
.mj-root .mj-a-settings { display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.mj-root .mj-a-settings .scope { padding: 0 var(--mijhar-space-12) var(--mijhar-space-8); }
.mj-root .mj-a-settings .repos { display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.mj-root .mj-a-settings textarea, .mj-root .mj-a-settings select { font: inherit; padding: var(--mijhar-space-4) var(--mijhar-space-6); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); }
.mj-root .mj-a-settings .group { border: 1px solid var(--mijhar-border-muted); border-radius: var(--mijhar-radius-12); padding: var(--mijhar-space-12); margin: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.mj-root .mj-a-settings legend { font-weight: 700; padding: 0 var(--mijhar-space-4); }
.mj-root .mj-a-settings .fields { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-12); }
.mj-root .mj-a-settings .field { display: flex; flex-direction: column; gap: var(--mijhar-space-4); min-width: 140px; }
`;

export function ModuleASection({ settings, unitEnabled }: SettingsSectionProps) {
  return (
    <div class="mj-a-settings">
      <style>{MODULE_A_SECTION_CSS}</style>
      {!unitEnabled && <p class="notice">الوحدة (أ) موقوفة الآن؛ هذه الإعدادات تسري حين تشغّلها من قسم «الوحدات».</p>}
      <div>
        {MODULE_A_FEATURES.map((feature) => (
          <FeatureRow key={feature.id} settings={settings} feature={feature} />
        ))}
      </div>
      <TypographyGroup settings={settings} />
      <HijriGroup settings={settings} />
      <ReadingGroup settings={settings} />
      <p class="muted small" data-unsupported-editors>
        لا يظهر زر الاتجاه في: {UNSUPPORTED_EDITORS.map((e) => `${e.editor} (${e.reason})`).join('؛ ')}
      </p>
    </div>
  );
}
