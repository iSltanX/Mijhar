/**
 * F-07 (Codex): قائمة النماذج ونتيجة «اختبر النموذج» تُحفظان في storage.session تحت مفتاح واحد لكل منهما يجمع المزوّدين؛ وحفظان متزامنان لمزوّدين مختلفين
 * (نافذتا إعدادات تمرّان بالخلفية نفسها) كانا يقرآن الكائن نفسه قبل أن يكتب أيهما، فتمحو الكتابة الثانية الأولى. الكتابة الآن متتالية في الخلفية.
 * مخزن جلسة اصطناعي يؤخر القراءة ليُظهر التداخل؛ لا متصفح حي.
 */
import { describe, expect, it } from 'vitest';
import { sessionModelsCache } from '../../src/modules/e/provider/service';
import type { ModelTest, ModelsList } from '../../src/modules/e/provider';

function slowSession() {
  const values: Record<string, unknown> = {};
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    values,
    get: async (key: string) => {
      const snapshot = structuredClone({ [key]: values[key] });
      await tick();
      return snapshot;
    },
    set: async (items: Record<string, unknown>) => {
      await tick();
      Object.assign(values, structuredClone(items));
    },
    remove: async (key: string) => {
      delete values[key];
    },
  };
}

const list = (provider: string): ModelsList => ({ provider, models: [], source: 'https://synthetic.invalid/models', readAt: 1, partial: false });
const test = (provider: string): ModelTest => ({ provider, model: 'synthetic-model', keySavedAt: 1, verdict: 'accepted', status: 200, message: '', at: 1 });

describe('F-07: الحفظ المتزامن لمزوّدين مختلفين لا يمحو أحدهما الآخر', () => {
  it('قائمتا نموذجين لمزوّدين حُفظتا معًا تبقيان كلتاهما', async () => {
    const cache = sessionModelsCache(slowSession());
    await Promise.all([cache.save(list('openai')), cache.save(list('gemini')), cache.save(list('anthropic'))]);
    const kept = await Promise.all(['openai', 'gemini', 'anthropic'].map((p) => cache.load(p)));
    expect(kept.map((l) => l?.provider ?? null)).toEqual(['openai', 'gemini', 'anthropic']);
  });

  it('نتيجتا اختبار لمزوّدين حُفظتا معًا تبقيان كلتاهما، ومع قائمة تُحفظ في الوقت نفسه', async () => {
    const cache = sessionModelsCache(slowSession());
    await Promise.all([cache.saveTest(test('openai')), cache.save(list('openai')), cache.saveTest(test('gemini'))]);
    const kept = await Promise.all([cache.loadTest('openai'), cache.loadTest('gemini'), cache.load('openai')]);
    expect(kept.map((t) => t?.provider ?? null)).toEqual(['openai', 'gemini', 'openai']);
  });

  it('فشل كتابة لا يوقف ما بعدها', async () => {
    const session = slowSession();
    let fail = true;
    const set = session.set;
    session.set = async (items) => {
      if (fail) {
        fail = false;
        throw new Error('synthetic quota');
      }
      return set(items);
    };
    const cache = sessionModelsCache(session);
    const [first, second] = await Promise.allSettled([cache.save(list('openai')), cache.save(list('gemini'))]);
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('fulfilled');
    expect((await cache.load('gemini'))?.provider).toBe('gemini');
  });
});
