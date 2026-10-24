// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// F-04 (تدقيق ما قبل الإصدار): «مثبت من المصدر» لما نُقل من الصفحة وحده. نص القالب الذي كتبه مِجهَر (التعليمات وسطر الحدود و«المعلومات الناقصة»
// وسطر الختام) موجود فيما أُرسل لكنه ليس من الصفحة، فاقتباسه لا يُعدّ دليلًا من المصدر.
import { h, render } from 'preact';
import { describe, expect, it } from 'vitest';
import { BOUNDARY_RULE } from '../../src/core/guardrails/boundaries';
import { AnalysisBlock } from '../../src/modules/d/analysis/view';
import { ANALYSIS_SECTIONS } from '../../src/modules/d/analysis/sections';
import { parseAnalysis, prepareAnalysis } from '../../src/modules/e/provider';
import { CLOSING_LINE, NOT_RECEIVED_LINE } from '../../src/modules/e/prompt-templates/definitions';
import { NOW, SAMPLES, contextOf } from '../modules/e/context/samples';

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
    const parsed = parseAnalysis(reply(template), prepared.prompt);
    expect(parsed.findings[0]?.evidence.map((e) => e.found)).toEqual([false, false, false, false]);
  });

  it('اقتباس ما نُقل من الصفحة حرفيًا يبقى مثبتًا', () => {
    expect(page).toContain(ctx.subject);
    const parsed = parseAnalysis(reply([ctx.subject]), prepared.prompt);
    expect(parsed.findings[0]?.evidence[0]).toEqual({ text: ctx.subject, found: true });
  });

  it('لا يعرض القسم نص القالب تحت «مثبت من المصدر»', () => {
    const parsed = parseAnalysis(reply([CLOSING_LINE, ctx.subject]), prepared.prompt);
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
