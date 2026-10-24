// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// F-04 (تدقيق ما قبل الإصدار): «مثبت من المصدر» لما نُقل من الصفحة وحده. نص القالب الذي كتبه مِجهَر (التعليمات وسطر الحدود و«المعلومات الناقصة»
// وسطر الختام) موجود فيما أُرسل لكنه ليس من الصفحة، فاقتباسه لا يُعدّ دليلًا من المصدر. وكذلك ما كتبه مِجهَر داخل الكتل المنقولة: العناوين
// والتسميات والتصنيف ووقت الجمع وما استنتجه محلل السجل والقيم البديلة وعلامات الحجب (الجولة الثانية).
import { h, render } from 'preact';
import { describe, expect, it } from 'vitest';
import { BOUNDARY_RULE, transported } from '../../src/core/guardrails/boundaries';
import { METHOD_NOTICE } from '../../src/modules/d/blockers/explain';
import { AnalysisBlock } from '../../src/modules/d/analysis/view';
import { ANALYSIS_SECTIONS } from '../../src/modules/d/analysis/sections';
import { parseAnalysis, prepareAnalysis } from '../../src/modules/e/provider';
import { PAGE_TEXT, buildContext, maskOf } from '../../src/modules/e/context';
import { CLOSING_LINE, NOT_RECEIVED_LINE } from '../../src/modules/e/prompt-templates/definitions';
import { LOG, NOW, SAMPLES, contextOf, plantSecrets, sourceOf } from '../modules/e/context/samples';

const reply = (evidence: string[]): string => JSON.stringify({ findings: [{ text: 'ادعاء', evidence }] });

describe('F-04: الدليل من المصدر هو ما نُقل من الصفحة لا نص القالب', () => {
  const ctx = contextOf(SAMPLES.pr, {}, { collectedAt: NOW });
  const prepared = prepareAnalysis(ctx, { template: 'diagnose', task: 'تحليل اصطناعي' });
  const page = document.body.textContent ?? '';

  it('اقتباس نص القالب (الختام وسطر الحدود وسطر «لم يصل» والعنوان) لا يُعدّ مثبتًا وإن ورد فيما أُرسل', () => {
    const template = [CLOSING_LINE, BOUNDARY_RULE, NOT_RECEIVED_LINE, 'المعلومات الناقصة'];
    for (const quote of template) {
      expect(prepared.prompt).toContain(quote);
      expect(page).not.toContain(quote);
    }
    const parsed = parseAnalysis(reply(template), prepared);
    expect(parsed.findings[0]?.evidence.map((e) => e.found)).toEqual([false, false, false, false]);
  });

  it('اقتباس ما نُقل من الصفحة حرفيًا يبقى مثبتًا', () => {
    expect(page).toContain(ctx.subject);
    const parsed = parseAnalysis(reply([ctx.subject]), prepared);
    expect(parsed.findings[0]?.evidence[0]).toEqual({ text: ctx.subject, found: true });
  });

  it('لا يعرض القسم نص القالب تحت «مثبت من المصدر»', () => {
    const parsed = parseAnalysis(reply([CLOSING_LINE, ctx.subject]), prepared);
    const host = document.createElement('div');
    document.body.append(host);
    const noop = () => {};
    render(
      h(AnalysisBlock, {
        def: ANALYSIS_SECTIONS.checks,
        state: { kind: 'result', parsed, prepared, outcome: { text: '', model: 'synthetic-model', provider: 'Synthetic', host: 'example.invalid', requestedAt: NOW, completedAt: NOW, stopReason: 'end_turn', usage: null } },
        health: 'healthy',
        onOpen: noop,
        onConfirm: noop,
        onCancel: noop,
        onStop: noop,
        onHide: noop,
        onSettings: noop,
      }),
      host,
    );
    const sourced = host.querySelector('[data-analysis-sourced]')?.textContent ?? '';
    expect(sourced).toContain(ctx.subject);
    expect(sourced).not.toContain(CLOSING_LINE);
    render(null, host);
    host.remove();
  });
});

