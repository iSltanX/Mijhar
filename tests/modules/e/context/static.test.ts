// TEST-CTX-05 (AC-E6) — الشق الساكن (مراجعة شيفرة آلية): لا مسار جمع أو تنقيح أو بناء موازٍ خاص بقسم (AD-22). يقرأ ملفات src كلها ويثبت:
//  أ. قرّاء الصفحة في الوحدة (د) لا يستوردهم من خارجها إلا جامع الطبقة (modules/e/context).
//  ب. لا قراءة لمحتوى الصفحة في الوحدة (هـ) خارج الطبقة (textContent وgetSelection وresolveAll وclosest وquerySelectorAll).
//  ج. فاحص الأسرار لا يستورده إلا منقّح الطبقة وواجهته ومعاينة الحزمة المعدَّلة (تحذير T-6.3 على النص الذي سيُنسخ، AD-28)؛ ولا اقتطاع ولا حجب خارج المنقّح.
//  د. دوال الجمع والتنقيح والبناء وصيغة الأجزاء معرّفة في الطبقة وحدها.
//  هـ. المستهلكون (حزمة السياق T-6.1 وقوالبها T-6.2 وقوالب البرومبت T-11.4، ومتى وُجدا «نسخ البرومبت» T-11.3 والتحليل T-11.6) يأخذون البنية من الطبقة وحدها.
//  و. يمرّ كل محتوى بالمنقّح قبل أي استخدام: الباني لا يستورد من الجامع إلا أنواعًا، ولا يبني إلا بعد المنقّح، وكل حقل محتوى في مخرج المنقّح يمرّ بفاحص الأسرار.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../helpers';

const SRC = path.join(ROOT, 'src');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join('/');
const FILES = walk(SRC).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') }));

/** الشيفرة بلا التعليقات الكاملة (أسطر // وكتل /* *\/)، فلا تُحسب كلمة في شرح. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

interface Import {
  readonly names: readonly string[];
  readonly from: string;
  readonly typeOnly: boolean;
}

/** الاستيرادات وإعادات التصدير بأسمائها ومصدرها مسارًا من جذر المستودع (بلا امتداد). */
function importsOf(file: { path: string; text: string }): Import[] {
  const out: Import[] = [];
  for (const m of file.text.matchAll(/(?:import|export)\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
    const spec = m[3] as string;
    const from = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file.path), spec)) : spec;
    const names = (m[2] as string)
      .split(',')
      .map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] as string)
      .filter(Boolean);
    out.push({ names, from, typeOnly: Boolean(m[1]) });
  }
  return out;
}

const under = (p: string, dir: string): boolean => p.startsWith(`${dir}/`);
const CONTEXT = 'src/modules/e/context';
const MODULE_E = 'src/modules/e';

