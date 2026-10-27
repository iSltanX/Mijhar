// @vitest-environment jsdom
// معالجة تدقيقي 2026-10-27 — الدفعة C: فحوص وتفسيرات جديرة بالثقة.
//  - GEMINI-003: رمز الفحص ووسمه يحسمان حالته قبل نص الوصف، وعدّادات الأدوات («0 failed»، «2 skipped») لا تصير حالة؛ والوصف لا يُؤخذ من رابط؛
//    وصف DOM بلا معرّف يُطابق check run باسم مهمته؛ ومصدر فحص Actions يُنسب إلى طلبات Actions.
//  - CODEX-001: ردّ status-details بلا صفوف مفهومة ليس «لا فحوص».
//  - CODEX-002: كلمة Required في اسم فحص أو وصفه ليست شارة إلزام، وجزء status-details لا يثبت الإلزام.
//  - CODEX-003: حد مراقِبات الملفات ليس امتلاء قرص، و«Resource not accessible by integration» لا تسمّي نوع الرمز.
import { describe, expect, it } from 'vitest';
import { SelectorsRegistry } from '../../src/core';
import { classifyDomCheck } from '../../src/modules/d/pr-status/categories';
import { PR_STATUS_SELECTORS, parseStatusDetails, readChecks, readPrSummary } from '../../src/modules/d/pr-status/extract';
import { explainBlockers } from '../../src/modules/d/blockers/explain';
import { mergeApi } from '../../src/modules/d/blockers/merge';
import { have, missing } from '../../src/modules/d/pr-status/value';
import { analyzeLog } from '../../src/modules/d/log-parser/parse';
import type { CheckItem } from '../../src/modules/d/pr-status/summary';

const selectors = new SelectorsRegistry(PR_STATUS_SELECTORS);
const DOM = { stateLabel: 'Open', mergeboxPresent: true, conflictsText: null, reviewText: null, behindText: null };

