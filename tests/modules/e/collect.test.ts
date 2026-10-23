// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-01 (AC-E1) على مستوى الوحدة: الحزمة المولَّدة من العينة المرجعية (fixture-pr-complex.html بوصف وتعليقات، fixture-pr-context.html)
// تحوي المستودع والرابط، والفرع والالتزام، والعنوان والوصف، والتعليقات المختارة، ونتائج الفحوص ومقتطف الخطأ، ومقتطفات الأدلة، بقيمها
// الصحيحة؛ ومعها صفحة مشكلة حقيقية محفوظة وصفحة مهمة Actions حقيقية محفوظة. لا شبكة: الجمع من DOM وحده.
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GAPS_HEADING, ITEM, availableItems, blockText, buildBundle, collectContext, fence } from '../../../src/modules/e/builder';
import type { Snippet } from '../../../src/modules/e/builder';
import { E_FIXTURE, ROOT, builderSelectors, loadFile, pageAt } from './helpers';

const PR = 'https://github.com/octo/demo/pull/4242';
const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';

function prSource() {
  loadFile(E_FIXTURE);
  return collectContext(document, builderSelectors(), pageAt(PR), 'pr');
}

const EVIDENCE: Snippet = { id: '1', text: "src/settings/panel.tsx:3:10  error  'useMemo' is defined but never used", where: 'تعليق reviewer-a' };

describe('الجمع من صفحة الطلب المرجعية', () => {
  it('المستودع والرابط والفرع والالتزام والعنوان والوصف من الصفحة', () => {
    const s = prSource();
    expect(s.kind).toBe('pr');
    expect(s.repo).toBe('octo/demo');
    expect(s.url).toBe(PR);
    expect(s.number).toBe(4242);
    expect(s.branch).toEqual({ head: 'feature/ui-refresh', base: 'main', headSha: HEAD });
    expect(s.title).toBe('feat: refresh the settings UI');
    expect(s.description).toContain('Refresh the settings UI and move the theme toggle into the header.');
    expect(s.description).toContain('- Replace the legacy panel with the new layout.');
    expect(s.description).toContain('npm run lint && npm test');
  });

  it('التعليقات الظاهرة بأصحابها وأوقاتها؛ والمطوي لا يُجمع ويُعلن، والعناصر غير المحمّلة تُعلن بعددها', () => {
    const s = prSource();
    expect(s.comments.map((c) => [c.author, c.at])).toEqual([
      ['reviewer-a', '2026-10-21T10:15:00Z'],
      ['octo-dev', '2026-10-22T12:30:00Z'],
    ]);
    expect(s.comments[0]?.text).toBe('The lint job fails on src/settings/panel.tsx: unused import useMemo.');
    expect(JSON.stringify(s.comments)).not.toContain('Buy followers');
    expect(s.gaps.filter((g) => g.part === 'التعليقات').map((g) => g.kind)).toEqual(['collapsed', 'not-loaded']);
    expect(s.gaps.find((g) => g.kind === 'collapsed')?.reason).toContain('spam-bot');
    expect(s.gaps.find((g) => g.kind === 'not-loaded' && g.part === 'التعليقات')?.reason).toContain('12 عنصرًا');
  });

  it('نتائج الفحوص بتصنيفها والإلزامي، ومقتطف الخطأ من الفاشلة، والقائمة المطوية (9 من 12) معلنة', () => {
    const s = prSource();
    expect(s.checks?.items).toHaveLength(9);
    const lint = s.checks?.items.find((i) => i.name === 'ci / lint (pull_request)');
    expect(lint).toMatchObject({ label: 'فاشل', failed: true, required: true, detail: 'Failing after 4m' });
    expect(s.checks?.summary).toContain('فاشل 2');
    expect(s.errorExcerpt).toEqual(['ci / lint (pull_request): Failing after 4m', 'preview-deploy: Failing after 1m']);
    expect(s.gaps.find((g) => g.part === 'نتائج الفحوص')).toMatchObject({ kind: 'collapsed' });
    expect(s.gaps.find((g) => g.part === 'نتائج الفحوص')?.reason).toContain('قُرئ 9 من 12');
    expect(s.gaps.find((g) => g.part === 'مقتطف الخطأ')).toMatchObject({ kind: 'not-loaded' });
  });
});

