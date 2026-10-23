// T-4.2: التقنيع قبل الترجمة — صيغة الرموز واكتشاف العناصر المحمية وحدودها.
import { describe, expect, it } from 'vitest';
import { maskSegments, maskText, tokenName } from '../../../../src/modules/c/masking/mask';
import { partsToText, unmask } from '../../../../src/modules/c/masking/unmask';

const originals = (text: string, terms?: readonly string[]): string[] =>
  [...maskText(text, terms ? { terms } : {}).expectedTokens.values()].map((r) => r.original);

describe('صيغة الرموز وسجلها', () => {
  it('رمز مفهرس بصيغة ⟦TYPE_INDEX⟧ بفهرس متصل مشترك بين الأنواع بترتيب الظهور', () => {
    const { masked, expectedTokens } = maskText('Run `npm test` then edit src/core/index.ts, see #42.', { terms: [] });
    expect(masked).toBe('Run ⟦CODE_0⟧ then edit ⟦PATH_1⟧, see ⟦REF_2⟧.');
    expect([...expectedTokens.keys()]).toEqual(['⟦CODE_0⟧', '⟦PATH_1⟧', '⟦REF_2⟧']);
    expect(expectedTokens.get('⟦PATH_1⟧')).toEqual({ token: '⟦PATH_1⟧', type: 'PATH', index: 1, original: 'src/core/index.ts' });
  });

  it('نص بلا عناصر محمية يبقى كما هو بخريطة فارغة', () => {
    const { masked, expectedTokens } = maskText('Please review this change.', { terms: [] });
    expect(masked).toBe('Please review this change.');
    expect(expectedTokens.size).toBe(0);
  });

  it('tokenName تبني الصيغة المعتمدة', () => {
    expect(tokenName('TERM', 2)).toBe('⟦TERM_2⟧');
  });
});

describe('ما يُحمى', () => {
  it.each<[string, string, string[]]>([
    ['رابط http(s)', 'See https://docs.github.com/en/actions for details.', ['https://docs.github.com/en/actions']],
    ['رابط بين قوسين تُقتطع منه الفاصلة وقوس الإغلاق', 'Docs (https://example.com/a_(b)) and more, https://x.io/y.', ['https://example.com/a_(b)', 'https://x.io/y']],
    ['بريد إلكتروني', 'Write to dev@example.com today.', ['dev@example.com']],
    ['مسار مطلق ونسبي ومنزلي', 'Use /usr/local/bin, ./scripts/run.sh, ../lib and ~/notes/todo.md.', ['/usr/local/bin', './scripts/run.sh', '../lib', '~/notes/todo.md']],
    ['مسار نسبي بامتداد معروف', 'Edit src/modules/c/masking/mask.ts first.', ['src/modules/c/masking/mask.ts']],
    ['مسار بمجلد جذر معروف بلا امتداد', 'Outputs go to dist/chromium and dist/firefox, not test/tmp.', ['dist/chromium', 'dist/firefox', 'test/tmp']],
    ['مجلد بشرطة مائلة أخيرة', 'Everything under docs/guides/ is public.', ['docs/guides/']],
    ['مسار ويندوز', 'Open C:\\Users\\dev\\app.config now.', ['C:\\Users\\dev\\app.config']],
    ['ملفات النقاط', 'Add it to .gitignore or .github/workflows/ci.yml.', ['.gitignore', '.github/workflows/ci.yml']],
    ['اسم ملف بامتداد معروف', 'Open package.json and README.md.', ['package.json', 'README.md']],
    ['أمر مع أعلامه وسلسلته المقتبسة', 'Then run git commit -m "fix: typo" --amend to update.', ['git commit -m "fix: typo" --amend']],
    ['أمر بلا أعلام', 'Run npm install before building.', ['npm install']],
    ['npx مع الحزمة', 'Try npx vitest --run today.', ['npx vitest --run']],
    ['إشارات #123 وowner/repo#12', 'Fixes #123 and cf. octo/hello#12.', ['#123', 'octo/hello#12']],
    ['إشارة مستخدم وفريق', 'Thanks @octocat, ping @github/docs-team.', ['@octocat', '@github/docs-team']],
    ['بصمة SHA قصيرة وطويلة', 'Reverted in 3f2a9c1 (was 0123456789abcdef0123456789abcdef01234567).', ['3f2a9c1', '0123456789abcdef0123456789abcdef01234567']],
    ['مقطع كود مضمّن بحدوده', 'Call `foo(bar)` or ``a ` b`` safely.', ['`foo(bar)`', '``a ` b``']],
  ])('%s', (_name, input, expected) => {
    expect(originals(input, [])).toEqual(expected);
  });

  it('الكتلة المسوّرة تُحمى كاملة بسياجها، وغير المغلقة حتى نهاية النص', () => {
    expect(originals('Before\n```ts\nconst a = 1;\n```\nAfter', [])).toEqual(['```ts\nconst a = 1;\n```']);
    expect(originals('Before\n~~~\nstill code\nmore', [])).toEqual(['~~~\nstill code\nmore']);
  });

  it('علامة اقتباس عكسي غير مغلقة تبقى نصًا ولا تبتلع ما بعدها', () => {
    expect(originals('An odd ` mark and src/a.ts here', [])).toEqual(['src/a.ts']);
  });

  it('المصطلحات: الأطول أولًا وبحدود كلمة وبحساسية الأحرف', () => {
    const { masked } = maskText('GitHub Actions on GitHub uses git, not Gitter or github.', { terms: ['GitHub', 'GitHub Actions', 'Git'] });
    expect(masked).toBe('⟦TERM_0⟧ on ⟦TERM_1⟧ uses git, not Gitter or github.');
  });

  it('القائمة الافتراضية تحمي GitHub وREADME، وتمرير قائمة فارغة يعطّل المصطلحات', () => {
    expect(originals('Open the README on GitHub.')).toEqual(['README', 'GitHub']);
    expect(originals('Open the README on GitHub.', [])).toEqual([]);
  });

  it('مصطلح داخل رابط أو مسار لا يُقتطع منه', () => {
    expect(originals('Visit https://github.com/octo/README now')).toEqual(['https://github.com/octo/README']);
    expect(originals('Edit docs/README.md')).toEqual(['docs/README.md']);
  });
});

