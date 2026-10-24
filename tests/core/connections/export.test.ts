// TEST-CONN-02 (تكامل، AC-11.1 ‏(٦)): لا سرّ في ملف تصدير. السرّان في storage.session وIndexedDB الإضافة، والتصدير (تصدير المخزن
// العام ونسخة البيانات الخاصة T-8.4 بصيغتيها) يقرأ storage.local وحده؛ فبعد حفظ السرّين والتحقق وتسجيل الصحة لا يظهر أيٌّ منهما فيه.
import { describe, expect, it } from 'vitest';
import { Store } from '../../../src/core';
import { buildBundle, toMarkdown } from '../../../src/modules/g/export/format';
import { readSnapshot, sourceOf } from '../../../src/modules/g/export/snapshot';
import { FIXTURE, PROVIDER_PATTERN, TOKEN_PATTERN, connectionSystem, fakeProviderKey, fakeToken } from './helpers';
import type { Reply } from './helpers';

const TOKEN = fakeToken('X');
const KEY = fakeProviderKey('X');

describe('لا سرّ في ملفات التصدير', () => {
  it('بعد حفظ الرمز ومفتاح المزوّد (جلسة وقرص) والتحقق والاستعمال: تصدير المخزن ونسخة البيانات بصيغتيها بلا أي سرّ', async () => {
    const s = await connectionSystem(() => FIXTURE.states.valid as Reply);
    await s.tokens.save(TOKEN, 'disk');
    await s.providerKeys.save(KEY, 'session');
    await s.port.get('/rate_limit');
    await s.tabPort.get('/repos/o/r/pulls/1');
    const store = await Store.open({ area: s.area, changes: s.area });
    const files = [JSON.stringify(await store.exportData()), JSON.stringify(await s.area.get(null))];
    const bundle = buildBundle(sourceOf(await readSnapshot(store)));
    files.push(JSON.stringify(bundle), toMarkdown(bundle));
    for (const text of files) {
      expect(text).not.toMatch(TOKEN_PATTERN);
      expect(text).not.toMatch(PROVIDER_PATTERN);
    }
    // السرّان محفوظان فعلًا خارج storage.local.
    expect(s.tokenDisk.value?.token).toBe(TOKEN);
    expect(s.keySession.value?.token).toBe(KEY);
  });
});
