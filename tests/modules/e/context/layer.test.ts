// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-05 (AC-E6) على مستوى الوحدة: طبقة السياق المشتركة على عينات أربع (مشكلة، طلب دمج، فحوص، ملف/فروق) تنتج بنية سياق واحدة فيها ما
// جُمع وما تعذّر جمعه وما اقتُطع بعدد أسطره؛ ويمرّ كل محتوى بالمنقّح قبل أي استخدام (رموز وهمية في كل جزء تُحجب كلها في mask، وتبقى
// معدودة في flag)؛ والإضافات (سجل مقروء، قراءة API) تدخل بقواعدها ولا يتوقف الجمع على غيابها؛ ولا شبكة. والفحص الساكن في static.test.ts.
// كل الرموز الوهمية هنا تُركَّب وقت التشغيل من أجزاء، فلا يظهر رمز بصيغته الكاملة في المستودع.
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSettingsRegistry } from '../../../../src/core';
import {
  CONTEXT_LIMITS,
  ITEM,
  LINE_LIMIT_DEFAULT,
  LINE_LIMIT_KEY,
  PART_KEYS,
  buildContext,
  contextItems,
  defineContextSettings,
  isLineLimit,
  limitsOf,
  maskOf,
  pageKind,
  prepareContext,
} from '../../../../src/modules/e/context';
import type { Snippet } from '../../../../src/modules/e/context';
import { scanText } from '../../../../src/modules/e/privacy-check';
import { ROOT, loadFile, pageAt } from '../helpers';
import { HEAD, LEAKY_LOG, LEAKY_SNIPPET, LOG, NOW, SAMPLES, apiFor, contextOf, fake, plantSecrets, selectors, sourceOf } from './samples';