describe('TEST-CTX-05 (ساكن): لا مسار جمع أو تنقيح أو بناء موازٍ', () => {
  it('أ. قرّاء الصفحة في الوحدة (د) لا يستوردهم من خارجها إلا جامع الطبقة', () => {
    const READERS = new Set(['readPrSummary', 'readChecks', 'readEmbedded', 'parseStatusDetails', 'readJobPage', 'analyzeLog', 'readCompare', 'readCompareFiles', 'explainBlockers', 'readDomEvidence', 'mergeApi']);
    const offenders: string[] = [];
    const users = new Set<string>();
    for (const file of FILES) {
      if (under(file.path, 'src/modules/d')) continue;
      for (const imp of importsOf(file)) {
        if (imp.typeOnly) continue;
        const used = imp.names.filter((n) => READERS.has(n));
        if (!used.length) continue;
        users.add(file.path);
        if (!under(file.path, CONTEXT)) offenders.push(`${file.path}: ${used.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
    expect([...users]).toEqual([`${CONTEXT}/collect.ts`]);
  });

  it('ب. لا قراءة لمحتوى الصفحة في الوحدة (هـ) خارج الطبقة', () => {
    const DOM_READ = /\btextContent\b|\binnerText\b|getSelection\(|resolveAll\(|\.closest\(|querySelectorAll\(/;
    const offenders = FILES.filter((f) => under(f.path, MODULE_E) && !under(f.path, CONTEXT) && DOM_READ.test(code(f.text))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('ج. فاحص الأسرار في المنقّح وواجهته ومعاينة الحزمة وحدها؛ ولا اقتطاع ولا حجب خارج المنقّح', () => {
    const SCANNER = new Set(['scanText', 'SECRET_PATTERNS', 'findingView']);
    const ALLOWED = new Set([`${CONTEXT}/sanitize.ts`, 'src/modules/e/builder/view.tsx', 'src/modules/e/privacy-check/view.tsx', 'src/modules/e/privacy-check/index.ts']);
    const importers = FILES.filter((f) => importsOf(f).some((i) => !i.typeOnly && i.names.some((n) => SCANNER.has(n)))).map((f) => f.path);
    expect(importers.filter((p) => !ALLOWED.has(p))).toEqual([]);
    expect(importers).toContain(`${CONTEXT}/sanitize.ts`);
    const own = FILES.filter((f) => under(f.path, MODULE_E));
    // اقتطاع المحتوى بالأسطر (لا تقصير تسمية في الواجهة بالحروف، كأول سطر من التعليق في قائمة الاختيار).
    const clipping = own.filter((f) => /\bfunction\s+clip\b|\bconst\s+clip\s*=|split\('\\n'\)\.slice\(0,|\blines\.slice\(0,/.test(code(f.text))).map((f) => f.path);
    expect(clipping).toEqual([`${CONTEXT}/sanitize.ts`]);
    const masking = own.filter((f) => code(f.text).includes('[محجوب:')).map((f) => f.path);
    expect(masking).toEqual([`${CONTEXT}/sanitize.ts`]);
  });

  it('د. دوال الجمع والتنقيح والبناء وصيغة الأجزاء معرّفة في الطبقة وحدها', () => {
    const DEFINES = /\b(?:function|const)\s+(collectContext|collectPr|collectIssue|collectJob|collectDiff|readComments|readSelection|blockText|sanitize|maskText|formatParts|buildParts|buildContext|fence|quote|gapLine|sectionLines|gapsSection|partHeading)\b/g;
    const defined = new Map<string, string[]>();
    for (const file of FILES.filter((f) => under(f.path, MODULE_E))) {
      for (const m of code(file.text).matchAll(DEFINES)) defined.set(m[1] as string, [...(defined.get(m[1] as string) ?? []), file.path]);
    }
    for (const [name, where] of defined) expect(where.every((p) => under(p, CONTEXT)), `${name}: ${where.join(', ')}`).toBe(true);
    for (const name of ['collectContext', 'sanitize', 'buildContext', 'formatParts', 'fence', 'gapsSection']) expect(defined.has(name), name).toBe(true);
  });

  it('هـ. المستهلكون يأخذون البنية من الطبقة وحدها، ولا يستورد أيٌّ منهم قارئًا ولا فاحصًا', () => {
    const consumers: Record<string, { file: string; via: RegExp }> = {
      'حزمة السياق (T-6.1)': { file: 'src/modules/e/builder/build.ts', via: /^src\/modules\/e\/context$/ },
      'قوالب الحزمة (T-6.2)': { file: 'src/modules/e/templates/render.ts', via: /^src\/modules\/e\/builder\/build$/ },
      'قوالب البرومبت (T-11.4)': { file: 'src/modules/e/prompt-templates/render.ts', via: /^src\/modules\/e\/context$/ },
    };
    for (const [label, { file, via }] of Object.entries(consumers)) {
      const found = FILES.find((f) => f.path === file);
      expect(found, label).toBeDefined();
      const imps = importsOf(found as { path: string; text: string });
      expect(imps.some((i) => via.test(i.from) && !i.typeOnly && i.names.some((n) => /^(buildContext|bundleContext)$/.test(n))), `${label} يبني من الطبقة`).toBe(true);
      expect(imps.filter((i) => !i.typeOnly && (/\/modules\/d\//.test(i.from) || /privacy-check/.test(i.from))).map((i) => i.from), label).toEqual([]);
    }
  });

  it('هـ. ومتى وُجد «نسخ البرومبت» (T-11.3) والتحليل (T-11.6) يستهلكان الطبقة أو قوالب البرومبت وحدهما', () => {
    const FUTURE = { 'نسخ البرومبت (T-11.3)': 'src/modules/e/copy-prompt', 'التحليل (T-11.6)': 'src/modules/e/provider' };
    for (const [label, dir] of Object.entries(FUTURE)) {
      const files = FILES.filter((f) => under(f.path, dir));
      if (!files.length) continue; // لم يُنفَّذ بعد: الحارس يسري عليه حين يُضاف (MJ20 وMJ21).
      const imps = files.flatMap(importsOf).filter((i) => !i.typeOnly);
      expect(imps.some((i) => /^src\/modules\/e\/(context|prompt-templates)$/.test(i.from)), `${label} يستهلك الطبقة`).toBe(true);
      expect(imps.filter((i) => /\/modules\/d\/(pr-status|log-parser|compare|blockers)\//.test(i.from) || /privacy-check\/scan/.test(i.from) || /\/modules\/e\/context\//.test(i.from)).map((i) => i.from), label).toEqual([]);
    }
  });

  it('و. يمرّ كل محتوى بالمنقّح: الباني لا يستورد من الجامع إلا أنواعًا ولا يبني إلا بعده، وكل حقل محتوى في مخرج المنقّح يمرّ بالفاحص', () => {
    const build = FILES.find((f) => f.path === `${CONTEXT}/build.ts`)?.text ?? '';
    const fromCollect = importsOf({ path: `${CONTEXT}/build.ts`, text: build }).filter((i) => i.from === `${CONTEXT}/collect`);
    expect(fromCollect.length).toBeGreaterThan(0);
    expect(fromCollect.every((i) => i.typeOnly)).toBe(true);
    expect(build).toMatch(/export function formatParts\(s: SanitizedContext\): ContextParts/);
    const body = /export function buildContext\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(build)?.[1] ?? '';
    expect(body.indexOf('sanitize(')).toBeGreaterThan(-1);
    expect(body.indexOf('sanitize(')).toBeLessThan(body.indexOf('formatParts('));

    const sanitize = FILES.find((f) => f.path === `${CONTEXT}/sanitize.ts`)?.text ?? '';
    const result = /const result: SanitizedContext = \{([\s\S]*?)\n {2}\};/.exec(sanitize)?.[1] ?? '';
    const fields = [...result.matchAll(/^ {4}(\w+): ([\s\S]*?),?$(?=\n {4}\w+:|\s*$)/gm)].map((m) => [m[1] as string, m[2] as string] as const);
    // ما لا محتوى فيه من الصفحة: النوع والرقم والحدود وتقرير الأسرار والإتاحة (أعداد وأعلام).
    const NOT_CONTENT = new Set(['kind', 'number', 'limits', 'secrets', 'available']);
    expect(fields.length).toBeGreaterThan(15);
    const unpassed = fields.filter(([key, value]) => !NOT_CONTENT.has(key) && !value.includes('pass(')).map(([key]) => key);
    expect(unpassed).toEqual([]);
  });
});
