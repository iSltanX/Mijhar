export { MemoryStorageArea, measureEntry } from './memory-area';
export type { MemoryStorageOptions } from './memory-area';
export type { ChangeSource, StorageAreaLike, StorageBinding, StorageChange, StorageChanges, StorageValues } from './area';
export { defaultStorageApi, extensionStorage } from './extension-area';
export type { ExtensionLocalArea, ExtensionStorageApi } from './extension-area';
export {
  StorageBusyError,
  StorageImportError,
  StorageMigrationError,
  StorageNotMigratedError,
  StorageQuotaError,
  StorageSchemaTooNewError,
  StorageValueError,
  isQuotaError,
} from './errors';
export type { MigrationFailure, QuotaDetails, QuotaPhase, QuotaRemedy } from './errors';
export { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrationPath } from './migrations';
export type { Migration, Snapshot } from './migrations';
export { BACKUP_PREFIX, DATA_PREFIX, EXPORT_FORMAT, JOURNAL_KEY, KEY_PREFIX, META_KEY, Store, assertJsonValue } from './store';
export type { BackupInfo, BackupReason, BackupRecord, ExportEnvelope, ImportResult, LockManagerLike, Meta, StoreOptions } from './store';
export { UNLIMITED_STORAGE_FINDINGS, UNLIMITED_STORAGE_REQUESTABLE_AT_RUNTIME } from './capabilities';
export type { UnlimitedStorageFinding, UnlimitedStorageHandling } from './capabilities';
