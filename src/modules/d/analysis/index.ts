// التحليل داخل الأقسام (T-11.7، F-D9): متحكم القسم وعرضه، وتعريف الأقسام الثلاثة، ووحدة صفحة المشكلة.
export { SectionAnalysis, defaultAnalysisDeps, failureText } from './controller';
export type { AnalysisState, SectionAnalysisDeps } from './controller';
export { ANALYSIS_SECTIONS } from './sections';
export type { AnalysisSectionDef, AnalysisSectionId } from './sections';
export { AnalysisBlock } from './view';
export type { AnalysisBlockProps } from './view';
export { ANALYSIS_CSS } from './style';
export { ANALYSIS_MODULE, ANALYSIS_MODULE_ID, createAnalysisModule } from './module';