describe('F-04 (الجولة الثانية): ما كتبه مِجهَر داخل الكتل المنقولة ليس دليلًا من الصفحة', () => {
  const ctx = contextOf(SAMPLES.pr, { log: { text: LOG } }, { collectedAt: NOW }, plantSecrets);
  const diagnose = prepareAnalysis(ctx, { template: 'diagnose', task: 'تحليل اصطناعي' });
  const next = prepareAnalysis(ctx, { template: 'next-step', task: 'تحليل اصطناعي' });
  const inBlocks = (prompt: string, text: string): boolean => transported(prompt).some((block) => block.includes(text));
  // كل اقتباس في ادعاء مستقل: حد الأدلة في الادعاء الواحد ستة.
  const verdicts = (prepared: typeof diagnose, quotes: readonly string[], verbatim = true): boolean[] => {
    if (verbatim) for (const q of quotes) expect(inBlocks(prepared.prompt, q), q).toBe(true);
    const text = JSON.stringify({ findings: quotes.map((q) => ({ text: 'ادعاء', evidence: [q] })) });
    return parseAnalysis(text, prepared).findings.map((f) => f.evidence[0]?.found ?? false);
  };

  it('صياغة مِجهَر في كتل «تشخيص الخطأ» (وقت الجمع وتسمية الموضوع والتصنيف وما استنتجه المحلل وترويسة الكتلة والرابط المركّب) لا تُعدّ دليلًا', () => {
    const collected = transported(diagnose.prompt).join('\n').match(/جُمع: [^\n]* من الصفحة المفتوحة/)?.[0] ?? 'غائب';
    const annotations = [
      collected,
      `الموضوع: ${ctx.subject}`,
      'فاشل: `ci / lint (pull_request)` — إلزامي',
      'موضع الفشل: كود الخروج 2',
      'فشلت ترجمة TypeScript بالخطأ TS2322',
      'احتمال يحتاج تحققًا',
      'قد يكون الخطأ من تغيير في هذا الالتزام',
      'Run npm run build — الأسطر',
      'من ترويسة الطلب؛ أسماء الملفات وأسطرها',
      `https://github.com/octo/demo/commit/${ctx.parts.verbatim.branch.at(-1) ?? ''}`,
    ];
    expect(verdicts(diagnose, annotations)).toEqual(annotations.map(() => false));
  });

  it('صياغة مِجهَر في «الحالة والموانع» (مصدر الأدلة وتنبيه المنهج وتسمية الحالة وعنوان المانع والتصنيف وموضع الدليل) لا تُعدّ دليلًا', () => {
    const annotations = ['مصدر الأدلة: الصفحة وحدها', METHOD_NOTICE, 'حالة الطلب: مفتوح', 'مراجعة معتمِدة مطلوبة قبل الدمج', 'التصنيف: فاشل', 'صندوق الدمج: «Review required»', 'فحوص لم تنجح وليست إلزامية بحسب صندوق الدمج'];
    expect(verdicts(next, annotations)).toEqual(annotations.map(() => false));
  });

  it('علامة الحجب نص مِجهَر: لا تُقتبس وحدها ولا ضمن قيمة، وما قبلها من القيمة دليل', () => {
    const marker = transported(diagnose.prompt).join('\n').match(/\[محجوب: [^\]]*\]/)?.[0] ?? 'غائب';
    expect(marker.startsWith(maskOf('').slice(0, -1))).toBe(true);
    const title = transported(diagnose.prompt).join('\n').match(/الموضوع: ([^\n]*)/)?.[1] ?? '';
    expect(title).toContain(marker);
    expect(verdicts(diagnose, [marker, title, 'feat: refresh the settings UI'])).toEqual([false, false, true]);
  });

  it('قيم الصفحة المنقولة حرفيًا تبقى دليلًا: العنوان والوصف عبر أسطره وسطر السجل واسم الفحص وتفصيله ونص التعليق ودليل صندوق الدمج والمراجعة', () => {
    expect(inBlocks(diagnose.prompt, '> Summary\n>\n> Refresh the settings UI')).toBe(true);
    expect(verdicts(diagnose, ['Summary Refresh the settings UI'], false)).toEqual([true]);
    expect(verdicts(diagnose, ['Refresh the settings UI and move the theme toggle into the header.', "src/settings/panel.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'.", 'ci / lint (pull_request)', 'Failing after 1m'])).toEqual([true, true, true, true]);
    expect(verdicts(next, ['The lint job fails on src/settings/panel.tsx: unused import useMemo.', 'This branch has conflicts that must be resolved', 'Review required', 'octo-dev'])).toEqual([true, true, true, true]);
  });

  it('قيمة من الصفحة لم تُعرض في هذا القالب لا تُعدّ دليلًا فيه', () => {
    const comment = 'The lint job fails on src/settings/panel.tsx: unused import useMemo.';
    expect(diagnose.prompt).not.toContain(comment);
    expect(parseAnalysis(reply([comment]), diagnose).findings[0]?.evidence[0]?.found).toBe(false);
  });

  it('اسم نوع الصفحة البديل عن عنوان غائب ليس من الصفحة', () => {
    const untitled = buildContext({ ...sourceOf(SAMPLES.pr), title: null }, { collectedAt: NOW });
    const prepared = prepareAnalysis(untitled, { template: 'understand', task: 'تحليل اصطناعي' });
    expect(inBlocks(prepared.prompt, `الموضوع: ${PAGE_TEXT.pr}`)).toBe(true);
    expect(parseAnalysis(reply([PAGE_TEXT.pr]), prepared).findings[0]?.evidence[0]?.found).toBe(false);
  });

  it('البرومبت المرسل لم يتغير بالفصل: القيم محلية لا تُضاف إلى ما يُرسل', () => {
    expect(diagnose.sources.length).toBeGreaterThan(0);
    expect(Object.keys(diagnose).sort()).toEqual(['consent', 'prompt', 'sources', 'system']);
  });
});