describe('TEST-CTX-05: بنية سياق واحدة على العينات الأربع', () => {
  it.each(Object.values(SAMPLES))('$name: البنية نفسها بأجزائها وجردها وفجواتها وتقرير أسرارها وحدودها', (sample) => {
    const ctx = contextOf(sample);
    expect(Object.keys(ctx).sort()).toEqual(['collectedAt', 'gaps', 'inventory', 'kind', 'limits', 'parts', 'secrets', 'subject', 'url'].sort());
    expect(ctx.kind).toBe(sample.kind);
    expect(Object.keys(ctx.inventory)).toEqual([...PART_KEYS]);
    // ما جُمع بعدده، وما لم يصل بسببه (لا جزء بلا حالة ولا سبب فارغ).
    const states = Object.values(ctx.inventory);
    expect(states.some((s) => s.state === 'collected')).toBe(true);
    expect(states.some((s) => s.state === 'missing')).toBe(true);
    for (const s of states) {
      if (s.state === 'collected') expect(s.count).toBeGreaterThan(0);
      else expect(s.reason.length).toBeGreaterThan(5);
    }
    expect(ctx.limits).toEqual(CONTEXT_LIMITS);
    expect(ctx.secrets).toMatchObject({ policy: 'mask' });
    expect(ctx.collectedAt).toBe(NOW);
  });

  it('طلب دمج: المصدر والوصف والتعليقات والفحوص (9 من 12 معلنة) ومقتطف الخطأ والحالة والموانع والتغييرات من الترويسة والروابط؛ والسجل لم يصل بسببه', () => {
    const ctx = contextOf(SAMPLES.pr);
    const { inventory: inv, parts } = ctx;
    expect(inv.source).toEqual({ state: 'collected', count: 1, note: null });
    expect(inv.comments).toMatchObject({ state: 'collected', count: 2 });
    expect(inv.checks).toMatchObject({ state: 'collected', count: 9 });
    expect(inv.checks.state === 'collected' && inv.checks.note).toContain('قُرئ 9 من 12');
    expect(inv.error).toMatchObject({ state: 'collected', count: 2 });
    expect(inv.status).toMatchObject({ state: 'collected', count: 5 });
    expect(inv.changes).toMatchObject({ state: 'collected', count: 12 });
    expect(inv.log).toEqual({ state: 'missing', reason: expect.stringContaining('لا تعرضه صفحة الطلب') });
    expect(inv.snippets).toMatchObject({ state: 'missing' });
    expect(parts.branch).toEqual(['- الفرع: `feature/ui-refresh` ← `main`', `- التزام الرأس: \`${HEAD}\``]);
    expect(parts.failedChecks?.body).toEqual(['- ✗ فاشل: `ci / lint (pull_request)` — إلزامي — Failing after 4m', '- ✗ فاشل: `preview-deploy` — Failing after 1m']);
    expect(parts.status?.body).toEqual(expect.arrayContaining(['- حالة الطلب: مفتوح', '- **يمنع**: تعارض مع فرع الهدف يجب حله', '- مصدر الأدلة: الصفحة وحدها.']));
    expect(parts.changes?.detail).toBe('12 ملفًا، +1204، −87');
    expect(parts.links?.body).toEqual([
      '- طلب الدمج #4242: https://github.com/octo/demo/pull/4242',
      `- التزام الرأس: https://github.com/octo/demo/commit/${HEAD}`,
      '- تعليق reviewer-a: https://github.com/octo/demo/pull/4242#issuecomment-1001',
      '- تعليق octo-dev: https://github.com/octo/demo/pull/4242#issuecomment-1003',
    ]);
    // ما تعذّر جمعه من الصفحة: المطوي وغير المحمّل والقائمة المطوية ونص السجل.
    expect(ctx.gaps.map((g) => [g.part, g.kind])).toEqual([
      ['التعليقات', 'collapsed'],
      ['التعليقات', 'not-loaded'],
      ['مقتطف الخطأ', 'not-loaded'],
      ['نتائج الفحوص', 'collapsed'],
    ]);
    // المطوي لا يدخل البنية بشيء من نصه.
    expect(JSON.stringify(ctx)).not.toContain('Buy followers');
  });

  it('مشكلة: المصدر والوصف وسبعة تعليقات؛ والفحوص والخطأ والسجل والتغييرات والحالة «لم تصل» بسبب نوع الصفحة', () => {
    const { inventory: inv, parts } = contextOf(SAMPLES.issue);
    expect(inv.comments).toMatchObject({ state: 'collected', count: 7 });
    expect(inv.checks).toEqual({ state: 'missing', reason: 'صفحة المشكلة لا تحمل فحوصًا' });
    expect(inv.log).toEqual({ state: 'missing', reason: 'لا سجل فحص في صفحة المشكلة' });
    expect(inv.changes).toEqual({ state: 'missing', reason: 'صفحة المشكلة لا تحمل تغييرات' });
    expect(inv.status).toEqual({ state: 'missing', reason: 'حالة الدمج وموانعه تخص صفحة طلب الدمج' });
    expect(parts.checks).toBeNull();
    expect(parts.branch).toEqual([]);
    expect(parts.repo).toContain('- المشكلة #1: https://github.com/salktbi902/etos/issues/1');
  });

  it('فحوص (صفحة مهمة): الخطوات (20) والفاشلة ومقتطف الخطأ من التنبيه ورابط سجل الخطوة الفاشلة كما تعرضه الصفحة؛ والسجل محجوب بسببه', () => {
    const { inventory: inv, parts, gaps } = contextOf(SAMPLES.checks);
    expect(inv.checks).toMatchObject({ state: 'collected', count: 20 });
    expect(parts.failedChecks?.detail).toBe('1 من 20');
    expect(parts.error?.body[0]).toContain('[failure] (الخطوة 14: Compile & Hygiene، السطر 2364) Process completed with exit code 1.');
    expect(inv.log).toEqual({ state: 'missing', reason: 'نص السجل محجوب عن غير المسجَّل في هذه الصفحة' });
    expect(gaps).toEqual([{ part: 'مقتطف الخطأ', kind: 'unavailable', reason: 'نص السجل محجوب عن غير المسجَّل في هذه الصفحة' }]);
    expect(parts.links?.body).toContain('- سجل 14. Compile & Hygiene: https://github.com/microsoft/vscode/commit/a296c13d42e2e978f361650a6f42bc33ee86f141/checks/120256773911/logs/14');
    expect(inv.comments).toEqual({ state: 'missing', reason: 'لا نقاش في صفحة المهمة' });
  });

  it('ملف/فروق (مقارنة Rails): الطرفان والملف بنوعه وأسطره وأسطر الفروق نفسها؛ وتخطيط React بلا أسطر يعلن ذلك فجوةً بعدد الملفات', () => {
    const { inventory: inv, parts, gaps } = contextOf(SAMPLES.diff);
    expect(parts.branch).toEqual(['- المقارنة: `octocat-patch-1` ← `master`']);
    expect(inv.changes).toEqual({ state: 'collected', count: 1, note: null });
    expect(parts.changes?.body).toEqual(['- `README` (توثيق، +1 −1)', '', '```diff\ndiff --git a/README b/README\n@@ -1 +1 @@\n-Hello World!\n+Hello world!\n```']);
    expect(gaps).toEqual([]);
    const react = contextOf({ ...SAMPLES.diff, file: path.join(ROOT, 'tests/modules/d/fixtures/fixture-compare-react-branches.html'), href: 'https://github.com/octo/demo/compare/main...feature%2Fui-refresh' });
    expect(react.inventory.changes).toMatchObject({ state: 'collected', count: 30 });
    expect(react.gaps).toEqual([expect.objectContaining({ part: 'أسطر الفروق', kind: 'not-loaded', reason: expect.stringContaining('لـ30 من 30 ملفًا') })]);
    expect(react.parts.changes?.body.join('\n')).not.toContain('```diff');
  });
});

