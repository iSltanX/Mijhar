// TEST-COMM-06 (AC-H6) — الفحص الآلي للشيفرة والنصوص: لا مسار في src/modules/h يستنتج جنسية أو هوية أو لغة أم من اسم أو اسم مستخدم
// أو لغة أو موقع. نتيجته «لم يُوجد» ولا تُدّعى به براءة مطلقة؛ وتكمله مراجعة بشرية للشيفرة (موثقة في تقرير التسليم).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const H = path.join(ROOT, 'src/modules/h');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** يحذف التعليقات (كتلية وسطرية خارج النصوص) فيبقى الكود والنصوص المعروضة. */
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

const FILES = walk(H).map((file) => ({ file, rel: path.relative(ROOT, file), code: stripComments(fs.readFileSync(file, 'utf8')) }));
const NOTICES = 'src/modules/h/discovery/notices.ts';

/** مفردات الاستنتاج في الشيفرة (إنجليزية): معرّفات ودوال ونصوص. */
const CODE_VOCABULARY = /nationalit|ethnic|\brace\b|mother[-_ ]?tongue|native[-_ ]?lang|citizen|demonym|infer(red)?(Country|Origin|Identity|Language|Nationality)|guess(Country|Origin|Identity|Nationality)|countryFrom|originFrom|fromName|nameToCountry|isArab(?!ic)|looksArab|arabPerson|identity(Tag|Label)/i;
/** مفردات الاستنتاج في النصوص المعروضة (عربية). */
// النسبة إلى بلد (سعودي، مصري…) مفردة كاملة لا جزء اسم مكان (السعودية).
const TEXT_VOCABULARY = /جنسية|عرق|لغة أم|اللغة الأم|ينحدر|أصول|عربي الأصل|(?<![\p{L}])(?:سعودي|مصري|إماراتي|شامي|مغربي)(?![\p{L}])/u;

describe('مسح الشيفرة والنصوص', () => {
  it('الملفات الممسوحة غير فارغة وتشمل كل ميزات الوحدة', () => {
    expect(FILES.length).toBeGreaterThan(30);
    for (const part of ['discovery/declared.ts', 'discovery/content.ts', 'discovery/profile-dom.ts', 'readme-detector/detect.ts', 'first-contribution/parse.ts', 'resources/model.ts', 'module.tsx']) {
      expect(FILES.some((f) => f.rel.endsWith(part)), part).toBe(true);
    }
  });

  it('لا مفردات استنتاج في الشيفرة (معرّفات ودوال وثوابت)', () => {
    const hits = FILES.flatMap((f) => (CODE_VOCABULARY.test(f.code) ? [`${f.rel}: ${CODE_VOCABULARY.exec(f.code)?.[0]}`] : []));
    expect(hits).toEqual([]);
  });

  it('لا مفردات استنتاج في النصوص المعروضة إلا في ملف التنبيهات بصيغة النفي', () => {
    const hits = FILES.filter((f) => f.rel !== NOTICES).flatMap((f) => (TEXT_VOCABULARY.test(f.code) ? [`${f.rel}: ${TEXT_VOCABULARY.exec(f.code)?.[0]}`] : []));
    expect(hits).toEqual([]);
    const notices = FILES.find((f) => f.rel === NOTICES)?.code ?? '';
    // الإشارة الوحيدة المسموحة: النفي («لا يمثل استنتاجًا… ولا يستنتج مِجهَر شيئًا…») لا الإثبات.
    expect(notices).toMatch(/لا يمثل استنتاجًا/);
    expect(notices).toMatch(/لا يستنتج مِجهَر شيئًا/);
    expect(notices).toMatch(/لا يدل على جنسية أحد ولا هويته/);
    expect(notices).toMatch(/SETTINGS_NO_INFERENCE = 'لا يستنتج/);
  });

  it('حقول الحساب (الاسم والموقع والنبذة) لا يمسّها إلا declared.ts وprofile-dom.ts', () => {
    const touching = FILES.filter((f) => /\b(?:account|profile)\s*(?:\.\s*(?:name|location|bio|login)\b|\[)|homeLocation|\.p-name|\.p-note|vcard-fullname/.test(f.code)).map((f) => f.rel);
    expect(touching.sort()).toEqual(['src/modules/h/discovery/declared.ts', 'src/modules/h/discovery/profile-dom.ts']);
  });

  it('دالة «محتوى عربي» لا تأخذ إلا نصًّا، وملفها لا يستورد من declared ولا يذكر حقول الحساب', () => {
    const content = FILES.find((f) => f.rel.endsWith('discovery/content.ts'))?.code ?? '';
    expect(content).not.toMatch(/import\s/);
    expect(content).not.toMatch(/\b(name|login|location|bio|account|profile)\b/);
  });

  it('لا وسم هوية في نوع العرض: مفاتيح AccountView محدودة', () => {
    const declared = FILES.find((f) => f.rel.endsWith('discovery/declared.ts'))?.code ?? '';
    const view = /export interface AccountView \{([\s\S]*?)\n\}/.exec(declared)?.[1] ?? '';
    const keys = [...view.matchAll(/^  readonly (\w+):/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(['content', 'declared']);
  });
});
