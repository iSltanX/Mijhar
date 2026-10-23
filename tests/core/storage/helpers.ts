import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_PREFIX, JOURNAL_KEY, MemoryStorageArea } from '../../../src/core';
import type { StorageValues } from '../../../src/core';
import { ROOT } from '../../setup/paths';

export const loadStorageFixture = (name: string): StorageValues =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/core/storage/fixtures', `${name}.json`), 'utf8')) as StorageValues;

export const areaFrom = (name: string, options: { quotaBytes?: number; atomic?: boolean } = {}): MemoryStorageArea =>
  new MemoryStorageArea({ initial: loadStorageFixture(name), ...options });

/** ما في المنطقة من غير النسخ الاحتياطية وسجل العملية: مقارنة «بيانات المستخدم لم تتغير». */
export const userData = (dump: StorageValues): StorageValues =>
  Object.fromEntries(Object.entries(dump).filter(([key]) => !key.startsWith(BACKUP_PREFIX) && key !== JOURNAL_KEY));

export const backupKeys = (dump: StorageValues): string[] => Object.keys(dump).filter((key) => key.startsWith(BACKUP_PREFIX));

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