describe('TEST-CTX-05: ما اقتُطع يُعلن بعدد أسطره ولا يُقتطع شيء بصمت (PP-03)', () => {
  const longBody = () => {
    const body = selectors().resolve(document, 'e.body')?.element as Element;
    const pre = document.createElement('pre');
    pre.textContent = Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join('\n');
    body.replaceChildren(pre);
  };

  it('الحد الافتراضي 400 سطر لكل قسم: وصف من 450 سطرًا يُقتطع إلى 400 ويُعلن «حُذف 50 من 450»', () => {
    const ctx = contextOf(SAMPLES.pr, {}, {}, longBody);
    expect(LINE_LIMIT_DEFAULT).toBe(400);
    expect(ctx.gaps.find((g) => g.part === 'الوصف')).toEqual({ part: 'الوصف', kind: 'truncated', reason: 'بحد 400 سطرًا', cut: { lines: 50, of: 450 } });
    const quoted = (ctx.parts.description?.body.at(-1) ?? '').split('\n');
    expect(quoted).toHaveLength(400);
    expect(quoted.at(-1)).toBe('> line 400');
  });

  it('حدود أضيق: كل كتلة طويلة (الوصف والتعليقات والخطأ والمقتطف والسجل والفروق) تُقتطع وتُعلن بعددها؛ ولا اقتطاع بلا بند', () => {
    const snippet: Snippet = { id: '1', text: 'a\nb\nc\nd\ne', where: 'الصفحة' };
    const pr = contextOf(SAMPLES.pr, { log: { text: LOG } }, { limits: limitsOf(1), snippets: [snippet] });
    const cut = pr.gaps.filter((g) => g.kind === 'truncated');
    expect(cut.map((g) => g.part)).toEqual(expect.arrayContaining(['الوصف', 'تعليق octo-dev', 'مقتطف الخطأ', 'مقتطف 1', 'مقتطفات السجل']));
    for (const g of cut) {
      expect(g.reason).toBe('بحد 1 سطرًا');
      expect(g.cut?.lines).toBe((g.cut?.of ?? 0) - 1);
    }
    const diff = contextOf(SAMPLES.diff, {}, { limits: { changes: 2 } });
    expect(diff.gaps).toEqual([{ part: 'أسطر الفروق', kind: 'truncated', reason: 'بحد 2 سطرًا', cut: { lines: 2, of: 4 } }]);
  });

  it('الحد إعداد قابل للضبط: مفتاحه وقيمته الافتراضية ومجاله', () => {
    const registry = createSettingsRegistry(defineContextSettings);
    expect(registry.get(LINE_LIMIT_KEY)).toMatchObject({ key: LINE_LIMIT_KEY, default: 400 });
    expect([isLineLimit(400), isLineLimit(19), isLineLimit(5001), isLineLimit(40.5)]).toEqual([true, false, false, false]);
    expect(limitsOf(120)).toEqual({ description: 120, comment: 120, error: 120, snippet: 120, log: 120, changes: 120 });
  });
});

