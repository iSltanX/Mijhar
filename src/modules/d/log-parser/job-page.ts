// قراءة صفحة مهمة Actions (/<owner>/<repo>/actions/runs/<run>/job/<job>) على ما تثبته evidence/T-0.3 وصفحة حقيقية محفوظة
// (fixtures/logs/gh-job-failed.html، لغير مسجَّل): الخطوات بأسمائها ونتائجها وروابط سجلاتها في check-step، والتنبيهات في annotation-message
// ورابطها «#annotation:<الخطوة>:<السطر>». نص السجل نفسه لا يظهر لغير المسجَّل («Sign in to view logs»).
import type { SelectorEntry, SelectorsRegistry } from '../../../core';
import type { AnnotationInput, StepRef } from './parse';
import { squash } from '../pr-status/value';

export const JOB_PAGE_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'd.job.step',
    description: 'خطوة في صفحة المهمة بسمات data-name وdata-number وdata-conclusion وdata-log-url',
    candidates: ['check-step[data-number]', '[data-step-number][data-conclusion]'],
  },
  {
    key: 'd.job.annotation',
    description: 'تنبيه (Annotation) في صفحة المهمة',
    candidates: ['annotation-message', '.annotation-message'],
  },
  {
    key: 'd.job.logs',
    description: 'حاوية سجلات المهمة؛ يُدرج الشرح قبلها',
    candidates: ['#logs', '.CheckRun.js-check-steps', 'check-steps'],
  },
];

export interface JobStep extends StepRef {
  readonly name: string;
  readonly number: number;
  readonly conclusion: string | null;
  /** رابط سجل الخطوة بنفس الأصل، أو null حين لا تعرضه الصفحة (خطوة متجاوزة). */
  readonly logUrl: string | null;
}

export interface JobPage {
  readonly steps: readonly JobStep[];
  readonly failedSteps: readonly JobStep[];
  readonly annotations: readonly AnnotationInput[];
  /** تعرض الصفحة «Sign in to view logs»: نص السجل محجوب عن هذا الزائر. */
  readonly signInForLogs: boolean;
}

const LEVEL = (svg: Element | null): AnnotationInput['level'] => {
  const cls = svg?.getAttribute('class') ?? '';
  if (/color-fg-danger|x-circle/.test(cls)) return 'failure';
  if (/color-fg-attention|alert/.test(cls)) return 'warning';
  if (/info|color-fg-accent/.test(cls)) return 'notice';
  return 'unknown';
};

export function readJobPage(doc: Document, selectors: SelectorsRegistry): JobPage {
  const steps: JobStep[] = [];
  for (const el of selectors.resolveAll(doc, 'd.job.step')) {
    const number = Number(el.getAttribute('data-number') ?? el.getAttribute('data-step-number'));
    const name = el.getAttribute('data-name') ?? '';
    if (!Number.isFinite(number) || !name) continue;
    const logUrl = el.getAttribute('data-log-url') || null;
    steps.push({ name, number, conclusion: el.getAttribute('data-conclusion') || null, logUrl });
  }
  const byNumber = new Map(steps.map((s) => [s.number, s]));
  const annotations: AnnotationInput[] = [];
  for (const el of selectors.resolveAll(doc, 'd.job.annotation')) {
    const link = el.querySelector('a[href*="#annotation:"]');
    const m = /#annotation:(\d+):(\d+)/.exec(link?.getAttribute('href') ?? '');
    const stepNumber = m ? Number(m[1]) : null;
    const stepName = squash(link?.querySelector('strong')?.textContent) || null;
    const container = el.querySelector('[data-target="annotation-message.annotationContainer"], .annotation--contracted, .annotation--expanded');
    const message = (container?.textContent ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    if (!message) continue;
    const known = stepNumber !== null ? byNumber.get(stepNumber) : undefined;
    annotations.push({
      message,
      level: LEVEL(el.querySelector('svg')),
      step: known ?? (stepName || stepNumber !== null ? { name: stepName, number: stepNumber } : null),
      line: m ? Number(m[2]) : null,
    });
  }
  const signInForLogs = [...doc.querySelectorAll('a[href^="/login"]')].some((a) => /Sign in to view logs/i.test(a.textContent ?? ''));
  return { steps, failedSteps: steps.filter((s) => s.conclusion === 'failure'), annotations, signInForLogs };
}

/** هل المسار صفحة مهمة لا صفحة تشغيل. */
export const isJobPath = (href: string): boolean => /\/actions\/runs\/\d+\/job\/\d+\/?$/.test(new URL(href).pathname);