describe('GEMINI-003: الحالة من الرمز ووسمه قبل الوصف', () => {
  it.each([
    ['octicon octicon-check color-fg-success', 'This job succeeded', '12 passed, 0 failed in 34s', 'success'],
    ['octicon octicon-check color-fg-success', 'This check passed', 'test — 14 passed, 2 skipped', 'success'],
    ['octicon octicon-check-circle-fill', null, 'lint-error-handler finished', 'success'],
    ['octicon octicon-x-circle-fill color-fg-danger', null, 'Failing after 4m — 3 passed', 'failure'],
    ['octicon octicon-skip', null, 'Skipped', 'skipped'],
    ['octicon octicon-dot-fill anim-rotate', null, 'In progress — This check has started...', 'running'],
  ] as const)('رمز %s ووصف «%s» ← %s', (iconClass, label, description, category) => {
    expect(classifyDomCheck({ iconClass, label, description }).category).toBe(category);
  });

  it('بلا رمز ولا وسم حاسمين: العدّادات وحدها لا تحسم (غير معروف)، وعبارة GitHub الصريحة تحسم', () => {
    expect(classifyDomCheck({ iconClass: 'octicon', label: null, description: '14 passed, 2 skipped' }).category).toBe('unknown');
    expect(classifyDomCheck({ iconClass: 'octicon', label: null, description: '12 passed, 0 failed in 34s' }).category).toBe('unknown');
    expect(classifyDomCheck({ iconClass: 'octicon', label: null, description: 'Failing after 4m' }).category).toBe('failure');
    expect(classifyDomCheck({ iconClass: 'octicon', label: 'This check failed', description: '10 passed' }).category).toBe('failure');
    expect(classifyDomCheck({ iconClass: 'octicon octicon-dot-fill', label: null, description: 'Expected — Waiting for status to be reported' }).category).toBe('not-run');
  });

  it('فحص إلزامي ناجح وصفه «12 passed, 0 failed» في صندوق الدمج: ناجح، ولا مانع دمج؛ والرابط ذو title لا يصير وصفًا', () => {
    document.body.innerHTML = `
      <div data-testid="mergebox-partial"><div class="merge-status-list">
        <div class="merge-status-item">
          <svg class="octicon octicon-check color-fg-success" aria-label="This check passed"></svg>
          <strong>ci / unit-tests</strong>
          <a title="lint-error-handler failed earlier" href="/org/repo/actions/runs/100/job/200">Details</a>
          <span class="color-fg-muted text-small">12 passed, 0 failed in 34s</span>
          <span class="Label">Required</span>
        </div>
      </div></div>`;
    const summary = readPrSummary(document, selectors);
    const [item] = summary.checks.items;
    expect(item).toMatchObject({ name: 'ci / unit-tests', required: true, detail: '12 passed, 0 failed in 34s' });
    expect(item?.classification.category).toBe('success');
    const report = explainBlockers(summary, DOM, null);
    expect([...report.blockers, ...report.attention].map((b) => b.id)).not.toContain('required-failed');
  });

  it('صف DOM بلا معرّف «ci / build (pull_request)» وcheck run «build» في API: فحص واحد لا اثنان، وتنتقل إليه شارة الإلزام', () => {
    const dom: CheckItem = { name: 'ci / build (pull_request)', id: null, classification: { category: 'failure', raw: 'x', verified: true }, required: true, detail: 'Failing after 1m', source: 'mergebox' };
    const api: CheckItem = { name: 'build', id: '77', classification: { category: 'failure', raw: 'failure', verified: true }, required: null, detail: null, source: 'api' };
    const summary = { ...emptySummary(), headSha: 'a'.repeat(40), checks: { ...emptySummary().checks, items: [dom], requiredKnown: true, source: 'mergebox' as const } };
    const merged = mergeApi(summary, apiData([api], 'a'.repeat(40)));
    expect(merged.checks.items).toHaveLength(1);
    expect(merged.checks.items[0]).toMatchObject({ name: 'build', id: '77', required: true, source: 'api' });
    // اسمان في API يطابقان الاسم المجرد نفسه: لا دمج بالتخمين.
    const twice = mergeApi(summary, apiData([api, { ...api, id: '78' }], 'a'.repeat(40)));
    expect(twice.checks.items).toHaveLength(3);
  });

  it('فحص من مهام Actions (check-runs رُفضت) يُنسب إلى طلب Actions لا إلى check-runs', () => {
    const run: CheckItem = { name: 'build', id: '9001', classification: { category: 'failure', raw: 'failure', verified: true }, required: true, detail: null, source: 'api' };
    const data = apiData([run], 'a'.repeat(40), 'actions');
    const summary = { ...emptySummary(), headSha: 'a'.repeat(40) };
    const report = explainBlockers(mergeApi(summary, data), DOM, data);
    const where = report.blockers.find((b) => b.id === 'required-failed')?.evidence[0]?.where;
    expect(where).toContain('/actions/');
    expect(where).not.toContain('/check-runs');
  });
});

describe('CODEX-001: ردّ بلا صفوف مفهومة ليس «لا فحوص»', () => {
  function withRollup(label: string): void {
    document.body.innerHTML = `<div class="js-discussion"><details class="commit-build-statuses" data-deferred-details-content-url="/org/repo/commit/${'a'.repeat(40)}/status-details"><summary><svg class="octicon octicon-check color-fg-success" aria-label="${label}"></svg></summary></details></div>`;
  }

  it.each([
    ['صفحة دخول 200', '<main>Sign in to continue</main>'],
    ['تخطيط مجهول 200', '<div class="new-layout"><p>checks moved</p></div>'],
    ['قائمة فارغة', '<div class="merge-status-list"></div>'],
  ])('%s مع رمز مجمَّع فيه فحص: تعذّر قراءة لا صفر', (_name, html) => {
    withRollup('1 / 1 checks OK');
    const items = parseStatusDetails(new DOMParser().parseFromString(html, 'text/html'));
    const checks = readChecks(document, selectors, null, { items, error: null });
    expect(checks.noneReported).toBe(false);
    expect(checks.error).toContain('لم يُفهم ردّ تفاصيل الفحوص');
  });

  it('وحين يعلن الرمز المجمَّع صفر فحوص يبقى «لا فحوص» ممكنًا', () => {
    withRollup('0 / 0 checks OK');
    const checks = readChecks(document, selectors, null, { items: [], error: null });
    expect(checks.noneReported).toBe(true);
    expect(checks.error).toBeNull();
  });
});

