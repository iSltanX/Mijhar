// الوحدة (و): بنك عبارات المراجعة والقسم الاختياري «ترجمة مسودتي» (T-7.3، F-F3/F-F5). القسم الثابت (data وPhrasebankSection) لا يستورد الترجمة؛ وهي في translate-draft وحده.
export { CATEGORY_LABELS, LANGUAGE_LABELS, PHRASES, PHRASE_CATEGORIES, PHRASE_LANGUAGES, findPhrase, phrasesOf, selectPhrase } from './data';
export type { Phrase, PhraseCategory, PhraseLanguage, PhraseSelection } from './data';
export { PhrasebankSection } from './PhrasebankSection';
export type { PhrasebankProps } from './PhrasebankSection';
export { TranslateDraftSection } from './translate-draft';
export type { TranslateDraftProps } from './translate-draft';