describe('TEST-CTX-05: يمرّ كل محتوى بالمنقّح قبل أي استخدام', () => {
  const build = (secrets: 'mask' | 'flag') =>
    contextOf(SAMPLES.pr, { log: { text: LEAKY_LOG } }, { snippets: [LEAKY_SNIPPET], secrets }, plantSecrets);

  it('mask (الافتراضي): لا يبقى في البنية كلها موضع مطابق للقائمة، وكل محجوب معدود بجزئه ونمطه', () => {
    const ctx = build('mask');
    expect(scanText(JSON.stringify(ctx))).toEqual([]);
    const parts = new Set(ctx.secrets.hits.map((h) => h.part));
    for (const part of ['العنوان', 'الوصف', 'التعليقات', 'نتائج الفحوص', 'مقتطف الخطأ', 'مقتطفات الأدلة', 'الحالة والموانع', 'السجل']) expect(parts, part).toContain(part);
    expect(ctx.secrets.total).toBe(ctx.secrets.hits.reduce((n, h) => n + h.count, 0));
    expect(ctx.parts.description?.body[0]).toBe(`**feat: refresh the settings UI ${maskOf('aws-access-key')}**`);
    expect(ctx.parts.snippets?.body.join('\n')).toContain(`GH_TOKEN=${maskOf('github-token')}`);
    expect(ctx.parts.log?.body.join('\n')).toContain(`GITHUB_PAT=${maskOf('github-fine-grained')}`);
    // ورمز السطر 457 في السجل خارج ما يدخل البنية أصلًا (لا رسالة خطأ حوله): لا يُعدّ ولا يظهر.
    expect(JSON.stringify(ctx)).not.toMatch(/ghp_A1b2/);
  });

  it('flag (حزمة السياق، AD-28): النص كما هو والمواضع معدودة بالعدد نفسه', () => {
    const masked = build('mask');
    const flagged = build('flag');
    expect(flagged.secrets.policy).toBe('flag');
    expect(flagged.secrets.total).toBe(masked.secrets.total);
    expect(flagged.secrets.hits).toEqual(masked.secrets.hits);
    const text = JSON.stringify(flagged.parts);
    for (const token of [fake.aws, fake.slack, fake.bearer, fake.ghs, fake.ghp, fake.pat]) expect(text, token.slice(0, 6)).toContain(token);
    expect(text).not.toContain('[محجوب:');
  });

  it('ما لم يُختر لا يُعدّ ولا يدخل: إلغاء التعليقات والمقتطف يُسقط مرصوداتهما', () => {
    const source = sourceOf(SAMPLES.pr, {}, plantSecrets);
    const selected = new Set(contextItems(source, [LEAKY_SNIPPET]).filter((id) => !id.startsWith('comment:') && !id.startsWith('snippet:')));
    const ctx = buildContext(source, { snippets: [LEAKY_SNIPPET], selected });
    const parts = ctx.secrets.hits.map((h) => h.part);
    expect(parts).not.toContain('التعليقات');
    expect(parts).not.toContain('مقتطفات الأدلة');
    expect(ctx.inventory.comments).toEqual({ state: 'excluded', reason: 'لم يُختر' });
  });
});

