// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// انحدار AD-28 بعد نقل الجمع والتنقيح والبناء إلى الطبقة المشتركة (T-11.2): نص الحزمة العامة والقوالب الأربعة (T-6.1 وT-6.2) وبنود قسمها
// الإلزامي، حرفًا بحرف، كما ولّدتها الشيفرة قبل النقل (`golden-bundle-templates.json` وُلِّد من `main` عند `b1dfb1a` قبل أي تعديل في MJ19).
// إعادة التوليد (لا تلزم إلا بقرار مالك يغيّر الأقسام): MJ_GOLDEN_WRITE=1 npx vitest run tests/modules/e/context/bundle-golden.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { availableItems, buildBundle, collectContext, ITEM } from '../../../../src/modules/e/builder';
import type { Snippet } from '../../../../src/modules/e/builder';
import { TEMPLATE_IDS, renderTemplate } from '../../../../src/modules/e/templates';
import { E_FIXTURE, ROOT, builderSelectors, loadFile, pageAt } from '../helpers';

const GOLDEN = path.join(ROOT, 'tests/modules/e/context/fixtures/golden-bundle-templates.json');
const NOW = Date.UTC(2026, 9, 24, 9, 30);
const EVIDENCE: Snippet = { id: '1', text: "src/settings/panel.tsx:3:10  error  'useMemo' is defined but never used", where: 'تعليق reviewer-a' };
const LONG: Snippet = { id: '2', text: Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\n'), where: 'سجل المهمة' };

type Case = { readonly name: string; readonly file: string; readonly href: string; readonly kind: 'pr' | 'issue' | 'job'; readonly snippets: readonly Snippet[]; readonly select?: (all: Set<string>) => Set<string>; readonly limits?: { description: number; comment: number; error: number; snippet: number } };

const PR = 'https://github.com/octo/demo/pull/4242';
const CASES: readonly Case[] = [
  { name: 'pr-all', file: E_FIXTURE, href: PR, kind: 'pr', snippets: [EVIDENCE, LONG] },
  {
    name: 'pr-no-checks-error',
    file: E_FIXTURE,
    href: PR,
    kind: 'pr',
    snippets: [EVIDENCE],
    select: (all) => new Set([...all].filter((id) => id !== ITEM.checks && id !== ITEM.error)),
  },
  { name: 'pr-none', file: E_FIXTURE, href: PR, kind: 'pr', snippets: [EVIDENCE], select: () => new Set() },
  { name: 'pr-tight-limits', file: E_FIXTURE, href: PR, kind: 'pr', snippets: [LONG], limits: { description: 3, comment: 1, error: 1, snippet: 5 } },
  { name: 'issue-all', file: path.join(ROOT, 'fixtures/spikes/gh-issue-etos-1.html'), href: 'https://github.com/salktbi902/etos/issues/1', kind: 'issue', snippets: [] },
  {
    name: 'job-all',
    file: path.join(ROOT, 'fixtures/logs/gh-job-failed.html'),
    href: 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911',
    kind: 'job',
    snippets: [EVIDENCE],
  },
];

function render(c: Case): Record<string, { text: string; gaps: unknown }> {
  loadFile(c.file);
  const source = collectContext(document, builderSelectors(), pageAt(c.href), c.kind);
  const all = new Set(availableItems(source, c.snippets));
  const selected = c.select ? c.select(all) : all;
  const out: Record<string, { text: string; gaps: unknown }> = { bundle: buildBundle(source, c.snippets, selected, c.limits, NOW) };
  for (const id of TEMPLATE_IDS) out[id] = renderTemplate(id, source, c.snippets, selected, c.limits, NOW);
  return JSON.parse(JSON.stringify(out)) as Record<string, { text: string; gaps: unknown }>;
}

describe('AD-28: الحزمة والقوالب الأربعة بعد النقل مطابقة حرفيًا لما قبله', () => {
  if (process.env.MJ_GOLDEN_WRITE === '1') {
    it('يكتب الملف المرجعي', () => {
      const golden = Object.fromEntries(CASES.map((c) => [c.name, render(c)]));
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
      fs.writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    });
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, { text: string; gaps: unknown }>>;
  it.each(CASES.map((c) => [c.name, c] as const))('%s: النص وبنود القسم الإلزامي كما كانت', (_name, c) => {
    const now = render(c);
    const before = golden[c.name];
    expect(Object.keys(now)).toEqual(Object.keys(before ?? {}));
    for (const key of Object.keys(now)) {
      expect(now[key]?.text, `${c.name}/${key}`).toBe(before?.[key]?.text);
      expect(now[key]?.gaps, `${c.name}/${key}`).toEqual(before?.[key]?.gaps);
    }
  });
});
