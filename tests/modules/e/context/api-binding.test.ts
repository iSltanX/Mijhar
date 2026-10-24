// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// AD-30 (H-1 وH-5، AC-D9 وAC-E9 (٤)) على الطبقة المشتركة قبل أي إرسال إلى المزوّد:
//  (١) قراءة API تُقبل بربطها بالمستودع والفرع والالتزام الظاهرة (compareBinding كبطاقة الحالة)؛ وقراءة لفرع آخر أو مستودع آخر أو التزام آخر لا
//      تدخل البنية ويُعلن أنها لالتزام آخر؛ وحالة وصول كل جزء في الحالة والجرد و«المعلومات الناقصة»، وما لم يُقرأ «غير معروف».
//  (٢) صيغة مفتاح المزوّد (sk-ant-…) نمطٌ في قائمة الحجب: تُحجب في البرومبت وتُرصد في الحزمة. والمفتاح هنا مختلَق يُركَّب وقت التشغيل.
// والمخرج بلا قراءة API لا يتغير: تحرسه bundle-golden.test.ts وtemplates.test.ts وprompts.test.ts كما هي.
import { describe, expect, it } from 'vitest';
import type { ApiPrData } from '../../../../src/modules/d/blockers';
import { buildContext, maskOf } from '../../../../src/modules/e/context';
import { SECRET_PATTERNS, scanText } from '../../../../src/modules/e/privacy-check';
import { MISSING_HEADING, promptFor, renderPrompt } from '../../../../src/modules/e/prompt-templates';
import { HEAD, NOW, SAMPLES, apiFor, contextOf, sourceOf } from './samples';

const OTHER_SHA = '0123456789abcdef0123456789abcdef01234567';

/** قراءة API للطلب المرجعي بربط معدَّل (مستودع أو فرع أو التزام غير الظاهر). */
function boundTo(change: Partial<ApiPrData['binding']>, headSha = HEAD): ApiPrData {
  const api = apiFor(headSha);
  return { ...api, binding: { ...api.binding, ...change } };
}

const missingOf = (ctx: ReturnType<typeof contextOf>): readonly string[] => renderPrompt('next-step', ctx).missing;

describe('AD-30 (١): ربط قراءة API في الطبقة المشتركة', () => {
  it('قراءة API للمستودع والفرع والالتزام الظاهرة تدخل، وتحمل البنية ربطها وحالة كل جزء، والجزء غير المقروء «غير معروف» في الجرد و«المعلومات الناقصة»', () => {
    const ctx = contextOf(SAMPLES.pr, { api: apiFor(HEAD) });
    const status = ctx.parts.status?.body.join('\n') ?? '';
    expect(ctx.parts.checks?.body.join('\n')).toContain('`test-macOS`');
    expect(status).toContain('- قراءة API لـ`octo/demo` على الفرع `feature/ui-refresh` والالتزام `22c15d5` (قُرئت 2026-10-24 09:30 UTC).');
    expect(status).toContain('  - بيانات الطلب من API (قابلية الدمج وحالته): قُرئت.');
    expect(status).toContain('  - الفحوص من API (ومنها ما تطويه الصفحة): قُرئت.');
    expect(status).toContain('  - الفحوص الإلزامية من حماية الفرع: غير متاحة لهذا المستودع (الفرع غير محمي)؛ قيمه غير معروف');
    const gap = ctx.gaps.find((g) => g.part === 'بيانات API');
    expect(gap?.reason).toContain('الفحوص الإلزامية من حماية الفرع');
    expect(gap?.reason).toContain('غير معروف');
    expect(ctx.inventory.status).toMatchObject({ state: 'collected' });
    expect(ctx.inventory.status.state === 'collected' ? ctx.inventory.status.note : null).toContain('غير معروف');
    expect(missingOf(ctx).some((m) => m.startsWith('- **بيانات API** (غير متاح): الفحوص الإلزامية من حماية الفرع') && m.includes('غير معروف'))).toBe(true);
  });

  it.each([
    ['فرع آخر', { branch: 'feature/other' }, HEAD, 'الفرع'],
    ['مستودع آخر', { repo: 'someone/fork' }, HEAD, 'المستودع'],
    ['التزام آخر', { commit: OTHER_SHA }, OTHER_SHA, 'الالتزام'],
  ] as const)('قراءة API لـ%s لا تدخل البنية (لا فحوصها ولا موانعها) ويُعلن أنها لالتزام آخر بما تغيّر', (_label, change, sha, field) => {
    const ctx = contextOf(SAMPLES.pr, { api: boundTo(change, sha) });
    expect(ctx.parts.checks?.body.join('\n')).not.toContain('`test-macOS`');
    expect(ctx.parts.status?.body.join('\n')).not.toContain('mergeable_state = dirty');
    expect(ctx.parts.status?.body).toContain('- مصدر الأدلة: الصفحة وحدها.');
    const gap = ctx.gaps.find((g) => g.part === 'بيانات API');
    expect(gap?.reason).toContain('قراءة API لالتزام آخر');
    expect(gap?.reason).toContain(`تغيّر ${field}`);
    expect(gap?.reason).toContain('غير معروف');
    expect(ctx.parts.status?.body.join('\n')).toContain('لالتزام آخر غير الظاهر الآن، فلم تدخل');
    expect(ctx.inventory.status.state === 'collected' ? ctx.inventory.status.note : null).toContain('لالتزام آخر');
    const { text } = renderPrompt('next-step', ctx);
    expect(text).toContain(`## ${MISSING_HEADING}`);
    expect(missingOf(ctx).some((m) => m.includes('قراءة API لالتزام آخر'))).toBe(true);
  });

  it('قراءة API فشل جزؤها الأول (رمز منتهٍ): لا يدخل منها شيء، وحالته بجملتها «غير معروف»، ولا يُطلب ما بعده', () => {
    const api = apiFor(HEAD);
    const failed: ApiPrData = {
      ...api,
      pull: { available: false, reason: 'رفض GitHub الرمز' },
      checks: { available: false, reason: 'لم تُطلب' },
      authenticated: true,
      access: { pull: { kind: 'expired', authenticated: true, status: 401 }, checks: { kind: 'not-requested', authenticated: true }, required: { kind: 'not-requested', authenticated: true } },
    };
    const ctx = contextOf(SAMPLES.pr, { api: failed });
    expect(ctx.parts.checks?.body.join('\n')).not.toContain('`test-macOS`');
    const gaps = ctx.gaps.filter((g) => g.part === 'بيانات API');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.reason).toMatch(/^بيانات الطلب من API \(قابلية الدمج وحالته\): رفض GitHub الرمز \(401\)/);
    expect(gaps[0]?.reason).toContain('غير معروف');
  });

  it('بلا قراءة API لا يتغير شيء: لا فجوة «بيانات API» ولا سطر ربط', () => {
    const ctx = contextOf(SAMPLES.pr);
    expect(ctx.gaps.some((g) => g.part === 'بيانات API')).toBe(false);
    expect(ctx.parts.status?.body.join('\n')).not.toContain('قراءة API');
    expect(ctx.inventory.status.state === 'collected' ? ctx.inventory.status.note : 'x').toBeNull();
  });
});

