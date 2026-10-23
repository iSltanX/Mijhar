// TEST-PR-02 (AC-D2): كل status وconclusion موثقة وكل حالة commit status قديمة تُعيَّن إلى أحد التصنيفات السبعة وفق جدول T-0.3،
// والقيم غير المعروفة أو الناقصة «غير معروف» ولا تُهمل. البيانات: fixture-check-runs.json (12 PR حقيقية من evidence/T-0.3).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  CHECK_CATEGORIES,
  CHECK_RUN_CONCLUSION,
  CHECK_RUN_STATUS,
  COMMIT_STATUS_STATE,
  DOCUMENTED_CHECK_RUN_CONCLUSIONS,
  DOCUMENTED_CHECK_RUN_STATUSES,
  DOCUMENTED_COMMIT_STATUS_STATES,
  classifyCheckRun,
  classifyCommitStatus,
  classifyDomCheck,
  countCategories,
} from '../../../src/modules/d/pr-status';
import type { CheckCategory } from '../../../src/modules/d/pr-status';
import { readFixture } from './helpers';

interface PrRecord {
  repo: string;
  number: number;
  checkRuns: { total: number; runs: Array<{ id: string; name: string; status: string; conclusion: string | null }> };
  combinedStatus: { state: string | null; total: number; statuses: Array<{ context: string; state: string }> };
  expected: { checkRuns: Partial<Record<CheckCategory, number>>; statuses: Partial<Record<CheckCategory, number>> };
}
interface CheckRunsFixture {
  prs: PrRecord[];
  documented: { checkRunStatus: Record<string, CheckCategory>; checkRunConclusion: Record<string, CheckCategory>; commitStatusState: Record<string, CheckCategory> };
}
const fixture = JSON.parse(readFixture('fixture-check-runs.json')) as CheckRunsFixture;

describe('التصنيفات السبعة', () => {
  it('سبعة بالضبط وبأسمائها العربية المعتمدة في الخطة', () => {
    expect(CHECK_CATEGORIES).toHaveLength(7);
    expect(CHECK_CATEGORIES.map((c) => CATEGORY_LABELS[c])).toEqual(['ناجح', 'فاشل', 'قيد التشغيل', 'متجاوز', 'ملغى', 'لم يُشغَّل', 'غير معروف']);
  });
});

describe('جدول ربط الحالات الموثقة (قيم GitHub الرسمية)', () => {
  it('كل status وconclusion موثقة تُعيَّن إلى تصنيف، ويطابق ما في جدول T-0.3', () => {
    for (const status of DOCUMENTED_CHECK_RUN_STATUSES) {
      const result = classifyCheckRun({ status, conclusion: null });
      if (status === 'completed') {
        expect(result.category, 'completed بلا conclusion').toBe('unknown');
        continue;
      }
      expect(CHECK_CATEGORIES, status).toContain(result.category);
      expect(result.category, status).toBe(fixture.documented.checkRunStatus[status]);
    }
    for (const conclusion of DOCUMENTED_CHECK_RUN_CONCLUSIONS) {
      const result = classifyCheckRun({ status: 'completed', conclusion });
      expect(result.category, conclusion).toBe(fixture.documented.checkRunConclusion[conclusion]);
      expect(result.raw).toBe(conclusion);
    }
    for (const state of DOCUMENTED_COMMIT_STATUS_STATES) {
      expect(classifyCommitStatus(state).category, state).toBe(fixture.documented.commitStatusState[state]);
    }
  });

  it('القيم الموثقة التي ذكرها التقرير باسمها: stale وtimed_out وaction_required', () => {
    expect(classifyCheckRun({ status: 'completed', conclusion: 'stale' })).toMatchObject({ category: 'unknown', verified: false });
    expect(classifyCheckRun({ status: 'completed', conclusion: 'timed_out' })).toMatchObject({ category: 'failure', verified: false });
    expect(classifyCheckRun({ status: 'completed', conclusion: 'action_required' })).toMatchObject({ category: 'not-run', verified: false });
    expect(classifyCheckRun({ status: 'completed', conclusion: 'startup_failure' }).category).toBe('failure');
  });

  it('neutral ناجح بوسم «محايد» (لا يميّزه DOM عن النجاح)', () => {
    expect(classifyCheckRun({ status: 'completed', conclusion: 'neutral' })).toMatchObject({ category: 'success', note: 'محايد', verified: true });
  });

  it('commit status القديمة: success وfailure وerror وpending', () => {
    expect(classifyCommitStatus('success').category).toBe('success');
    expect(classifyCommitStatus('failure').category).toBe('failure');
    expect(classifyCommitStatus('error')).toMatchObject({ category: 'failure', note: 'خطأ' });
    expect(classifyCommitStatus('pending').category).toBe('running');
  });

  it('الجداول لا تحوي تصنيفًا خارج السبعة، وكل قيمة موثقة لها صف', () => {
    for (const row of [...Object.values(CHECK_RUN_STATUS), ...Object.values(CHECK_RUN_CONCLUSION), ...Object.values(COMMIT_STATUS_STATE)]) expect(CHECK_CATEGORIES).toContain(row.category);
    for (const s of DOCUMENTED_CHECK_RUN_STATUSES) if (s !== 'completed') expect(CHECK_RUN_STATUS[s], s).toBeDefined();
    for (const c of DOCUMENTED_CHECK_RUN_CONCLUSIONS) expect(CHECK_RUN_CONCLUSION[c], c).toBeDefined();
    for (const s of DOCUMENTED_COMMIT_STATUS_STATES) expect(COMMIT_STATUS_STATE[s], s).toBeDefined();
  });
});