describe('الإضافات: سجل مقروء وقراءة API (اختياريتان، ولا يتوقف الجمع على غيابهما)', () => {
  it('سجل ممرَّر في صفحة الطلب: الطبقات الثلاث (الرسائل بأسطرها، والسبب المثبت بنمطه، والاحتمالات موسومة) ويسقط إعلان «لم يُقرأ»', () => {
    const ctx = contextOf(SAMPLES.pr, { log: { text: LOG } });
    expect(ctx.inventory.log).toEqual({ state: 'collected', count: 4, note: null });
    expect(ctx.parts.log?.detail).toBe('قُرئ 500 سطرًا');
    expect(ctx.parts.log?.body[0]).toContain('> 481 | src/settings/panel.ts(42,7): error TS2322');
    const causes = ctx.parts.causes?.body.join('\n') ?? '';
    expect(causes).toContain('- موضع الفشل: كود الخروج 2 (السطر 490)');
    expect(causes).toContain('**سبب مثبت بنمط** «خطأ مترجم TypeScript»');
    expect(causes).toContain('**احتمال يحتاج تحققًا**');
    expect(ctx.gaps.some((g) => g.part === 'مقتطف الخطأ' && g.kind === 'not-loaded')).toBe(false);
  });

  it('سجل ممرَّر غيابُه بسببه في صفحة المهمة: يبقى إعلان الحجب الأخص، والتنبيهات تحلَّل وحدها موسومة', () => {
    const ctx = contextOf(SAMPLES.checks, { log: { text: null, unavailableReason: 'GitHub يحجب السجل عن غير المسجَّل (404)' } });
    expect(ctx.gaps).toEqual([{ part: 'مقتطف الخطأ', kind: 'unavailable', reason: 'نص السجل محجوب عن غير المسجَّل في هذه الصفحة' }]);
    expect(ctx.parts.log?.detail).toBe('السجل غير متاح: التنبيهات الظاهرة وحدها');
    expect(ctx.parts.log?.body[0]).toContain('(تنبيه)');
  });

  it('قراءة API لرأس الصفحة نفسه تدخل الفحوص والموانع بمصدرها ووقتها؛ ولرأس آخر لا تدخل (VR-03)', () => {
    const read = contextOf(SAMPLES.pr, { api: apiFor(HEAD) });
    expect(read.parts.checks?.body.join('\n')).toContain('`test-macOS`');
    expect(read.parts.status?.body).toContain('- مصدر الأدلة: الصفحة وGitHub API (قُرئت 2026-10-24 09:30 UTC).');
    expect(read.parts.status?.body.join('\n')).toContain('mergeable_state = dirty');
    const other = contextOf(SAMPLES.pr, { api: apiFor('0123456789abcdef0123456789abcdef01234567') });
    expect(other.parts.checks?.body.join('\n')).not.toContain('`test-macOS`');
    expect(other.parts.status?.body).toContain('- مصدر الأدلة: الصفحة وحدها.');
  });
});

describe('نوع الصفحة والمدخل الواحد وغياب الشبكة', () => {
  it('pageKind: طلب الدمج والمشكلة ومهمة Actions والفروق (مقارنة والتزام وملفات طلب)؛ وما سواها لا سياق له', () => {
    const kind = (type: string, href = 'https://github.com/o/r') => pageKind({ type: type as never, href });
    expect([kind('pr'), kind('issue'), kind('compare'), kind('commit'), kind('pr-files')]).toEqual(['pr', 'issue', 'diff', 'diff', 'diff']);
    expect(kind('actions-run', 'https://github.com/o/r/actions/runs/1/job/2')).toBe('job');
    expect([kind('actions-run', 'https://github.com/o/r/actions/runs/1'), kind('repo'), kind('pr-checks')]).toEqual([null, null, null]);
  });

  it('prepareContext يجمع ويبني لنوع الصفحة المكتشف، ويعيد null لصفحة بلا سياق', () => {
    loadFile(SAMPLES.pr.file);
    const ctx = prepareContext(document, selectors(), pageAt(SAMPLES.pr.href));
    expect(ctx?.kind).toBe('pr');
    expect(ctx?.subject).toBe('feat: refresh the settings UI');
    expect(prepareContext(document, selectors(), pageAt('https://github.com/octo/demo'))).toBeNull();
  });

  it('عناصر السياق: أجزاء الحزمة بترتيبها ثم الحالة والسجل والتغييرات', () => {
    const source = sourceOf(SAMPLES.pr, { log: { text: LOG } });
    const ids = contextItems(source, []);
    expect(ids.slice(-3)).toEqual([ITEM.status, ITEM.log, ITEM.changes]);
  });

  it('الجمع والتنقيح والبناء لا يطلبون شيئًا من الشبكة', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    for (const sample of Object.values(SAMPLES)) contextOf(sample, { log: { text: LOG } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
