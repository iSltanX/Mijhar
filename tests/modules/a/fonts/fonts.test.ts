// TEST-RTL-03 (AC-A3) على Node وjsdom: الخطوط الثلاثة في الحزمة بتراخيصها ونوع رخصتها OFL-1.1 من ملف كل خط وملف ترخيصه، وبيانات
// الخط كما هي عدا ضغط WOFF2 (لا تحويل جداول ولا بيانات وصفية)؛ وCSS الصفحة (عناوين الإضافة وحدها، unicode-range عربي، ضبط الكتل
// العربية) وإزالته بإيقاف الميزة؛ والقيم وحدودها وإعادتها إلى الافتراضي. تحميل الخطوط في صفحة GitHub حقيقية وسجل الشبكة وCSP
// (HYP-16) في tests/modules/a/browser/fonts-github.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LifecycleManager, MemoryStorageArea, ModuleRegistry, PageDetector, SettingsRegistry, SettingsStore, Store } from '../../../../src/core';
import { DIRECTION_FEATURE } from '../../../../src/modules/a/direction';
import {
  ARABIC_UNICODE_RANGE,
  DEFAULT_TYPOGRAPHY,
  EMBEDDED_FONTS,
  TYPOGRAPHY_KEY,
  createFontsFeature,
  isTypography,
  pageTypographyCss,
} from '../../../../src/modules/a/fonts';
import { READING_STYLES_ID, createModuleA, defineModuleASettings } from '../../../../src/modules/a/scope';
import { FONT_FILES, verifyFont } from '../../../../scripts/fonts/verify.mjs';
import { ROOT } from '../../../setup/paths';
import { loadFixture } from '../direction/helpers';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// خطوط القراءة وحدها؛ وخطّا هوية الواجهة في القائمة نفسها يتحقق منهما tests/shared/ui/fonts.test.ts.
const READING_FILES = FONT_FILES.filter((f: { font: string }) => f.font in EMBEDDED_FONTS);

describe('ملفات الخطوط وتراخيصها في الحزمة', () => {
  it('كل ملف في EMBEDDED_FONTS موجود في assets/fonts ومعه ترخيصه، وقائمة التحقق تغطيها كلها', () => {
    const files = Object.values(EMBEDDED_FONTS).flatMap((font) => font.files.map((f) => f.file));
    const licenses = Object.values(EMBEDDED_FONTS).map((font) => font.license.file);
    for (const file of [...files, ...licenses]) expect(fs.existsSync(path.join(ROOT, 'assets', file)), file).toBe(true);
    expect(READING_FILES.map((f: { file: string }) => `fonts/${f.file}`).sort()).toEqual([...files].sort());
  });

  it.each(READING_FILES.map((f: { file: string }) => [f.file, f]))('%s: OFL-1.1 من الخط وملفه، وصاحب الحقوق واحد، ولا تحويل ولا بيانات وصفية', (_file, entry) => {
    const result = verifyFont(entry);
    expect(result.problems).toEqual([]);
    expect(result.spdx).toBe('OFL-1.1');
    expect(result.transformedTables).toEqual([]);
    expect(result.woffMetadata).toBe(false);
    expect(EMBEDDED_FONTS[result.font as keyof typeof EMBEDDED_FONTS].license.spdx).toBe('OFL-1.1');
  });

  it('الاسم المحجوز Plex مسجَّل لخط IBM Plex وحده', () => {
    const reserved = Object.fromEntries(FONT_FILES.map((entry: { file: string }) => [entry.file, verifyFont(entry).reservedFontName]));
    expect(reserved['IBMPlexSansArabic-Regular.woff2']).toBe('Plex');
    expect(reserved['Cairo-Regular.woff2']).toBeNull();
    expect(reserved['NotoSansArabic-Variable.woff2']).toBeNull();
  });
});