describe('CODEX-002: الإلزام من شارة مستقلة لا من الاسم', () => {
  const row = (inner: string): string => `<div class="merge-status-item"><svg class="octicon octicon-x-circle-fill color-fg-danger" aria-label="This check failed"></svg> ${inner} <a href="/o/r/actions/runs/1/job/2">Details</a></div>`;

  it('اسم «Required dependencies» ووصف فيه Required: مجهول الإلزام، ولا مانع مؤكد', () => {
    document.body.innerHTML = `<div data-testid="mergebox-partial"><div class="merge-status-list">${row('<strong>Required dependencies</strong><span class="color-fg-muted text-small">Failing after 1m — Required step failed</span>')}</div></div>`;
    const summary = readPrSummary(document, selectors);
    expect(summary.checks.items[0]?.required).toBeNull();
    const report = explainBlockers(summary, DOM, null);
    expect(report.blockers.map((b) => b.id)).not.toContain('required-failed');
    expect(report.blockers.flatMap((b) => b.evidence.map((e) => e.text)).join(' ')).not.toContain('(Required)');
  });

  it('شارة Required مستقلة في الصف: إلزامي، والمانع مؤكد', () => {
    document.body.innerHTML = `<div data-testid="mergebox-partial"><div class="merge-status-list">${row('<strong>ci / lint</strong><span class="color-fg-muted text-small">Failing after 4m</span> <span class="Label">Required</span>')}</div></div>`;
    const summary = readPrSummary(document, selectors);
    expect(summary.checks.items[0]?.required).toBe(true);
    expect(explainBlockers(summary, DOM, null).blockers.map((b) => b.id)).toContain('required-failed');
  });

  it('جزء status-details لا يثبت الإلزام ولو كان فيه «Required»', () => {
    const doc = new DOMParser().parseFromString(row('<strong>ci / lint</strong><span class="color-fg-muted text-small">Failing after 4m</span> <span class="Label">Required</span>'), 'text/html');
    expect(parseStatusDetails(doc)[0]?.required).toBeNull();
  });
});

describe('CODEX-003: السبب المثبت لا يتجاوز نص السطر', () => {
  const causes = (line: string) => analyzeLog({ text: `${line}\nError: Process completed with exit code 1.`, source: 'step-log', step: null, annotations: [], truncatedBySource: null }).rootCauses;

  it('حد مراقِبات الملفات ليس امتلاء قرص', () => {
    const found = causes("Error: ENOSPC: System limit for number of file watchers reached, watch '/workspace/project/src'");
    expect(found.map((c) => c.patternId)).toEqual(['file-watcher-limit']);
    expect(found.map((c) => c.cause).join(' ')).not.toContain('امتلأ قرص');
  });

  it('ENOSPC المجرد لا يثبت نوع المورد، ونص القرص الصريح يثبته', () => {
    expect(causes('Error: ENOSPC').map((c) => c.patternId)).not.toContain('disk-full');
    expect(causes('write /tmp/x: No space left on device').map((c) => c.patternId)).toEqual(['disk-full']);
    expect(causes("Error: ENOSPC: no space left on device, write").map((c) => c.patternId)).toEqual(['disk-full']);
  });

  it('رسالة integration المجردة لا تضيف نوع رمز', () => {
    const found = causes('HttpError: Resource not accessible by integration');
    expect(found.map((c) => c.patternId)).toEqual(['integration-permission']);
    expect(found[0]?.cause).not.toContain('GITHUB_TOKEN');
  });
});

// ---- بيانات مساعدة ----

function emptySummary() {
  document.body.innerHTML = '';
  return readPrSummary(document, selectors);
}

function apiData(items: CheckItem[], headSha: string, via?: 'actions') {
  const base = '/repos/org/repo';
  const requests = [`${base}/pulls/1`, `${base}/commits/${headSha}/check-runs`, `${base}/commits/${headSha}/status`, `${base}/branches/main`, ...(via ? [`${base}/actions/runs?head_sha=${headSha}`] : [])];
  return {
    readAt: 0,
    pull: have({ number: 1, state: 'open', draft: false, merged: false, mergeable: null, mergeableState: 'blocked', headSha, baseRef: 'main', headRef: 'feature' }),
    checks: have({ items, checkRunsTotal: items.length, statusesTotal: 0, checkRunsRead: items.length, statusesRead: 0, partial: false, noneReported: false, ...(via ? { via } : {}) }),
    required: missing('غير مقروء'),
    rate: null,
    requests,
    access: { pull: 'ok', checks: 'ok', required: 'ok' },
    binding: { repo: 'org/repo', branch: 'feature', commit: headSha, readAt: 0 },
  } as never;
}
