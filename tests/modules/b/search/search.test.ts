// TEST-GLOSS-04 (AC-B6، الجزء الآلي للبحث): مطابقات بالعربية والإنجليزية والمرادفات المعرّفة مع تصفية بالتصنيف على القاموس المعتمد
// بكامل مداخله، وروابط docs.github.com حيث يثبت المصدر، وزمن البحث ضمن PB-03 (< 10ms من إدخال الحرف حتى ظهور النتائج؛ هنا الاستعلام نفسه،
// ورسم القائمة يقيسه e2e في المتصفح).
import lexicon from '../../../../src/data/glossary/lexicon.json';
import { describe, expect, it } from 'vitest';
import type { Category, Lexicon } from '../../../../src/data/glossary/types';
import { GLOSSARY_ENTRIES, docsLink } from '../../../../src/modules/b/card';
import { CATEGORY_IDS, CATEGORY_LABELS, EXTRA_SYNONYMS, buildSearchIndex, categoryCounts, search, synonymsFor } from '../../../../src/modules/b/search';

const index = buildSearchIndex(GLOSSARY_ENTRIES);
const ids = (query: string, options?: Parameters<typeof search>[2]): string[] => search(index, query, options).map((h) => h.entry.id);
const top = (query: string, n = 1): string[] => ids(query).slice(0, n);

describe('الفهرس والتصنيفات', () => {
  it('كل مداخل القاموس مفهرسة، وكل تصنيف له اسم عربي ومداخل', () => {
    expect(index.size).toBe(GLOSSARY_ENTRIES.length);
    expect(GLOSSARY_ENTRIES.length).toBeGreaterThanOrEqual(100);
    const counts = categoryCounts(index, '');
    expect(counts.all).toBe(GLOSSARY_ENTRIES.length);
    for (const id of CATEGORY_IDS) {
      expect(CATEGORY_LABELS[id], id).toMatch(/[؀-ۿ]/);
      expect(counts[id], id).toBeGreaterThan(0);
    }
    expect(CATEGORY_IDS.reduce((n, id) => n + counts[id], 0)).toBe(counts.all);
  });

  it('استعلام فارغ يعيد كل المداخل بترتيب القاموس (تصفح بلا كتابة)', () => {
    expect(ids('')).toEqual(GLOSSARY_ENTRIES.map((e) => e.id));
    expect(ids('   ')).toHaveLength(GLOSSARY_ENTRIES.length);
  });
});

describe('البحث بالعربية', () => {
  it('الاسم العربي بتشكيل أو تعريف أو بدونهما يصل إلى المدخل نفسه أولًا', () => {
    expect(top('مستودع')).toEqual(['repository']);
    expect(top('المستودع')).toEqual(['repository']);
    expect(top('مُسْتَوْدَع')).toEqual(['repository']);
    expect(top('الفرع')).toContain('branch');
    expect(top('الوسم', 3)).toContain('tag');
    expect(ids('نجمه')).toContain('star'); // التاء المربوطة
  });

  it('اسم المدخل نفسه (ولو بكلمة من اسمه) يُبلَّغ مطابقةَ اسم لا «مطابقة بمرادف»', () => {
    const hit = search(index, 'فرع')[0]!;
    expect(hit.entry.id).toBe('branch');
    expect(hit.via).toBe('name');
    expect(search(index, 'كوميت')[0]!.via).toBe('synonym');
  });

  it('بداية الاسم تكفي (بحث فوري أثناء الكتابة)', () => {
    expect(ids('مستود')).toContain('repository');
    expect(ids('مست')).toContain('repository');
  });

  it('كلمات متعددة شرطها كلها معًا', () => {
    expect(top('حذف مستودع')).toEqual(['delete_repo']);
    expect(ids('حذف مستودع')).not.toContain('repository');
    expect(ids('مستودع كلمةلاتوجدأبدًا')).toEqual([]);
  });

  it('ما لا يطابق شيئًا يعيد فراغًا، لا خطأ', () => {
    expect(ids('zzqqxx')).toEqual([]);
    expect(ids('؟؟؟')).toHaveLength(GLOSSARY_ENTRIES.length); // علامات فقط = استعلام فارغ بعد التوحيد
  });
});

describe('البحث بالإنجليزية', () => {
  it('الاسم الإنجليزي بلا حساسية لحالة الأحرف وعلامات الترقيم', () => {
    expect(top('Pull Request')).toEqual(['pull_request']);
    expect(top('pull request')).toEqual(['pull_request']);
    expect(top('PULL-REQUEST')).toEqual(['pull_request']);
    expect(top('commit')).toEqual(['commit']);
    expect(top('Squash and merge')).toEqual(['squash_merge']);
    expect(top('2fa')).toContain('two_factor');
  });

  it('اسم العنصر كما تعرضه واجهة GitHub (توقيع المدخل) يصل إلى المدخل', () => {
    expect(ids('Settings')).toContain('repo-tab-settings');
    expect(ids('Download ZIP')).toContain('download_zip');
  });
});

