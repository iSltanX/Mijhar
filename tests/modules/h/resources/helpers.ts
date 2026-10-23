// أدوات اختبار دليل الموارد: مخزن ذاكري ومستودع فوق قائمة مضمّنة صغيرة، وعينة fixture-resources-set.json.
import { MemoryStorageArea, Store } from '../../../../src/core';
import { ResourcesRepository } from '../../../../src/modules/h/resources';
import type { Category, Resource, ResourceFile } from '../../../../src/modules/h/resources';
import { parseResourceFile } from '../../../../src/modules/h/resources';
import { fixtureText } from '../helpers';

export const TEST_SET: ResourceFile = (() => {
  const parsed = parseResourceFile(fixtureText('fixture-resources-set.json'));
  if (!parsed.ok || parsed.invalid.length) throw new Error('عينة الموارد غير صالحة');
  return parsed.file;
})();

export const CATEGORIES: readonly Category[] = TEST_SET.categories;
/** المضمّن في الاختبارات: أول ثلاثة من العينة. */
export const BUILTIN: readonly Resource[] = TEST_SET.resources.filter((r) => r.origin === 'builtin');

export const NOW = new Date('2026-10-23T09:00:00Z');

export interface MemoryResources {
  readonly area: MemoryStorageArea;
  readonly store: Store;
  readonly repository: ResourcesRepository;
  reopen(): Promise<MemoryResources>;
}

export async function memoryResources(area = new MemoryStorageArea(), builtin: readonly Resource[] = BUILTIN): Promise<MemoryResources> {
  const store = await Store.open({ area, changes: area, locks: null });
  let n = 0;
  const repository = await ResourcesRepository.open(store, builtin, { now: () => NOW, newId: () => `u-test-${++n}`, categories: CATEGORIES });
  return { area, store, repository, reopen: () => memoryResources(area, builtin) };
}

/** تسلسل مستقر لمقارنة قوائم موارد بصرف النظر عن ترتيب المفاتيح. */
export const canon = (list: readonly Resource[]): string =>
  JSON.stringify([...list].sort((a, b) => a.id.localeCompare(b.id)).map((r) => Object.fromEntries(Object.entries(r).sort(([x], [y]) => x.localeCompare(y)))));