describe('TEST-CTX-01: كل أقسام الحزمة بقيمها', () => {
  it('الحزمة الكاملة على العينة المرجعية', () => {
    const s = prSource();
    const snippets = [EVIDENCE];
    const all = new Set(availableItems(s, snippets));
    const { text } = buildBundle(s, snippets, all, undefined, Date.UTC(2026, 9, 24, 9, 30));
    expect(text).toContain('# حزمة سياق: feat: refresh the settings UI');
    expect(text).toContain('- المستودع: `octo/demo` — https://github.com/octo/demo');
    expect(text).toContain(`- طلب الدمج #4242: ${PR}`);
    expect(text).toContain('- الفرع: `feature/ui-refresh` ← `main`');
    expect(text).toContain(`- التزام الرأس: \`${HEAD}\``);
    expect(text).toContain('## العنوان والوصف');
    expect(text).toContain('> Refresh the settings UI and move the theme toggle into the header.');
    expect(text).toContain('## التعليقات المختارة (2 من 2)');
    expect(text).toContain('### reviewer-a — 2026-10-21T10:15:00Z');
    expect(text).toContain('## نتائج الفحوص (');
    expect(text).toContain('- ✗ فاشل: `ci / lint (pull_request)` — إلزامي — Failing after 4m');
    expect(text).toContain('- • ناجح: `EasyCLA` — إلزامي — Successful');
    expect(text).toContain('## مقتطف الخطأ');
    expect(text).toContain('ci / lint (pull_request): Failing after 4m');
    expect(text).toContain('## مقتطفات الأدلة (1)');
    expect(text).toContain('### 1. من تعليق reviewer-a');
    expect(text).toContain("'useMemo' is defined but never used");
    expect(text).toContain(`## ${GAPS_HEADING}`);
    expect(text).toContain('2026-10-24 09:30 UTC');
    // ترتيب الأقسام ثابت.
    const order = ['## العنوان والوصف', '## التعليقات المختارة', '## نتائج الفحوص', '## مقتطف الخطأ', '## مقتطفات الأدلة', `## ${GAPS_HEADING}`].map((h) => text.indexOf(h));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > (order[k - 1] ?? 0)))).toBe(true);
  });

  it('صفحة مشكلة حقيقية محفوظة (React): العنوان والوصف وسبعة تعليقات بأصحابها، بلا فرع ولا فحوص', () => {
    loadFile(path.join(ROOT, 'fixtures/spikes/gh-issue-etos-1.html'));
    const s = collectContext(document, builderSelectors(), pageAt('https://github.com/salktbi902/etos/issues/1'), 'issue');
    expect(s.title).toBe('Local Debug: إعادة الاتصال التلقائي + البقاء متصلاً في الخلفية');
    expect(s.description?.length).toBeGreaterThan(20);
    expect(s.comments.length).toBeGreaterThan(0);
    expect(s.comments.every((c) => c.author && c.text)).toBe(true);
    expect(s.branch).toBeNull();
    expect(s.checks).toBeNull();
    const { text } = buildBundle(s, [], new Set(availableItems(s, [])));
    expect(text).toContain('# حزمة سياق: Local Debug');
    expect(text).toContain(`- المشكلة #1: https://github.com/salktbi902/etos/issues/1`);
    expect(text).not.toContain('## نتائج الفحوص');
  });

  it('صفحة مهمة Actions حقيقية محفوظة: الخطوات ونتائجها، ومقتطف الخطأ من التنبيهات، وسجل الخطوة الفاشلة غير محمّل معلن', () => {
    loadFile(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'));
    const href = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
    const s = collectContext(document, builderSelectors(), pageAt(href), 'job');
    expect(s.repo).toBe('microsoft/vscode');
    expect(s.checks?.items.length).toBeGreaterThan(5);
    expect(s.checks?.items.some((i) => i.failed)).toBe(true);
    expect(s.errorExcerpt.length).toBeGreaterThan(0);
    expect(s.errorExcerpt.join('\n')).toMatch(/\[failure\]/);
    expect(s.gaps.some((g) => g.part === 'مقتطف الخطأ')).toBe(true);
    const { text } = buildBundle(s, [], new Set(availableItems(s, [])));
    expect(text).toContain('## مقتطف الخطأ');
    expect(text).toContain(`- مهمة Actions: ${href}`);
  });
});

describe('الكتل والسياج والجمع بلا شبكة', () => {
  it('blockText: أسطر للكتل وبنود وشيفرة كما هي، بلا عناصر مخفية', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>One <code>x</code></p><ul><li>a</li><li>b</li></ul><pre>  keep\n  spaces</pre><span aria-hidden="true">hidden</span><p>Two<br>lines</p>';
    expect(blockText(el)).toBe('One x\n\n- a\n- b\n\n  keep\n  spaces\n\nTwo\nlines');
  });

  it('السياج أطول من أي ``` داخل النص', () => {
    expect(fence('a ``` b')).toBe('````\na ``` b\n````');
    expect(fence('plain')).toBe('```\nplain\n```');
  });

  it('الجمع والبناء لا يطلبان شيئًا من الشبكة', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const s = prSource();
    buildBundle(s, [EVIDENCE], new Set(availableItems(s, [EVIDENCE])));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('معرّفات العناصر متاحة بحسب المجموع', () => {
    const s = prSource();
    expect(availableItems(s, [EVIDENCE])).toEqual([ITEM.repo, ITEM.branch, ITEM.title, ITEM.description, ...s.comments.map((c) => ITEM.comment(c.id)), ITEM.checks, ITEM.error, ITEM.snippet('1')]);
  });
});
