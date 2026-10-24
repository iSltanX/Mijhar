// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// خطّا هوية الواجهة مضمّنان (Cairo للعناوين، وAlmarai للنص): كانت الرموز تسمّيهما بالاسم وحده فيظهران حيث ثُبّتا على الجهاز فقط، وإلا
// خط النظام. يثبت هنا: الملفات في الحزمة بتراخيصها ومتحقق منها، والرموز تبدأ بالعائلتين المضمّنتين، والتسجيل بـFontFace في document.fonts
// (بلا عنصر أنماط في المستند) من نقطتي التركيب كلتيهما (صفحات الإضافة، وكل مضيف ظل في صفحة GitHub)، ومرة واحدة لكل مستند.
// الخط المرسوم فعلًا يُقاس في المتصفحات الأربعة (tests/shared/ui/browser/fonts-check.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createShadowHost } from '../../../src/core/ui-host/shadow';
import { EMBEDDED_FONTS } from '../../../src/modules/a/fonts';
import { installStyles } from '../../../src/options/page';
import { UI_FONTS, UI_FONT_DISPLAY, UI_FONT_TEXT, registerUiFonts } from '../../../src/shared/ui/fonts';
import { TOKENS_CSS } from '../../../src/shared/ui/tokens';
import { FONT_FILES, verifyFont } from '../../../scripts/fonts/verify.mjs';

// في بيئة jsdom يحلّ URL الخاص بها محل URL في Node، فلا يُستعمل tests/setup/paths هنا.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface FakeFace {
  readonly family: string;
  readonly source: string;
  readonly descriptors: FontFaceDescriptors;
}

/** FontFace وdocument.fonts وهميان (jsdom لا يحاكيهما)، وruntime.getURL. */
function installFakeFonts(doc: Document): FakeFace[] {
  const added: FakeFace[] = [];
  const view = doc.defaultView as unknown as Record<string, unknown>;
  view.FontFace = class {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: FontFaceDescriptors,
    ) {}
  };
  Object.defineProperty(doc, 'fonts', { configurable: true, value: { add: (face: FakeFace) => added.push(face) } });
  (globalThis as Record<string, unknown>).chrome = { runtime: { getURL: (file: string) => `chrome-extension://mijhar/${file}` } };
  return added;
}

afterEach(() => {
  delete (document.defaultView as unknown as Record<string, unknown>).FontFace;
  delete (document as unknown as Record<string, unknown>).fonts;
  delete (globalThis as Record<string, unknown>).chrome;
});

const firstFamily = (variable: string): string | undefined => new RegExp(`${variable}:\\s*"([^"]+)"`).exec(TOKENS_CSS)?.[1];

describe('ملفات خطّي الهوية في الحزمة', () => {
  it('Cairo للعناوين وAlmarai للنص، بوزني 400 و700 لكلٍّ، وكل ملف موجود في assets/fonts', () => {
    const byFamily = (family: string): string[] => UI_FONTS.filter((f) => f.family === family).map((f) => f.weight);
    expect(byFamily(UI_FONT_DISPLAY).sort()).toEqual(['400', '700']);
    expect(byFamily(UI_FONT_TEXT).sort()).toEqual(['400', '700']);
    expect(UI_FONTS.filter((f) => f.family === UI_FONT_DISPLAY).every((f) => /^fonts\/Cairo-/.test(f.file))).toBe(true);
    expect(UI_FONTS.filter((f) => f.family === UI_FONT_TEXT).every((f) => /^fonts\/Almarai-/.test(f.file))).toBe(true);
    for (const f of UI_FONTS) expect(fs.existsSync(path.join(ROOT, 'assets', f.file)), f.file).toBe(true);
  });

  it('كل ملف woff2 في assets/fonts في قائمة التحقق، وكل خط هوية OFL-1.1 بلا تحويل جداول ولا بيانات وصفية', () => {
    const shipped = fs.readdirSync(path.join(ROOT, 'assets/fonts')).filter((f) => f.endsWith('.woff2'));
    expect(FONT_FILES.map((f: { file: string }) => f.file).sort()).toEqual(shipped.sort());
    for (const font of UI_FONTS) {
      const entry = FONT_FILES.find((f: { file: string }) => `fonts/${f.file}` === font.file);
      expect(entry, font.file).toBeDefined();
      const result = verifyFont(entry);
      expect(result.problems, font.file).toEqual([]);
      expect(result.spdx).toBe('OFL-1.1');
      expect(result.transformedTables).toEqual([]);
      expect(result.woffMetadata).toBe(false);
    }
  });

  it('عائلتا الهوية بأسماء مميّزة لا تلتبس بخطوط القراءة في الوحدة (أ) (نطاقها عربي وحده) ولا بخط مثبت على الجهاز', () => {
    const reading = Object.values(EMBEDDED_FONTS).map((f) => f.family);
    for (const family of [UI_FONT_DISPLAY, UI_FONT_TEXT]) {
      expect(reading).not.toContain(family);
      expect(family).toMatch(/^Mijhar /);
    }
  });
});

