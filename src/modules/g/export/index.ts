// الوحدة (ز): التخزين المحلي والتصدير والاستيراد والنسخ الاحتياطي والحذف وتنبيه الجهاز المشترك (T-8.4، F-G4/F-G5).
export { DataImportError, NoBackupError } from './errors';
export { EXPORT_FORMAT_NAME, EXPORT_VERSION, MAX_EXPORT_ITEMS, MAX_IMPORT_CHARS, buildBundle, countsOf, exportFileName, isSaltRecord, parseBundle, serializeJson, toMarkdown } from './format';
export type { BuildOptions, BundleCounts, ExportBundle, ExportScope, ExportSource, ParseResult, SaltRecord } from './format';
export { BACKUP_NAME, SALT_NAME, planDelete, planImport, pruneBundle, snapshotBundle } from './plan';
export type { DataSnapshot, DeleteCounts, DeletePlan, DeleteScope, ImportMode, ImportPlan, ImportSummary, KindSummary, PlanOptions, SaltOutcome } from './plan';
export { BACKUP_VERSION, parseBackup, readBackup, readSnapshot, reposOf, sourceOf } from './snapshot';
export type { ImportBackup } from './snapshot';
export { EXPORT_PRIVACY_POINTS, SHARED_DEVICE_BODY, SHARED_DEVICE_TITLE, STORAGE_LOCATION_TEXT } from './notice';
export { connectExport, exportDeps, useExportDeps } from './context';
export type { ExportDepsProvider, ExportDepsState } from './context';
export { DataTools, downloadFile, summaryLines } from './ui/DataTools';
export type { DataToolsDeps, SavedFile } from './ui/DataTools';
export { SharedDeviceNotice } from './ui/SharedDeviceNotice';
export { EXPORT_SETTINGS_SECTION } from './section';
export { EXPORT_DRAWER_VIEW, EXPORT_PANEL_VIEW, ExportView } from './view';