describe('AD-30 (٢): صيغة مفتاح المزوّد في قائمة الحجب', () => {
  // مختلَق يُركَّب وقت التشغيل؛ لا مفتاح بصيغته الكاملة في المستودع.
  const fakeKey = ['sk', 'ant', 'api03', 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-Dc_Ba9876543210'].join('-');

  it('النمطان السابع (Anthropic) والثامن (Google Gemini، MJ25) في القائمة المعرّفة، ويرصد المفتاح المختلَق وحده بموضعه', () => {
    expect(SECRET_PATTERNS.map((p) => p.id)).toEqual(['github-token', 'github-fine-grained', 'bearer', 'aws-access-key', 'private-key', 'slack-token', 'anthropic-key', 'gemini-key']);
    const text = `export ANTHROPIC_API_KEY=${fakeKey}\nsk-ant-short`;
    const found = scanText(text);
    expect(found).toHaveLength(1);
    expect(found[0]?.patternId).toBe('anthropic-key');
    expect(text.slice(found[0]?.start, found[0]?.end)).toBe(fakeKey);
  });

  it('يحجبه المنقّح المشترك في البرومبت (mask) ويرصده في الحزمة (flag)', () => {
    const plant = (): void => {
      const p = document.createElement('p');
      p.textContent = `ANTHROPIC_API_KEY=${fakeKey}`;
      document.querySelector('[data-testid="issue-body"] [data-testid="markdown-body"], #issue-body-viewer [data-testid="markdown-body"], .js-command-palette-pull-body .js-comment-body')?.append(p);
    };
    const source = sourceOf(SAMPLES.pr, {}, plant);
    expect(source.description).toContain(fakeKey);
    const prompt = promptFor('diagnose', source, { collectedAt: NOW });
    expect(prompt.text).not.toContain(fakeKey);
    expect(prompt.text).toContain(`ANTHROPIC_API_KEY=${maskOf('anthropic-key')}`);
    expect(scanText(prompt.text)).toEqual([]);
    const bundle = buildContext(source, { secrets: 'flag', collectedAt: NOW });
    expect(bundle.secrets.hits).toContainEqual(expect.objectContaining({ part: 'الوصف', patternId: 'anthropic-key', count: 1 }));
  });
});
