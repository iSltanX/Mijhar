// ملاحظات الأثر (F-D6 ب): تُستنتج آليًا من أسماء الملفات وأحجام التغيير المقروءة، فهي ملاحظات تُراجَع بشريًا لا حقائق عن أثر
// الشيفرة. تُعرض في قسم منفصل هيكليًا وبصريًا عن الإحصاء المؤكد، وكل ملاحظة تذكر الرقم الذي بُنيت عليه.
import { FILE_KIND_LABELS } from './file-kinds';
import type { CompareSummary } from './extract';

export const IMPACT_REVIEW_LABEL = 'يحتاج مراجعة بشرية';

export interface ImpactNote {
  readonly id: 'dependencies' | 'workflows' | 'code-without-tests' | 'docs-only' | 'large-change' | 'partial-read';
  readonly text: string;
}

const LARGE_FILES = 50;
const LARGE_LINES = 1000;

export function buildImpactNotes(summary: CompareSummary): ImpactNote[] {
  const notes: ImpactNote[] = [];
  const { byKind, read, reconciliation } = summary;
  if (byKind.dependencies.files > 0) {
    notes.push({ id: 'dependencies', text: `تغيّرت ${byKind.dependencies.files} ملفات ${FILE_KIND_LABELS.dependencies}: راجع الإصدارات التي أُضيفت أو رُفعت أو حُذفت ومصدرها.` });
  }
  if (byKind.workflows.files > 0) {
    notes.push({ id: 'workflows', text: `تغيّر ${byKind.workflows.files} ملف ${FILE_KIND_LABELS.workflows}: قد يتغير ما يُشغَّل عند الدفع أو الدمج وصلاحيات الرموز فيه.` });
  }
  if (byKind.code.files > 0 && byKind.tests.files === 0) {
    notes.push({ id: 'code-without-tests', text: `تغيّر ${byKind.code.files} ملف ${FILE_KIND_LABELS.code} دون أي ملف ${FILE_KIND_LABELS.tests} في هذه المقارنة؛ وقد تكون الاختبارات في مكان آخر.` });
  }
  if (read.files > 0 && byKind.docs.files === read.files) {
    notes.push({ id: 'docs-only', text: `كل الملفات المقروءة (${read.files}) من نوع ${FILE_KIND_LABELS.docs} بحسب أسمائها.` });
  }
  const lines = summary.page.additions.available && summary.page.deletions.available ? summary.page.additions.value + summary.page.deletions.value : read.additions + read.deletions;
  const files = summary.page.files.available ? summary.page.files.value : read.files;
  if (files >= LARGE_FILES || lines >= LARGE_LINES) {
    notes.push({ id: 'large-change', text: `التغيير كبير الحجم (${files} ملفًا و${lines.toLocaleString('en-US')} سطرًا مضافًا ومحذوفًا): يصعب فحصه دفعة واحدة.` });
  }
  if (!reconciliation.complete) {
    notes.push({ id: 'partial-read', text: 'لم تُحمَّل كل ملفات المقارنة بأسطرها في الصفحة بعد، فالتصنيف أدناه جزئي؛ مرّر في الصفحة أو افتح الملفات الكبيرة ثم أعد القراءة.' });
  }
  return notes;
}
