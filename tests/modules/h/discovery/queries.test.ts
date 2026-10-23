// TEST-COMM-04 (AC-H4): صحة صياغة الاستعلامات المولَّدة وفحصها، وتوسيع تهجئات location، وعدم فتح شيء في التوليد.
import { describe, expect, it } from 'vitest';
import {
  ARABIC_TOPICS,
  MAX_OPERATORS,
  MAX_VARIANTS_PER_QUERY,
  PLACES,
  arabicDescriptionQuery,
  arabicTopicsQuery,
  collectVariants,
  generatedProblems,
  locationQueries,
  locationQuery,
  quoteValue,
  searchUrl,
  trendingUrl,
  validateQuery,
} from '../../../../src/modules/h/discovery';
import type { GeneratedQuery } from '../../../../src/modules/h/discovery';

const NOW = new Date('2026-10-23T10:00:00Z');

describe('searchUrl', () => {
  it('الاستعلام يعود كما هو من الرابط (ترميز سليم للعربية والاقتباس والأقواس)', () => {
    for (const q of ['topic:arabic OR topic:rtl', 'location:"Saudi Arabia" OR location:"الرياض"', '(العربية OR arabic) in:description,readme', 'stars:>=10 pushed:>=2026-01-01']) {
      const url = new URL(searchUrl(q, 'repositories'));
      expect(url.origin + url.pathname).toBe('https://github.com/search');
      expect(url.searchParams.get('q')).toBe(q);
      expect(url.searchParams.get('type')).toBe('repositories');
    }
  });

  it('لا يدخل في الرابط ما ليس في الاستعلام: لا معاملات إضافية', () => {
    expect([...new URL(searchUrl('a', 'users')).searchParams.keys()].sort()).toEqual(['q', 'type']);
  });
});

describe('quoteValue', () => {
  it('كلمة بسيطة بلا اقتباس، وغيرها بين علامتين، وتُحذف علامات الاقتباس الداخلية', () => {
    expect(quoteValue('python')).toBe('python');
    expect(quoteValue('arabic-nlp')).toBe('arabic-nlp');
    expect(quoteValue('Saudi Arabia')).toBe('"Saudi Arabia"');
    expect(quoteValue('الرياض')).toBe('"الرياض"');
    expect(quoteValue('a"b\\c d')).toBe('"abc d"');
  });
});

describe('استعلامات المحتوى العربي', () => {
  it('الافتراضي: وسوم الخطة الأربعة بأربعة معاملات OR... وثلاثة', () => {
    const { query, type } = arabicTopicsQuery();
    expect(type).toBe('repositories');
    expect(query).toBe(ARABIC_TOPICS.map((t) => `topic:${t}`).join(' OR '));
    expect(query).toBe('topic:arabic OR topic:rtl OR topic:arabic-nlp OR topic:arabic-fonts');
  });

  it('مع المؤهِّلات تُحاط مجموعة OR بأقواس لئلا تتفكك', () => {
    const { query } = arabicTopicsQuery({ language: 'Jupyter Notebook', minStars: 50, pushedWithinDays: 30, now: NOW });
    expect(query).toBe('(topic:arabic OR topic:rtl OR topic:arabic-nlp OR topic:arabic-fonts) language:"Jupyter Notebook" stars:>=50 pushed:>=2026-09-23');
  });

  it('وسم واحد بلا أقواس ولا OR', () => {
    expect(arabicTopicsQuery({ topics: ['rtl'], minStars: 5 }).query).toBe('topic:rtl stars:>=5');
  });

  it('وصف أو README بكلمات عربية', () => {
    expect(arabicDescriptionQuery().query).toBe('(العربية OR عربي OR arabic) in:description,readme');
    expect(arabicDescriptionQuery({ language: 'go' }).query).toBe('(العربية OR عربي OR arabic) in:description,readme language:go');
  });

  it('كل تركيبة خيارات تنتج استعلامًا صحيح الصياغة بحدود GitHub', () => {
    const languages = [undefined, 'python', 'C++', 'Jupyter Notebook'];
    let count = 0;
    for (const language of languages) {
      for (const minStars of [undefined, 0, 1, 1000]) {
        for (const pushedWithinDays of [undefined, 7, 365]) {
          for (const make of [arabicTopicsQuery, arabicDescriptionQuery]) {
            const generated = make({ ...(language ? { language } : {}), ...(minStars !== undefined ? { minStars } : {}), ...(pushedWithinDays ? { pushedWithinDays } : {}), now: NOW });
            const check = validateQuery(generated.query, generated.type);
            expect(check.ok, generated.query).toBe(true);
            expect(check.issues.filter((i) => i.severity === 'warning'), generated.query).toEqual([]);
            expect(check.operators).toBeLessThanOrEqual(MAX_OPERATORS);
            count += 1;
          }
        }
      }
    }
    expect(count).toBe(4 * 4 * 3 * 2);
  });
});

