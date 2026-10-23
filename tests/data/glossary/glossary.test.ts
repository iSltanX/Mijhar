// TEST-GLOSS-05 (AC-3.1): بيانات القاموس تجتاز المخطط، خالية من عبارات المحاكاة، بمعجم عربي واحد وصلاحية مضبوطة ومصطلحات أساسية معرّفة.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatReport, loadGlossaryFiles, validateGlossary } from '../../../scripts/glossary/lib.mjs';
import { migrate } from '../../../scripts/glossary/migrate.mjs';
import { run } from '../../../scripts/glossary/validate.mjs';
import { PERMISSION_LEVELS, SIMULATION_PATTERNS } from '../../../src/data/glossary/schema.mjs';
import { DO_NOT_TRANSLATE_TERMS } from '../../../src/modules/c/masking/do-not-translate';
import { ROOT } from '../../setup/paths';

type Json = Record<string, any>;
const files = (): Json => structuredClone(loadGlossaryFiles(ROOT));
const rules = (input: Json): string[] => validateGlossary(input as any).errors.map((e: { rule: string }) => e.rule);
const entry = (input: Json, id: string): Json => input.data.entries.find((e: Json) => e.id === id);

describe('بيانات القاموس الفعلية', () => {
  const real = loadGlossaryFiles(ROOT);
  const result = validateGlossary(real);

  it('تجتاز التحقق من المخطط لكل مدخل بلا مخالفة', () => {
    expect(result.errors, formatReport(result)).toEqual([]);
  });

  it('أمر validate.mjs يجتاز ويطبع عدد المدخلات وما أُزيل من عبارات المحاكاة', () => {
    const { errors, report } = run(ROOT);
    expect(errors).toEqual([]);
    expect(report).toContain(`عدد المدخلات: ${real.data.entries.length}`);
    expect(report).toMatch(/عبارات المحاكاة المُزالة: \d+ بندًا في \d+ مدخلًا/);
  });

  it('العدد المعلن في الملف وفي README يطابق الفعلي، ولا معرّفات مكررة', () => {
    expect(real.data.meta.count).toBe(real.data.entries.length);
    expect(real.readme).toContain(`عدد المدخلات: ${real.data.entries.length}`);
    const ids = real.data.entries.map((e: Json) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('كل المداخل الـ107 المنقولة حاضرة ما عدا ما سُجِّل حذفه، والمضاف مسجَّل بمعرّفاته', () => {
    const ids = new Set(real.data.entries.map((e: Json) => e.id));
    const dropped = real.removedLog.filter((item: Json) => item.field === '*').map((item: Json) => item.id);
    expect(dropped).toEqual(['pr-merge-demo']);
    for (const id of ['rebase', 'checks', 'close_issue', 'close_with_comment', 'draft_pull_request', 'pr_review']) expect(ids.has(id), id).toBe(true);
    expect(ids.has('pr-merge-demo')).toBe(false);
    expect(real.data.entries.length).toBe(107 - dropped.length + 6);
  });

  it('لكل مدخل مستويات الشرح الثلاثة وحقول القرار الجديدة، والصلاحية من المجموعة المضبوطة', () => {
    for (const e of real.data.entries) {
      for (const field of ['brief', 'medium', 'detailed', 'whenToUse', 'reversalLimits']) expect(typeof e[field], `${e.id}.${field}`).toBe('string');
      expect(PERMISSION_LEVELS, e.id).toContain(e.permission);
    }
  });

  it('لا أثر لعبارات المحاكاة ولا لحقل route ولا لأسماء المشروع السابق في أي مدخل', () => {
    const text = JSON.stringify(real.data.entries).toLowerCase();
    for (const pattern of SIMULATION_PATTERNS) expect(text.includes(pattern.toLowerCase()), pattern).toBe(false);
    expect(real.data.entries.some((e: Json) => 'route' in e)).toBe(false);
  });

  it('سجل ما أُزيل: كل نص أُزيل بسبب المحاكاة لم يعد في مدخله', () => {
    const byId = new Map(real.data.entries.map((e: Json) => [e.id, e]));
    const simulation = real.removedLog.filter((item: Json) => item.kind === 'simulation' && item.field !== '*' && item.field !== 'route');
    expect(simulation.length).toBeGreaterThan(10);
    for (const item of simulation) {
      const current = byId.get(item.id) as Json | undefined;
      expect(current, item.id).toBeDefined();
      if (item.removed.length > 12) expect(String(current?.[item.field] ?? '').includes(item.removed), `${item.id}.${item.field}`).toBe(false);
    }
  });

  it('المصطلحات الأساسية: كل مدخل حساس أو خطر فيها، ولكل منها مثال عملي', () => {
    const core = new Set(real.coreIds);
    for (const e of real.data.entries) {
      if (e.safety !== 'آمن') expect(core.has(e.id), e.id).toBe(true);
      if (core.has(e.id)) expect(String(e.example ?? '').length, e.id).toBeGreaterThan(9);
    }
    for (const id of ['repository', 'commit', 'branch', 'pull_request', 'issue', 'fork', 'rebase', 'merge_conflict', 'checks']) expect(core.has(id), id).toBe(true);
  });

  it('عنصر الواجهة بتوقيع، والمصطلح المجرد بلا توقيع، ولا يتطابق توقيعان لعنصرين في الصفحة نفسها', () => {
    const elements = real.data.entries.filter((e: Json) => e.kind === 'element');
    for (const e of real.data.entries) expect(e.signature === null, e.id).toBe(e.kind === 'concept');
    const seen = new Map<string, string>();
    for (const e of elements) {
      for (const label of e.signature.labels) {
        for (const page of e.signature.pages) {
          const key = `${label.toLowerCase()}|${page}`;
          // تطابق التسمية ذاتها في الصفحة ذاتها مقبول فقط حين يختلف الدور أو نمط الرابط، وإلا التبست المطابقة.
          const previous = seen.get(key);
          expect(previous, `${e.id} يشارك «${label}» في ${page} مع ${previous}`).toBeUndefined();
          seen.set(key, e.id);
        }
      }
    }
  });

  it('قائمة «تبقى بالإنجليزية» في المعجم محمية كلها في قائمة «لا تُترجم» لتقنيع الترجمة (T-4.2)', () => {
    const protectedTerms = new Set(DO_NOT_TRANSLATE_TERMS.map((t) => t.toLowerCase()));
    for (const term of real.lexicon.keepEnglish) expect(protectedTerms.has(term.toLowerCase()), term).toBe(true);
  });

  it('لا مصطلح عربي مختلف لنفس الاسم الإنجليزي، ولا مصطلح في المعجم وفي قائمة الإبقاء معًا', () => {
    const ar = new Map<string, string>();
    for (const e of real.data.entries) {
      const key = e.en.toLowerCase();
      expect(ar.get(key) ?? e.ar, e.en).toBe(e.ar);
      ar.set(key, e.ar);
    }
    const names = new Set(real.lexicon.terms.flatMap((t: Json) => [t.en, ...(t.aliases ?? [])]).map((n: string) => n.toLowerCase()));
    for (const k of real.lexicon.keepEnglish) expect(names.has(k.toLowerCase()), k).toBe(false);
  });
});

describe('المدقق يرفض المخالفات المحقونة (TEST-GLOSS-05 السلبي)', () => {
  it('حقل مطلوب مفقود', () => {
    const f = files();
    delete entry(f, 'fork').whenToUse;
    expect(rules(f)).toContain('schema');
  });

  it('حقل غير معرّف في المخطط', () => {
    const f = files();
    entry(f, 'fork').route = '/x';
    expect(rules(f)).toContain('schema');
  });

  it('معرّف مكرر', () => {
    const f = files();
    f.data.entries.push({ ...entry(f, 'fork') });
    f.data.meta.count += 1;
    expect(rules(f)).toContain('duplicate-id');
  });

  it('صلاحية خارج المجموعة المضبوطة', () => {
    const f = files();
    entry(f, 'fork').permission = 'الكتابة في المستودع';
    expect(rules(f)).toContain('enum');
  });

  it.each([
    ['في هذه المحاكاة لا يُحذف شيء', 'detailed'],
    ['مستودع iSltanX/Raff', 'example'],
    ['تطبيق ghsim', 'brief'],
    ['simulation only', 'whenToUse'],
  ])('عبارة محاكاة «%s» في %s', (phrase, field) => {
    const f = files();
    entry(f, 'fork')[field] = `${entry(f, 'fork')[field]} ${phrase}`;
    expect(rules(f)).toContain('simulation');
  });

  it('صيغة عربية غير معتمدة من المعجم', () => {
    const f = files();
    entry(f, 'fork').medium = `${entry(f, 'fork').medium} وهذا توكن وصول شخصي.`;
    expect(rules(f)).toContain('lexicon');
  });

  it('«عربي (English)» بعربي لا يحمل جذر الصيغة المعتمدة', () => {
    const f = files();
    entry(f, 'fork').medium = `${entry(f, 'fork').medium} وهو المخزن العام (Repository).`;
    expect(rules(f)).toContain('lexicon');
  });

  it('ترجمة عربية لا تطابق المعجم لمصطلح معرَّف', () => {
    const f = files();
    entry(f, 'commit').ar = 'التعهّد';
    expect(rules(f)).toContain('lexicon');
  });

  it('عدد معلن لا يطابق الفعلي في الملف وفي README', () => {
    const a = files();
    a.data.meta.count += 1;
    expect(rules(a)).toContain('count');
    const b = files();
    b.readme = b.readme.replace(/عدد المدخلات:\s*\d+/, 'عدد المدخلات: 5');
    expect(rules(b)).toContain('count');
  });

  it('رابط وثائق خارج docs.github.com أو بشرطة أخيرة أو استعلام', () => {
    for (const url of ['https://example.com/en/x', 'https://docs.github.com/en/x/', 'https://docs.github.com/en/x?y=1']) {
      const f = files();
      entry(f, 'fork').docsUrl = url;
      expect(rules(f), url).toContain('docs');
    }
  });

  it('تحقق «verified» بلا رابط وثائق', () => {
    const f = files();
    entry(f, 'fork').docsUrl = null;
    expect(rules(f)).toContain('verification');
  });

  it('عنصر واجهة بلا توقيع، ومصطلح مجرد بتوقيع', () => {
    const a = files();
    entry(a, 'fork').signature = null;
    expect(rules(a)).toContain('signature');
    const b = files();
    entry(b, 'commit').signature = { labels: ['Commit'], roles: ['button'], pages: ['any'] };
    expect(rules(b)).toContain('signature');
  });

  it('توقيع بدور أو صفحة خارج المجموعة أو نمط رابط غير صالح', () => {
    const f = files();
    entry(f, 'fork').signature = { labels: ['Fork'], roles: ['div'], pages: ['nowhere'], hrefPatterns: ['('] };
    expect(rules(f).filter((r) => r === 'signature').length).toBeGreaterThanOrEqual(3);
  });

  it('مدخل حساس خارج قائمة الأساسية، ومصطلح أساسي بلا مثال', () => {
    const a = files();
    a.coreIds = a.coreIds.filter((id: string) => id !== 'delete_repo');
    expect(rules(a)).toContain('core');
    const b = files();
    delete entry(b, 'delete_repo').example;
    expect(rules(b)).toContain('core');
  });

  it('طول خارج الحدود وتطابق المستويات', () => {
    const a = files();
    entry(a, 'fork').brief = 'قصير';
    expect(rules(a)).toContain('length');
    const b = files();
    entry(b, 'fork').medium = entry(b, 'fork').brief;
    expect(rules(b).length).toBeGreaterThan(0);
  });

  it('سجل ما أُزيل ناقص', () => {
    const f = files();
    f.removedLog.push({ id: 'fork' });
    expect(rules(f)).toContain('removed');
  });
});

describe('النقل من المشروع السابق', () => {
  const source = process.env.GHSIM_SOURCE;

  it.skipIf(!source)('إعادة النقل من ghsim-source تطابق entries.json وسجل ما أُزيل حرفيًا (GHSIM_SOURCE)', async () => {
    const { data, log, problems } = await migrate({ sourceDir: source });
    expect(problems).toEqual([]);
    const ser = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
    expect(ser(data)).toBe(fs.readFileSync(path.join(ROOT, 'src/data/glossary/entries.json'), 'utf8'));
    expect(ser(log)).toBe(fs.readFileSync(path.join(ROOT, 'scripts/glossary/removed-log.json'), 'utf8'));
  });
});