describe('ما لا يُحمى (اكتشاف محافظ)', () => {
  it.each([
    'Use and/or choose input/output pairs, true/false.',
    'We use git for version control and make sure it works.',
    'See owner/repo for the code.',
    'Choose docs or src, not build or test, as plain words.',
    'It costs 50% / 60%, e.g. later... or i.e. never.',
    'Version 1.2 shipped in 2024 with #hashtag and 12345 items.',
  ])('%s', (input) => {
    expect(originals(input, [])).toEqual([]);
  });
});

describe('المقاطع المحددة والأقواس الأصلية', () => {
  it('عنصر محدد النوع يُقنَّع حرفيًا ولو بدا نثرًا، والنص حوله يُكتشف فيه المحمي', () => {
    const { masked, expectedTokens } = maskSegments(['Press ', { type: 'CODE', value: 'Ctrl + C' }, ' to copy ./a.txt'], { terms: [] });
    expect(masked).toBe('Press ⟦CODE_0⟧ to copy ⟦PATH_1⟧');
    expect(expectedTokens.get('⟦CODE_0⟧')?.original).toBe('Ctrl + C');
  });

  it('عنصر محدد فارغ لا يُنشئ رمزًا', () => {
    const { masked, expectedTokens } = maskSegments(['a', { type: 'CODE', value: '' }, 'b']);
    expect(masked).toBe('ab');
    expect(expectedTokens.size).toBe(0);
  });

  it('أقواس الرمز الواردة في النص الأصلي تُحمى حرفيًا فلا تلتبس بالمحقونة', () => {
    const { masked, expectedTokens } = maskText('Literal ⟦CODE_0⟧, a lone ⟧ closer, then ⟦ opener at the end', { terms: [] });
    expect(masked).toBe('Literal ⟦CODE_0⟧, a lone ⟦CODE_1⟧ closer, then ⟦CODE_2⟧ opener at the end');
    expect([...expectedTokens.values()].map((r) => r.original)).toEqual(['⟦CODE_0⟧', '⟧', '⟦']);
  });
});

describe('الاستعادة بلا ترجمة تعيد النص حرفيًا', () => {
  it.each([
    'Run `npm test`, then edit src/core/index.ts (see #42 and @octocat) on GitHub.',
    'Plain English only.',
    'Fence:\n```sh\nnpm ci\n```\nand https://example.com/x?y=1&z=2.',
    'Literal ⟦CODE_0⟧ stays as written.',
  ])('%j', (input) => {
    const { masked, expectedTokens } = maskText(input);
    expect(partsToText(unmask(masked, expectedTokens))).toBe(input);
  });
});