describe('trendingUrl', () => {
  it('بلا لغة: الصفحة العامة بالفترة ولغة المحتوى', () => {
    expect(trendingUrl({ since: 'weekly', spokenLanguage: 'ar' })).toBe('https://github.com/trending?since=weekly&spoken_language_code=ar');
    expect(trendingUrl({ since: 'daily' })).toBe('https://github.com/trending?since=daily');
  });

  it('لغة البرمجة في المسار بأحرف صغيرة ومرمّزة', () => {
    expect(trendingUrl({ language: 'Python', since: 'monthly' })).toBe('https://github.com/trending/python?since=monthly');
    expect(trendingUrl({ language: 'C++', since: 'daily' })).toBe('https://github.com/trending/c%2B%2B?since=daily');
    expect(trendingUrl({ language: 'C#', since: 'daily' })).toBe('https://github.com/trending/c%23?since=daily');
    expect(new URL(trendingUrl({ language: 'a/b', since: 'daily' })).pathname).toBe('/trending/a%2Fb');
  });
});

describe('موسّع تهجئات location', () => {
  it('يطابق مثال الخطة حرفيًا', () => {
    const { query, type } = locationQuery(['Saudi Arabia', 'Riyadh', 'الرياض', 'السعودية', 'KSA']);
    expect(type).toBe('users');
    expect(query).toBe('location:"Saudi Arabia" OR location:"Riyadh" OR location:"الرياض" OR location:"السعودية" OR location:"KSA"');
  });

  it('صيغة واحدة بلا OR، ومع لغة تُحاط الصيغ بأقواس', () => {
    expect(locationQuery(['Cairo']).query).toBe('location:"Cairo"');
    expect(locationQuery(['Cairo', 'القاهرة'], { language: 'python' }).query).toBe('(location:"Cairo" OR location:"القاهرة") language:python');
  });

  it('collectVariants: بلا تكرار (حالة الأحرف والتطبيع) وبالتناوب بين الأماكن، وصيغ المستخدم آخرًا', () => {
    const sa = PLACES.find((p) => p.id === 'sa')!;
    const riyadh = PLACES.find((p) => p.id === 'riyadh')!;
    expect(collectVariants([sa, riyadh], ['riyadh', '  Al Khobar  ', ''])).toEqual(['Saudi Arabia', 'Riyadh', 'السعودية', 'الرياض', 'Al Khobar', 'KSA', 'المملكة العربية السعودية']);
  });

  it('locationQueries: يقسّم دون فقد صيغة ولا تجاوز حد المعاملات، وكل ناتج صحيح', () => {
    const variants = collectVariants(PLACES.filter((p) => ['sa', 'riyadh', 'jeddah', 'eg', 'cairo', 'ae', 'dubai'].includes(p.id)));
    expect(variants.length).toBeGreaterThan(MAX_VARIANTS_PER_QUERY);
    const queries = locationQueries(variants);
    expect(queries.length).toBe(Math.ceil(variants.length / MAX_VARIANTS_PER_QUERY));
    const used = queries.flatMap((q) => [...q.query.matchAll(/location:("[^"]+"|\S+)/g)].map((m) => (m[1] as string).replace(/"/g, '')));
    expect(used).toEqual(variants);
    for (const q of queries) {
      expect(generatedProblems(q), q.query).toEqual([]);
      expect(validateQuery(q.query, q.type).operators).toBeLessThanOrEqual(MAX_OPERATORS);
    }
    expect(locationQueries([])).toEqual([]);
  });

  it('كل مكان في القائمة له صيغتان فأكثر أو صيغة واضحة، بلا فارغ ولا تكرار داخلي', () => {
    const ids = new Set<string>();
    for (const place of PLACES) {
      expect(ids.has(place.id), place.id).toBe(false);
      ids.add(place.id);
      expect(place.variants.length).toBeGreaterThan(0);
      expect(new Set(place.variants.map((v) => v.toLowerCase())).size).toBe(place.variants.length);
      for (const v of place.variants) expect(v.trim()).toBe(v);
    }
  });

  it('صيغ كل الأماكن مجتمعة تُولّد استعلامات صحيحة', () => {
    const queries: GeneratedQuery[] = locationQueries(collectVariants(PLACES));
    for (const q of queries) expect(generatedProblems(q), q.query).toEqual([]);
  });
});

