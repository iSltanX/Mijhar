// TEST-COMM-02 (وحدة): قراءة سياسة المساهمة بنقر (المسار المقيس في T-0.4) وتحليلها محليًا: أنظمة الترجمة الخارجية، وعبارات الرفض،
// وطلب issue أولًا، وقسم المساهمة في README؛ وما لم يُقرأ لا يُعدّ غيابًا.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { FetchText } from '../../../../src/modules/h/first-contribution/sources';
import { analyzePolicy, buildDraft, readPolicy } from '../../../../src/modules/h/readme-wizard';
import type { PolicyFile } from '../../../../src/modules/h/readme-wizard';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const read = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const file = (kind: PolicyFile['kind'], text: string, p = kind === 'readme' ? 'README.md' : 'CONTRIBUTING.md'): PolicyFile => ({ kind, path: p, url: `https://github.com/o/r/raw/HEAD/${p}`, text });

describe('القراءة', () => {
  it('يجرّب المسارات بالترتيب من github.com/<repo>/raw/HEAD، ويقف عند أول موجود، ويُعلن ما لم يُعثر عليه', async () => {
    const fetchText = vi.fn<FetchText>(async (url) => (url.endsWith('/docs/CONTRIBUTING.md') ? { ok: true, text: '# Contributing' } : url.endsWith('/README.md') ? { ok: true, text: read('fixture-readme.md') } : { ok: false, reason: 'not-found', status: 404 }));
    const result = await readPolicy('octo', 'community', fetchText);
    expect(fetchText.mock.calls.map(([u]) => u)).toEqual([
      'https://github.com/octo/community/raw/HEAD/CONTRIBUTING.md',
      'https://github.com/octo/community/raw/HEAD/.github/CONTRIBUTING.md',
      'https://github.com/octo/community/raw/HEAD/docs/CONTRIBUTING.md',
      'https://github.com/octo/community/raw/HEAD/README.md',
    ]);
    expect(result.files.map((f) => f.path)).toEqual(['docs/CONTRIBUTING.md', 'README.md']);
    expect(result.missing).toEqual([]);
    expect(result.requests).toBe(4);
  });

  it('المسار الظاهر في الصفحة يسبق التخمين؛ وفشل الشبكة «تعذّر» لا «غير موجود»', async () => {
    const fetchText = vi.fn<FetchText>(async (url) => (url.includes('/CONTRIBUTING') ? { ok: false, reason: 'network' } : { ok: false, reason: 'not-found', status: 404 }));
    const result = await readPolicy('o', 'r', fetchText, { contributing: ['community/CONTRIBUTING.md'] });
    expect(fetchText.mock.calls[0]?.[0]).toBe('https://github.com/o/r/raw/HEAD/community/CONTRIBUTING.md');
    expect(result.failed).toEqual([{ kind: 'contributing', path: 'community/CONTRIBUTING.md', reason: 'network' }]);
    expect(result.missing.map((m) => m.kind)).toEqual(['readme']);
  });
});

describe('التحليل المحلي', () => {
  it('CONTRIBUTING العينة: طلب issue أولًا، والترجمات عبر Crowdin بسطورها، ولا عبارة رفض', () => {
    const findings = analyzePolicy([file('contributing', read('fixture-contributing.md'))]);
    expect(findings.issueFirst[0]?.text).toContain('open an issue first');
    expect(findings.externalSystems).toEqual([{ name: 'Crowdin', url: 'https://crowdin.com/project/community' }]);
    expect(findings.declines).toEqual([]);
    expect(findings.translationLines.map((l) => l.line)).toEqual([38, 40]);
  });

  it('ملف لا يذكر الترجمة: لا نظام ولا رفض ولا أسطر', () => {
    const findings = analyzePolicy([file('contributing', '# Contributing\n\nRun the tests before you push.')]);
    expect(findings).toEqual({ externalSystems: [], translationLines: [], declines: [], issueFirst: [], readmeSection: null });
  });

  it('أنظمة الترجمة الخارجية بروابطها، وعبارات قصر الترجمات عليها أو رفضها', () => {
    const findings = analyzePolicy([
      file(
        'contributing',
        [
          '## Translations',
          'Translations are managed on Crowdin: https://crowdin.com/project/demo.',
          'We do not accept translation pull requests on GitHub.',
          'See also https://hosted.weblate.org/projects/demo/ for the docs.',
        ].join('\n'),
      ),
    ]);
    expect(findings.externalSystems).toEqual([
      { name: 'Crowdin', url: 'https://crowdin.com/project/demo' },
      { name: 'Weblate', url: 'https://hosted.weblate.org/projects/demo/' },
    ]);
    expect(findings.declines.map((l) => l.line)).toEqual([3]);
    expect(findings.translationLines.map((l) => l.line)).toEqual([1, 2, 3]);
    const draft = buildDraft({ owner: 'o', repo: 'r', searchUrl: 'https://github.com/search?q=x&type=issues', findings, contributingFound: true }, 'en');
    expect(draft.body).toContain('through Crowdin (https://crowdin.com/project/demo)');
    expect(draft.body).not.toContain('add `README.ar.md`');
  });

  it('قسم المساهمة في README حتى العنوان التالي، والعربية تُعرف كذلك', () => {
    const findings = analyzePolicy([file('readme', '# Demo\n\nIntro.\n\n## Contributing\n\nPRs welcome. ترجمة الوثائق مرحب بها.\n\n## License\n\nMIT')]);
    expect(findings.readmeSection).toBe('PRs welcome. ترجمة الوثائق مرحب بها.');
    expect(findings.translationLines.map((l) => l.text)).toEqual(['PRs welcome. ترجمة الوثائق مرحب بها.']);
  });
});

describe('المسودة', () => {
  it('بالإنجليزية والعربية: تذكر رابط بحث التكرار ومراجعة السياسة وتسأل ولا تفترض، ولا تَعِد بطلب دمج قبل الموافقة', () => {
    const input = { owner: 'octo', repo: 'community', searchUrl: 'https://github.com/search?q=repo%3Aocto%2Fcommunity&type=issues', findings: analyzePolicy([]), contributingFound: false };
    const en = buildDraft(input, 'en');
    expect(en.title).toBe('Would you welcome an Arabic translation of the README?');
    expect(en.body).toContain(input.searchUrl);
    expect(en.body).toContain("couldn't find a CONTRIBUTING file");
    expect(en.body).toContain("I won't open a pull request unless you agree.");
    const ar = buildDraft({ ...input, contributingFound: true }, 'ar');
    expect(ar.title).toBe('هل ترحبون بترجمة README إلى العربية؟');
    expect(ar.body).toContain('قرأت إرشادات المساهمة (CONTRIBUTING)');
    expect(ar.body).toContain('لن أفتح طلب دمج قبل موافقتكم.');
  });
});
