// كاشف README العربي وبيان نطاق الفحص وزر فحص docs/ عند الطلب (T-9.1، F-H1).
export { ARABIC_FILE_NAME, TRANSLATION_FOLDERS, detectArabicReadme, repoFileUrl } from './detect';
export type { ArabicReadmeMatch, DetectContext, DetectionState, PageLink, ReadmeDetection, ReadmeScan, TreeEntry } from './detect';
export { MAX_SCAN_REQUESTS, scanDocsFolder } from './docs-scan';
export type { DocsScanResult } from './docs-scan';
export { README_SELECTORS, extractReadmeScan } from './extract';
export { DocsScanControl, ReadmeBanner, SCOPE_STATEMENT, UNREADABLE_STATEMENT } from './ReadmeBanner';
export { ReadmePanelView, createReadmePanelView } from './ReadmePanelView';
