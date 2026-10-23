// AC-C2 (مجموعة الاختبار كلها): الكود والمسارات والروابط والمصطلحات المحمية في النص المعروض تطابق الأصل.
// فقرات واقعية من README وتعليقات ووصف مشكلات وPR؛ المحرك الوهمي يترجم الكلمات خارج الرموز ويعكس ترتيب الجمل.
import { describe, expect, it } from 'vitest';
import { translateProtected } from '../../../../src/modules/c/masking/fail-safe';
import { maskText } from '../../../../src/modules/c/masking/mask';
import { recordingEngine, translateWords } from './engines';

const CORPUS: readonly string[] = [
  'Install the dependencies with `npm ci`, then run `npm run build` to produce dist/chromium and dist/firefox.',
  'This PR fixes #482 and supersedes octo/hello#12. Thanks @octocat and @github/docs-team for the review!',
  'See https://docs.github.com/en/actions/using-workflows (section "Triggering a workflow") for the full list.',
  'Edit .github/workflows/ci.yml and package.json, then commit with git commit -m "ci: pin node" --amend.',
  'The README describes the CLI; open README.md and CONTRIBUTING.md before sending a pull request.',
  'Run `git rebase main` on your branch. If it conflicts, resolve in src/core/registry.ts and run git rebase --continue.',
  'Use ./scripts/load-check.mjs from the repo root; on Windows use C:\\tools\\load-check.mjs instead.',
  'Reverted in 3f2a9c1 because the build on GitHub Actions failed. Details: https://github.com/octo/hello/actions/runs/42.',
  'Contact maintainers at security@example.com; do not file a public issue for vulnerabilities.',
  'The function `parse(input)` returns `null` when the stream is empty, and throws otherwise.',
  'Before:\n```ts\nconst a = 1;\n```\nAfter the change, `a` is read from ~/.config/app/settings.json.',
  'Nothing special here, just a plain sentence with no code at all.',
  'Please keep ⟦this⟧ literal marker exactly as written and also `code`.',
  'Fixes #1, #2 and #3. Closes #4.',
];

const protectedOriginals = (text: string): string[] => [...maskText(text).expectedTokens.values()].map((r) => r.original);

describe('AC-C2 — مجموعة الاختبار كلها', () => {
  it.each(CORPUS.map((text, i) => [i + 1, text] as const))('فقرة %i: المحمي في المعروض يطابق الأصل', async (_n, text) => {
    const engine = recordingEngine((input) => translateWords(input));
    const result = await translateProtected(text, engine.translate);
    expect(result.status).toBe('translated');
    if (result.status !== 'translated') return;

    const expected = protectedOriginals(text);
    const shown = result.parts.filter((p) => p.kind === 'protected').map((p) => p.value);
    expect([...shown].sort()).toEqual([...expected].sort());
    for (const original of expected) expect(result.text).toContain(original);
    // وما عداه ترجمه المحرك الوهمي: لا إنجليزية متبقية خارج العناصر المحمية.
    let rest = result.text;
    for (const original of expected) rest = rest.replace(original, '');
    expect(rest).not.toMatch(/[A-Za-z]/);
  });

  it('الاستعادة بلا ترجمة تعيد كل فقرة حرفيًا (لا فقد ولا إضافة)', async () => {
    for (const text of CORPUS) {
      const result = await translateProtected(text, async (masked) => masked);
      expect(result.status).toBe('translated');
      if (result.status === 'translated') expect(result.text).toBe(text);
    }
  });

  it('محرك يعكس ترتيب الجمل يقبله الفاحص ويطابق المحمي الأصل', async () => {
    const text = 'Run `npm ci` first. Then open src/app.ts. See #5.';
    const reverse = async (masked: string): Promise<string> => masked.split(/(?<=\.)\s+/).reverse().join(' ');
    const result = await translateProtected(text, reverse, { terms: [] });
    expect(result.status).toBe('translated');
    if (result.status === 'translated') expect(result.parts.filter((p) => p.kind === 'protected').map((p) => p.value).sort()).toEqual(['#5', '`npm ci`', 'src/app.ts'].sort());
  });
});