describe('القيم غير المعروفة أو الناقصة تُصنَّف «غير معروف» ولا تُهمل', () => {
  it('قيمة غير موثقة أو فارغة أو من نوع آخر', () => {
    for (const run of [
      { status: 'completed', conclusion: 'brand_new_value' },
      { status: 'completed', conclusion: null },
      { status: 'completed' },
      { status: 'weird', conclusion: 'success' },
      { status: null, conclusion: 'success' },
      {},
      { status: 42, conclusion: {} },
    ]) {
      const result = classifyCheckRun(run as never);
      expect(result.category, JSON.stringify(run)).toBe('unknown');
      expect(result.verified).toBe(false);
    }
    for (const state of ['mystery', '', null, undefined, 7]) expect(classifyCommitStatus(state).category, String(state)).toBe('unknown');
  });

  it('الحالة والقيمة تُقرآن بلا حساسية لحالة الأحرف ولا مسافات', () => {
    expect(classifyCheckRun({ status: ' Completed ', conclusion: 'SUCCESS' }).category).toBe('success');
    expect(classifyCheckRun({ status: 'IN_PROGRESS' }).category).toBe('running');
  });

  it('status غير مكتمل يحسم التصنيف ولو جاء معه conclusion', () => {
    expect(classifyCheckRun({ status: 'in_progress', conclusion: 'success' }).category).toBe('running');
  });
});

