// مصدر سياق اصطناعي فارغ تُملأ منه حقول الاختبار (مشترك بين اختبارات هذا المجلد).
import type { ContextSource } from '../../../src/modules/e/context/collect';

export const baseSource = (over: Partial<ContextSource> = {}): ContextSource => ({
  kind: 'issue',
  url: 'https://github.com/audit/synthetic/issues/1',
  number: 1,
  repo: 'audit/synthetic',
  title: 'Synthetic audit issue',
  description: null,
  branch: null,
  comments: [],
  checks: null,
  errorExcerpt: [],
  status: null,
  log: null,
  changes: null,
  gaps: [],
  ...over,
});