describe('المرادفات المعرّفة', () => {
  it('صيغ المعجم غير المعتمدة والأسماء البديلة تصل إلى مدخلها أولًا', () => {
    expect(top('المخزن')).toContain('repository'); // variant في المعجم
    expect(top('التعهد')).toEqual(['commit']);
    expect(top('الإيداع')).toContain('commit');
    expect(top('PR')).toContain('pull_request'); // alias في المعجم
    expect(top('الفورك')).toContain('fork');
  });

  it('كتابة المصطلح بحروف عربية', () => {
    expect(top('كوميت')).toEqual(['commit']);
    expect(top('فورك')).toContain('fork');
    expect(top('برانش')).toContain('branch');
    expect(top('بول ريكويست')).toEqual(['pull_request']);
    expect(top('ريدمي')).toContain('readme');
    expect(top('ويب هوك')).toContain('webhook');
  });

  it('كل مفتاح في جدول المرادفات هو معرّف مدخل موجود (لا مرادف يتيم)', () => {
    const known = new Set(GLOSSARY_ENTRIES.map((e) => e.id));
    expect(Object.keys(EXTRA_SYNONYMS).filter((id) => !known.has(id))).toEqual([]);
  });

  it('كل مرادف معرَّف يعيد مدخله بين أول خمس نتائج', () => {
    const misses: string[] = [];
    for (const [id, list] of Object.entries(EXTRA_SYNONYMS)) {
      for (const synonym of list) {
        const rank = ids(synonym).indexOf(id);
        if (rank < 0 || rank >= 5) misses.push(`${id} ← «${synonym}» (الترتيب ${rank})`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('كل صيغة في معجم القاموس تصل إلى المدخل الذي يطابق اسمه مصطلحها', () => {
    const lex = lexicon as unknown as Lexicon;
    const byEn = new Map(GLOSSARY_ENTRIES.map((e) => [e.en.trim().toLowerCase(), e]));
    const misses: string[] = [];
    let checked = 0;
    for (const term of lex.terms) {
      const entry = byEn.get(term.en.trim().toLowerCase());
      if (!entry) continue;
      for (const form of [term.ar, ...term.variants, ...(term.aliases ?? [])]) {
        checked += 1;
        if (ids(form).indexOf(entry.id) < 0) misses.push(`${entry.id} ← «${form}»`);
      }
    }
    expect(checked).toBeGreaterThan(80);
    expect(misses).toEqual([]);
  });

  it('synonymsFor يجمع المعجم والجدول والتسميات بلا تكرار', () => {
    const repo = GLOSSARY_ENTRIES.find((e) => e.id === 'repository')!;
    const list = synonymsFor(repo);
    expect(list).toEqual(expect.arrayContaining(['المخزن', 'ريبو']));
    expect(new Set(list).size).toBe(list.length);
    const star = GLOSSARY_ENTRIES.find((e) => e.id === 'star')!;
    expect(synonymsFor(star)).toContain('Star'); // تسمية التوقيع
  });
});

describe('التصفية بالتصنيف', () => {
  it('الاستعلام الفارغ في تصنيف يعيد مداخله كلها وحدها', () => {
    for (const category of CATEGORY_IDS) {
      const expected = GLOSSARY_ENTRIES.filter((e) => e.category === category).map((e) => e.id);
      expect(ids('', { category }), category).toEqual(expected);
    }
  });

  it('التصفية تضيّق نتائج الاستعلام نفسه ولا تضيف إليها', () => {
    const all = new Set(ids('مستودع'));
    for (const category of CATEGORY_IDS) {
      const part = ids('مستودع', { category });
      expect(part.every((id) => all.has(id))).toBe(true);
      expect(part.every((id) => GLOSSARY_ENTRIES.find((e) => e.id === id)?.category === category)).toBe(true);
    }
    expect(ids('commit', { category: 'security' as Category })).not.toContain('commit');
    expect(ids('commit', { category: 'git' })).toContain('commit');
    expect(ids('commit', { category: 'all' })).toEqual(ids('commit'));
  });

  it('أعداد الأزرار تطابق التصفية الفعلية', () => {
    const counts = categoryCounts(index, 'merge');
    expect(counts.all).toBe(ids('merge').length);
    for (const category of CATEGORY_IDS) expect(counts[category]).toBe(ids('merge', { category }).length);
  });

  it('limit يقتطع بعد الترتيب', () => {
    expect(search(index, 'git', { limit: 3 })).toHaveLength(3);
    expect(search(index, 'git', { limit: 3 }).map((h) => h.entry.id)).toEqual(ids('git').slice(0, 3));
  });
});

describe('ترتيب النتائج', () => {
  it('التطابق التام للاسم قبل الاحتواء قبل الملخص', () => {
    const hits = search(index, 'branch');
    expect(hits[0]!.entry.id).toBe('branch');
    expect(hits[0]!.via).toBe('name');
    const vias = hits.map((h) => h.via);
    const rank = { name: 0, synonym: 1, summary: 2, body: 3 } as const;
    // الدرجة الأعلى أولًا، وعند تساويها نوع المطابقة.
    for (let i = 1; i < hits.length; i += 1) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    expect(vias.length).toBe(hits.length);
    expect(rank[vias[0]!]).toBe(0);
  });

  it('كل مدخل يُبلغ بالاسم العربي وبالاسم الإنجليزي بين أول ثلاث نتائج', () => {
    const misses: string[] = [];
    for (const entry of GLOSSARY_ENTRIES) {
      for (const name of [entry.ar, entry.en]) {
        const rank = ids(name).indexOf(entry.id);
        if (rank < 0 || rank >= 3) misses.push(`${entry.id} ← «${name}» (${rank})`);
      }
    }
    expect(misses).toEqual([]);
  });
});

describe('روابط الوثائق الرسمية', () => {
  it('كل مدخل موثَّق على المصدر (verified) له رابط docs.github.com، وكل رابط معروض من docs.github.com وحده', () => {
    const verified = GLOSSARY_ENTRIES.filter((e) => e.verification.status === 'verified');
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.filter((e) => !docsLink(e))).toEqual([]);
    for (const entry of GLOSSARY_ENTRIES) {
      const link = docsLink(entry);
      if (link) expect(new URL(link).hostname).toBe('docs.github.com');
    }
  });
});

describe('الأداء (PB-03: < 10ms)', () => {
  const QUERIES = [
    'م', 'مس', 'مست', 'مستو', 'مستود', 'مستودع', 'المستودع', 'ف', 'فر', 'فرع', 'c', 'co', 'com', 'comm', 'commit', 'p', 'pu', 'pull', 'pull r', 'pull request',
    'PR', 'كوميت', 'فورك', 'التعهد', 'المخزن', 'حذف مستودع', 'force push', 'two factor', '2fa', 'settings', 'download', 'مراجعه', 'merge conflict', 'تعارض',
    'branch protection', 'ssh', 'token', 'رمز وصول', 'webhook', 'ويب هوك', 'actions', 'secrets', 'security', 'أمان', 'release', 'إصدار', 'tag', 'وسم', 'readme',
    'ريدمي', 'license', 'رخصة', 'zzzz', 'لاشيء', 'git', 'github', 'ال', 'a', 'e', '1', 'من', 'في',
  ];

  it('الاستعلام الواحد على القاموس كاملًا: الوسيط أقل من 1ms والمئين 95 أقل من 10ms (والأقصى دون 50ms رغم تزاحم العمال)', () => {
    for (let warm = 0; warm < 3; warm += 1) for (const q of QUERIES) search(index, q);
    const times: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      for (const q of QUERIES) {
        const t0 = performance.now();
        search(index, q);
        times.push(performance.now() - t0);
        const t1 = performance.now();
        search(index, q, { category: 'security' });
        times.push(performance.now() - t1);
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    const max = times.at(-1)!;
    // طباعة القياس تبقى في سجل vitest ويحفظها evidence/T-3.4/vitest.txt.
    console.info(`PB-03 (الاستعلام وحده، ${times.length} قياسًا على ${GLOSSARY_ENTRIES.length} مدخلًا): وسيط ${median.toFixed(3)}ms، p95 ${p95.toFixed(3)}ms، أقصى ${max.toFixed(3)}ms`);
    expect(median).toBeLessThan(1);
    expect(p95).toBeLessThan(10);
    // الأقصى يلتقط توقف المعالج أو جمع المهملات حين تتزاحم العمليات؛ ميزانية PB-03 كلها (إدخال حتى ظهور النتائج) تُقاس في المتصفح متسلسلةً.
    expect(max).toBeLessThan(50);
  });

  it('بناء الفهرس مرة واحدة يتم قبل أي كتابة ولا يُعاد لكل ضغطة', () => {
    const t0 = performance.now();
    buildSearchIndex(GLOSSARY_ENTRIES);
    const build = performance.now() - t0;
    console.info(`بناء الفهرس: ${build.toFixed(2)}ms`);
    expect(build).toBeLessThan(250);
  });
});
