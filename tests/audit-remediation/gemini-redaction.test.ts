// F-01 (تدقيق ما قبل الإصدار): رسالة خطأ Gemini تُنقَّح من المفتاح كاملة قبل قصّها، فلا يبقى منه جزء في الرسالة أيًّا كان موضعه فيها. مفتاح اصطناعي بلا شبكة.
import { describe, expect, it } from 'vitest';
import { GEMINI_ADAPTER } from '../../src/modules/e/provider/adapters/gemini';

const KEY = 'AIza' + 'Q'.repeat(35);

/** أي مقطع من المفتاح بطول 8 فأكثر ظاهر في النص. */
const leaked = (text: string, key: string): string | null => {
  for (let i = 0; i + 8 <= key.length; i += 1) {
    const part = key.slice(i, i + 8);
    if (text.includes(part)) return part;
  }
  return null;
};

const reply = (message: string) => async () =>
  new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message, details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 });

describe('F-01: تنقيح رسالة Gemini قبل قصّها', () => {
  it.each([0, 1, 200, 202, 210, 230, 239, 240, 300])('المفتاح بعد %i حرفًا من الرسالة لا يظهر منه شيء', async (offset) => {
    const result = await GEMINI_ADAPTER.listModels({ key: KEY, now: () => 1, fetch: reply('x'.repeat(offset) + KEY + ' tail') });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe('unauthorized');
    expect(leaked(result.message, KEY)).toBeNull();
  });

  it('المفتاح يُستبدل بعلامته حين يقع في الجزء المعروض', async () => {
    const result = await GEMINI_ADAPTER.listModels({ key: KEY, now: () => 1, fetch: reply('bad key ' + KEY) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('‹المفتاح›');
  });
});