describe('المجموعة المرجعية: 12 PR حقيقية (check runs وcommit status)', () => {
  it('المجموعة كما قاسها T-0.3', () => {
    expect(fixture.prs).toHaveLength(12);
    expect(fixture.prs.reduce((n, p) => n + p.checkRuns.runs.length, 0)).toBeGreaterThan(500);
  });

  it('كل check run يُصنَّف، وعدد كل تصنيف في كل PR يطابق جدول T-0.3 المحسوب مستقلًا', () => {
    for (const pr of fixture.prs) {
      const counts = countCategories(pr.checkRuns.runs.map((run) => classifyCheckRun(run)));
      const expected = pr.expected.checkRuns;
      for (const category of CHECK_CATEGORIES) expect(counts[category], `${pr.repo}#${pr.number} ${category}`).toBe(expected[category] ?? 0);
    }
  });

  it('كل commit status يُصنَّف، وأعداده تطابق الجدول', () => {
    for (const pr of fixture.prs) {
      const counts = countCategories(pr.combinedStatus.statuses.map((s) => classifyCommitStatus(s.state)));
      for (const category of CHECK_CATEGORIES) expect(counts[category], `${pr.repo}#${pr.number} ${category}`).toBe(pr.expected.statuses[category] ?? 0);
    }
  });

  it('أمثلة بأرقام التقرير: node#66911 نجاح 31 وتجاوز 4، وvscode#343703 فيه neutral وفاشل 6 وقيد التشغيل 6', () => {
    const find = (repo: string, number: number): PrRecord => fixture.prs.find((p) => p.repo === repo && p.number === number) as PrRecord;
    const node = countCategories(find('nodejs/node', 66911).checkRuns.runs.map((r) => classifyCheckRun(r)));
    expect(node).toMatchObject({ success: 31, skipped: 4, failure: 0 });
    const vscode = countCategories(find('microsoft/vscode', 343703).checkRuns.runs.map((r) => classifyCheckRun(r)));
    expect(vscode).toMatchObject({ failure: 6, running: 6, skipped: 9, success: 23 });
    const next = countCategories(find('vercel/next.js', 100335).checkRuns.runs.map((r) => classifyCheckRun(r)));
    expect(next).toMatchObject({ success: 93, skipped: 8, failure: 1, cancelled: 1 });
  });

  it('لا فحوص: check-runs وstatus معًا صفر (kubernetes وjlevy) ولا يُصنَّف شيء «قيد التشغيل»', () => {
    for (const [repo, number] of [['jlevy/the-art-of-command-line', 959]] as const) {
      const pr = fixture.prs.find((p) => p.repo === repo && p.number === number) as PrRecord;
      expect(pr.checkRuns.runs).toHaveLength(0);
      expect(pr.combinedStatus.statuses).toHaveLength(0);
      expect(pr.combinedStatus.state).toBe('pending');
      expect(countCategories([]).running).toBe(0);
    }
  });

  it('لم يظهر تصنيف «لم يُشغَّل» ولا «غير معروف» ولا «ملغى» عدا next#100335 في الـAPI المرجعية', () => {
    const all = fixture.prs.flatMap((p) => [...p.checkRuns.runs.map((r) => classifyCheckRun(r)), ...p.combinedStatus.statuses.map((s) => classifyCommitStatus(s.state))]);
    expect(all.filter((c) => c.category === 'unknown')).toHaveLength(0);
    expect(all.filter((c) => c.category === 'not-run')).toHaveLength(0);
    expect(all.filter((c) => c.category === 'cancelled')).toHaveLength(1);
  });
});

describe('ما يظهر في DOM (بلا تسجيل دخول)', () => {
  const icon = (cls: string, label: string | null = null, description: string | null = null) => classifyDomCheck({ iconClass: cls, label, description }).category;

  it('جدول الرموز كما رصده T-0.3', () => {
    expect(icon('octicon octicon-check color-fg-success', 'This job succeeded')).toBe('success');
    expect(icon('octicon octicon-check color-fg-success', 'This check passed')).toBe('success');
    expect(icon('octicon octicon-x color-fg-danger', 'This job failed')).toBe('failure');
    expect(icon('octicon octicon-skip color-fg-muted', 'This job was skipped')).toBe('skipped');
    expect(icon('octicon octicon-stop neutral-check', 'This job was cancelled')).toBe('cancelled');
    expect(icon('anim-rotate', 'In progress')).toBe('running');
  });

  it('أوصاف status-details النصية', () => {
    expect(icon('', null, 'Successful in 2m')).toBe('success');
    expect(icon('', null, 'Failing after 4m')).toBe('failure');
    expect(icon('', null, 'Cancelled after 12s')).toBe('cancelled');
    expect(icon('', null, 'Skipped')).toBe('skipped');
    expect(icon('', null, 'In progress — This check has started...')).toBe('running');
  });

  it('«Expected — Waiting for status to be reported» = لم يُشغَّل (لا قيد التشغيل)', () => {
    expect(icon('octicon octicon-dot-fill', null, 'Expected — Waiting for status to be reported')).toBe('not-run');
  });

  it('رمز مجهول أو غائب = غير معروف', () => {
    expect(icon('octicon octicon-question')).toBe('unknown');
    expect(classifyDomCheck({}).category).toBe('unknown');
  });
});

describe('تنظيف الملف', () => {
  it('fixture-check-runs.json مولَّد من evidence/T-0.3 ولا يحوي ترويسات حد الطلبات ولا عنوان IP', () => {
    const text = fs.readFileSync(new URL('./fixtures/fixture-check-runs.json', import.meta.url), 'utf8');
    expect(text).not.toMatch(/x-ratelimit|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});