describe('CSS الطباعة', () => {
  const urlFor = (file: string): string => `chrome-extension://mijhar/${file}`;

  it('@font-face من عنوان الإضافة وحدها بنطاق عربي، وقائمة خطوط GitHub بعده', () => {
    const css = pageTypographyCss(DEFAULT_TYPOGRAPHY, urlFor);
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls).toEqual(['chrome-extension://mijhar/fonts/IBMPlexSansArabic-Regular.woff2', 'chrome-extension://mijhar/fonts/IBMPlexSansArabic-Bold.woff2']);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
    expect(css).toContain(`unicode-range:${ARABIC_UNICODE_RANGE}`);
    expect(css).toContain('font-family:"Mijhar IBM Plex Sans Arabic", var(--fontStack-sansSerif');
    expect(css).toContain('line-height:1.8;letter-spacing:0');
  });

  it('خط النظام: بلا @font-face، ويبقى ضبط الكتل؛ والقيم تُطبَّق كما هي', () => {
    const css = pageTypographyCss({ family: 'system', scale: 115, lineHeight: 2, spacing: 1.5 }, urlFor);
    expect(css).not.toContain('@font-face');
    expect(css).toContain('font-size:calc(1em * 1.15);line-height:2');
    expect(css).toContain('calc(var(--base-size-16, 16px) * 1.5)');
  });

  it('حدود القيم وخطواتها', () => {
    expect(isTypography(DEFAULT_TYPOGRAPHY)).toBe(true);
    expect(isTypography({ family: 'noto', scale: 130, lineHeight: 1.6, spacing: 0.5 })).toBe(true);
    for (const bad of [{ ...DEFAULT_TYPOGRAPHY, scale: 131 }, { ...DEFAULT_TYPOGRAPHY, scale: 103 }, { ...DEFAULT_TYPOGRAPHY, lineHeight: 2.1 }, { ...DEFAULT_TYPOGRAPHY, family: 'arial' }, { ...DEFAULT_TYPOGRAPHY, spacing: 0.6 }, { ...DEFAULT_TYPOGRAPHY, extra: 1 }]) {
      expect(isTypography(bad)).toBe(false);
    }
  });
});

describe('الميزة في الصفحة: تُطبَّق وتُحفظ وتُعاد إلى الافتراضي', () => {
  it('تغيير الإعداد يعيد كتلة الأنماط بقيمه، وreset يعيد الافتراضي، والإيقاف يزيل الكتلة', async () => {
    const area = new MemoryStorageArea();
    const store = await Store.open({ area, changes: area });
    const fonts = createFontsFeature({ urlFor: () => (file) => `chrome-extension://mijhar/${file}` });
    const features = [DIRECTION_FEATURE, fonts];
    const registry = new SettingsRegistry();
    defineModuleASettings(registry, features);
    const settings = await SettingsStore.open(store, registry);
    const doc = loadFixture('https://github.com/octo/mijhar-demo').window.document;
    const manager = new LifecycleManager({
      registry: new ModuleRegistry([createModuleA({ settings: () => settings, features })]),
      detector: new PageDetector({ document: doc, settleMs: 5 }),
      document: doc,
      isEnabled: () => true,
    });
    manager.start();
    const styles = () => doc.getElementById(READING_STYLES_ID)?.textContent ?? '';
    expect(styles()).toContain('Mijhar IBM Plex Sans Arabic');
    await settings.set(TYPOGRAPHY_KEY, { family: 'cairo', scale: 120, lineHeight: 2, spacing: 1.25 });
    await deliver();
    expect(styles()).toContain('fonts/Cairo-Regular.woff2');
    expect(styles()).toContain('font-size:calc(1em * 1.2);line-height:2');
    expect(styles()).not.toContain('Plex');
    // محفوظ في المخزن نفسه: سجل جديد فوق المنطقة نفسها يقرأ القيمة.
    const reopened = await SettingsStore.open(await Store.open({ area, changes: area }), registry);
    expect(reopened.get(TYPOGRAPHY_KEY)).toEqual({ family: 'cairo', scale: 120, lineHeight: 2, spacing: 1.25 });
    await settings.reset(TYPOGRAPHY_KEY);
    await deliver();
    expect(settings.get(TYPOGRAPHY_KEY)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(styles()).toContain('Mijhar IBM Plex Sans Arabic');
    manager.stop();
    expect(doc.getElementById(READING_STYLES_ID)).toBeNull();
  });
});
