import { fileURLToPath } from 'node:url';

// جذر المستودع لاختبارات تقرأ ملفات المشروع أو تبني الحزم.
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
