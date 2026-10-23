// وصف الصفحة المفتوحة ومصادره لواجهات الوحدات (ز) و(ح).
export { diffPathOf, enrichFromDocument, isSha, pageInfoFromUrl, parseDiffHash, parseLineHash, repoSlug } from './page-info';
export type { DiffSelection, DiffSide, LineRange, PageInfo, RefKind } from './page-info';
export { documentPageSource, extensionTabs, sameInfo, tabsPageSource, useActivePage } from './page-source';
export type { ActivePageState, ActiveTabsApi, PageSource } from './page-source';
