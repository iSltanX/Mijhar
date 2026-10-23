// بيانات القاموس كما يستهلكها بطاقة الشرح (T-3.2): المداخل (T-3.1) مفهرسة بتسمياتها الدلالية، وقائمة المصطلحات الأساسية.
// الملفان JSON في src/data/glossary ويُضمَّنان في حزمة سكربت المحتوى (لا شبكة ولا قراءة وقت التشغيل: قاعدة بيانات محلية).
import coreTerms from '../../../data/glossary/core-terms.json';
import data from '../../../data/glossary/entries.json';
import type { GlossaryData, GlossaryEntry } from '../../../data/glossary/types';

export const GLOSSARY_ENTRIES: readonly GlossaryEntry[] = (data as unknown as GlossaryData).entries;

/** معرّفات «قائمة المصطلحات الأساسية» التي تحددها T-3.1 (لكل منها مثال عملي). */
export const CORE_TERM_IDS: ReadonlySet<string> = new Set(coreTerms as unknown as string[]);

export type { GlossaryEntry };
