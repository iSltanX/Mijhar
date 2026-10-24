// عينات طبقة السياق المشتركة (TEST-CTX-05 وTEST-CTX-08): الصفحات الأربع، والعينة المرجعية للبرومبت (fixture-pr-complex.html بوصف وتعليقات
// + فحوص API من fixture-check-runs.json + سجل الاختبار برموز وهمية)، ورموز وهمية تُركَّب وقت التشغيل فلا يظهر رمز بصيغته الكاملة في المستودع.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SELECTORS, SelectorsRegistry } from '../../../../src/core';
import type { ApiPrData } from '../../../../src/modules/d/blockers';
import { classifyCheckRun, have, missing } from '../../../../src/modules/d/pr-status';
import type { CheckItem } from '../../../../src/modules/d/pr-status';
import { COLLECTOR_SELECTORS, buildContext, collectContext } from '../../../../src/modules/e/context';
import type { CollectExtras, ContextOptions, ContextPageKind, ContextStructure, Snippet } from '../../../../src/modules/e/context';
import { E_FIXTURE, ROOT, loadFile, pageAt } from '../helpers';

export const NOW = Date.UTC(2026, 9, 24, 9, 30);
export const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';
export const LOG = fs.readFileSync(path.join(ROOT, 'fixtures/logs/fixture-action-logs-with-secrets.txt'), 'utf8');

export const fake = {
  ghp: ['ghp', 'Z1y2X3w4V5u6T7s8R9q0P1o2N3m4L5k6J7i8'].join('_'),
  ghs: ['ghs', 'B1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R7s8'].join('_'),
  pat: ['github', 'pat', '11BBBBBB0abcdefghijklmn_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRS'].join('_'),
  bearer: `Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'fakepayload', 'signature123'].join('.')}`,
  aws: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  slack: ['xoxb', '1234567890', 'abcdefghij'].join('-'),
};

export const selectors = (): SelectorsRegistry => new SelectorsRegistry([...DEFAULT_SELECTORS, ...COLLECTOR_SELECTORS]);

export interface Sample {
  readonly name: string;
  readonly file: string;
  readonly href: string;
  readonly kind: ContextPageKind;
}

/** العينات الأربع: طلب دمج مرجعي، ومشكلة حقيقية محفوظة، وصفحة مهمة Actions حقيقية (فحوص)، ومقارنة حقيقية بأسطر فروقها (Rails). */
export const SAMPLES: Readonly<Record<'pr' | 'issue' | 'checks' | 'diff', Sample>> = {
  pr: { name: 'طلب دمج', file: E_FIXTURE, href: 'https://github.com/octo/demo/pull/4242', kind: 'pr' },
  issue: { name: 'مشكلة', file: path.join(ROOT, 'fixtures/spikes/gh-issue-etos-1.html'), href: 'https://github.com/salktbi902/etos/issues/1', kind: 'issue' },
  checks: { name: 'فحوص', file: path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), href: 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911', kind: 'job' },
  diff: { name: 'ملف/فروق', file: path.join(ROOT, 'tests/modules/d/fixtures/gh-compare-branches.html'), href: 'https://github.com/octocat/Hello-World/compare/master...octocat-patch-1', kind: 'diff' },
};

export function sourceOf(sample: Sample, extras: CollectExtras = {}, prepare?: () => void) {
  loadFile(sample.file);
  prepare?.();
  return collectContext(document, selectors(), pageAt(sample.href), sample.kind, extras);
}

export const contextOf = (sample: Sample, extras: CollectExtras = {}, options: ContextOptions = {}, prepare?: () => void): ContextStructure =>
  buildContext(sourceOf(sample, extras, prepare), { collectedAt: NOW, ...options });

/** قراءة API لطلب الدمج المرجعي: أول خمس check runs من أول طلب في fixture-check-runs.json (قراءة حقيقية من evidence/T-0.3) لرأس معيّن. */
export function apiFor(headSha: string): ApiPrData {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-check-runs.json'), 'utf8')) as {
    prs: Array<{ checkRuns: { runs: Array<{ id: string; name: string; status: string; conclusion: string | null }> } }>;
  };
  const runs = fixture.prs[0]?.checkRuns.runs.slice(0, 5) ?? [];
  const items: CheckItem[] = runs.map((r) => ({ name: r.name, id: r.id, classification: classifyCheckRun(r), required: null, detail: null, source: 'api' }));
  // حالة الوصول والربط (MJ18، T-11.5) كما يعيدها readPrApi لقراءة عامة ناجحة بلا رمز وفرع غير محمي.
  return {
    readAt: NOW,
    pull: have({ number: 4242, state: 'open', draft: false, merged: false, mergeable: false, mergeableState: 'dirty', headSha, baseRef: 'main', headRef: 'feature/ui-refresh' }),
    checks: have({ items, checkRunsTotal: items.length, statusesTotal: 0, checkRunsRead: items.length, statusesRead: 0, partial: false, noneReported: false }),
    required: missing('الفرع غير محمي'),
    rate: null,
    requests: [
      'https://api.github.com/repos/octo/demo/pulls/4242',
      `https://api.github.com/repos/octo/demo/commits/${headSha}/check-runs`,
      `https://api.github.com/repos/octo/demo/commits/${headSha}/status`,
      'https://api.github.com/repos/octo/demo/branches/main',
    ],
    access: { pull: { kind: 'read', authenticated: false }, checks: { kind: 'read', authenticated: false }, required: { kind: 'unavailable', authenticated: false, reason: 'الفرع غير محمي' } },
    binding: { repo: 'octo/demo', branch: 'feature/ui-refresh', commit: headSha, readAt: NOW },
  };
}

/** سجل الاختبار المرجعي (500 سطر برمز ghp_ مختلَق في السطر 457) وقد أُدرج قبل سطر الخروج سطر خطأ يحمل رمزًا دقيق الحبيبات وهميًا. */
export const LEAKY_LOG = (() => {
  const lines = LOG.split('\n');
  lines.splice(489, 0, `2026-10-20T09:20:00.0000000Z ##[error]Authentication failed for GITHUB_PAT=${fake.pat}`);
  return lines.join('\n');
})();

/** مقتطف دليل برمز وهمي. */
export const LEAKY_SNIPPET: Snippet = { id: '1', text: `GH_TOKEN=${fake.ghp}`, where: 'سجل المهمة' };

/** رموز وهمية في أجزاء الصفحة المرجعية: العنوان والوصف وتعليق ووصف فحص فاشل (ومنه مقتطف الخطأ والموانع). */
export function plantSecrets(): void {
  const reg = selectors();
  reg.resolve(document, 'e.title')?.element.append(` ${fake.aws}`);
  const p = document.createElement('p');
  p.textContent = `export SLACK_TOKEN=${fake.slack}`;
  reg.resolve(document, 'e.body')?.element.append(p);
  document.querySelector('#issuecomment-1001 .js-comment-body p')?.append(` Authorization: ${fake.bearer}`);
  const lint = [...document.querySelectorAll('[data-testid="mergebox-partial"] li')].find((li) => li.textContent?.includes('ci / lint'));
  const detail = lint?.querySelector('.color-fg-muted');
  if (detail) detail.textContent = `Failing after 4m (token ${fake.ghs})`;
}