describe('validateQuery', () => {
  const codes = (q: string, type: 'repositories' | 'users' | 'issues' = 'repositories'): string[] => validateQuery(q, type).issues.map((i) => i.code);

  it('استعلامات سليمة', () => {
    for (const q of ['topic:arabic', 'a OR b', '(a OR b) AND c', 'NOT foo', 'foo NOT bar', 'location:"Saudi Arabia"', 'stars:>10 language:python']) expect(validateQuery(q, 'repositories').ok, q).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['location:"Saudi', 'unbalanced-quote'],
    ['(a OR b', 'unbalanced-parenthesis'],
    ['a OR b)', 'unbalanced-parenthesis'],
    [')a(', 'unbalanced-parenthesis'],
    ['()', 'empty-parentheses'],
    ['OR a', 'dangling-operator'],
    ['a OR', 'dangling-operator'],
    ['a AND', 'dangling-operator'],
    ['a NOT', 'dangling-operator'],
    ['(OR a)', 'dangling-operator'],
    ['a OR OR b', 'adjacent-operators'],
    ['a AND OR b', 'adjacent-operators'],
    ['topic: arabic', 'empty-qualifier'],
    ['a OR b OR c OR d OR e OR f OR g', 'too-many-operators'],
    ['a'.repeat(300), 'too-long'],
  ])('%j ← %s', (q, code) => expect(codes(q)).toContain(code));

  it('خمسة معاملات مقبولة وستة مرفوضة (حد توثيق GitHub REST)', () => {
    expect(validateQuery(Array.from({ length: 6 }, (_, i) => `t${i}`).join(' OR '), 'repositories').ok).toBe(true);
    expect(validateQuery(Array.from({ length: 7 }, (_, i) => `t${i}`).join(' OR '), 'repositories').ok).toBe(false);
  });

  it('طول النص لا يحسب المؤهِّلات: عشرات المؤهِّلات الطويلة لا تتجاوز الحد', () => {
    const q = Array.from({ length: 30 }, (_, i) => `topic:${'x'.repeat(20)}${i}`).join(' ');
    expect(codes(q)).not.toContain('too-long');
  });

  it('تحذيرات لا تمنع: معامل بأحرف صغيرة ومؤهِّل غير معروف', () => {
    const lower = validateQuery('a or b', 'repositories');
    expect(lower.ok).toBe(true);
    expect(lower.issues.map((i) => i.code)).toContain('lowercase-operator');
    const unknown = validateQuery('wat:1', 'repositories');
    expect(unknown.ok).toBe(true);
    expect(unknown.issues.map((i) => i.code)).toContain('unknown-qualifier');
  });

  it('المؤهِّلات تختلف بالنوع: location للمستخدمين وحدهم', () => {
    expect(codes('location:Cairo', 'users')).not.toContain('unknown-qualifier');
    expect(codes('location:Cairo', 'repositories')).toContain('unknown-qualifier');
    expect(codes('topic:rtl', 'users')).toContain('unknown-qualifier');
  });

  it('الاقتباس يحمي ما بداخله من التحليل', () => {
    const check = validateQuery('location:"a OR b (c" topic:x', 'users');
    expect(check.operators).toBe(0);
    expect(check.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