describe('الرموز تبدأ بالعائلتين المضمّنتين', () => {
  it('--mijhar-font-display يبدأ بـCairo المضمّن و--mijhar-font-text بـAlmarai المضمّن، ثم الاسم المثبت ثم خطوط النظام', () => {
    expect(firstFamily('--mijhar-font-display')).toBe(UI_FONT_DISPLAY);
    expect(firstFamily('--mijhar-font-text')).toBe(UI_FONT_TEXT);
    expect(TOKENS_CSS).toMatch(/--mijhar-font-display:\s*"Mijhar UI Cairo", Cairo,/);
    expect(TOKENS_CSS).toMatch(/--mijhar-font-text:\s*"Mijhar UI Almarai", Almarai,/);
  });
});

describe('registerUiFonts', () => {
  it('يسجّل الأوجه الأربعة في document.fonts من عنوان الإضافة، بلا أي عنصر في المستند، ومرة واحدة لكل مستند', () => {
    const added = installFakeFonts(document);
    const before = document.querySelectorAll('style, link').length;
    expect(registerUiFonts(document)).toBe(4);
    expect(added.map((f) => [f.family, f.source, f.descriptors.weight, f.descriptors.style, f.descriptors.display])).toEqual(
      UI_FONTS.map((f) => [f.family, `url("chrome-extension://mijhar/${f.file}") format("woff2")`, f.weight, 'normal', 'swap']),
    );
    expect(document.querySelectorAll('style, link').length).toBe(before);
    expect(registerUiFonts(document)).toBe(0);
    expect(added).toHaveLength(4);
  });

  it('بلا FontFace أو بلا عنوان إضافة لا يرمي ولا يسجّل شيئًا (فيبقى الاسم المثبت ثم خط النظام)', () => {
    const doc = document.implementation.createHTMLDocument('x');
    expect(registerUiFonts(doc)).toBe(0);
    expect(registerUiFonts(doc, null)).toBe(0);
  });

  it('مضيف ظل في صفحة GitHub يسجّل الخطين في مستند الصفحة نفسه', () => {
    const doc = document.implementation.createHTMLDocument('github');
    Object.defineProperty(doc, 'defaultView', { configurable: true, value: document.defaultView });
    const added = installFakeFonts(doc);
    createShadowHost(doc, { name: 'a' });
    createShadowHost(doc, { name: 'b' });
    expect(added.map((f) => f.family)).toEqual(UI_FONTS.map((f) => f.family));
  });

  it('صفحات الإضافة (الإعدادات واللوحة والقارئ) تسجّل الخطين مع أنماطها', () => {
    const doc = document.implementation.createHTMLDocument('options');
    Object.defineProperty(doc, 'defaultView', { configurable: true, value: document.defaultView });
    const added = installFakeFonts(doc);
    installStyles(doc);
    expect(added.map((f) => f.family)).toEqual(UI_FONTS.map((f) => f.family));
    expect(doc.head.querySelector('style')?.textContent).toContain('--mijhar-font-text: "Mijhar UI Almarai"');
  });
});
