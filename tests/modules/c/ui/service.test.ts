// خدمة الترجمة المجرّدة وسجلها والمحرك الوهمي (src/modules/c/ui/service.ts وfake-engine.ts): العقد الذي يُبنى عليه كل ما فوقها، وسلوكات المحرك الوهمي
// التي تُنتج مخرجات TEST-TR-02 (إسقاط رمز وتكراره واختلاقه وترجمة اسمه…) فتُختبر بها قاعدة الفشل الآمن عبر الواجهة.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateProtected } from '../../../../src/modules/c/masking';
import { FakeTranslationEngine, getTranslationService, isAbort, onTranslationServiceChange, setTranslationService } from '../../../../src/modules/c/ui';
import type { FakeMode } from '../../../../src/modules/c/ui';

afterEach(() => setTranslationService(null));

describe('سجل الخدمة', () => {
  it('افتراضيًا لا محرك، والتسجيل والإزالة يُشعِران المشتركين', () => {
    expect(getTranslationService()).toBeNull();
    const seen: Array<string | null> = [];
    const off = onTranslationServiceChange(() => seen.push(getTranslationService()?.id ?? null));
    const engine = new FakeTranslationEngine();
    setTranslationService(engine);
    setTranslationService(null);
    off();
    setTranslationService(engine);
    expect(seen).toEqual(['fake', null]);
    expect(getTranslationService()).toBe(engine);
  });

  it('isAbort يتعرف على AbortError وحده', () => {
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbort(new Error('x'))).toBe(false);
    expect(isAbort('AbortError')).toBe(false);
  });
});

describe('المحرك الوهمي', () => {
  it('لا يترجم عند الإنشاء ولا عند فحص التوفر: العدّاد صفر', async () => {
    const engine = new FakeTranslationEngine();
    expect(engine.calls).toBe(0);
    expect(await engine.availability()).toEqual({ state: 'ready' });
    expect(engine.calls).toBe(0);
    expect(new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'س' } }).availabilityState).toEqual({ state: 'unavailable', reason: 'س' });
  });

  it('faithful وreorder يُبقيان الرموز سليمة', async () => {
    const engine = new FakeTranslationEngine();
    expect(await engine.translate('Run ⟦CODE_0⟧ now')).toBe('ترجمة: Run ⟦CODE_0⟧ now');
    engine.mode = 'reorder';
    expect(await engine.translate('Run ⟦CODE_0⟧ now')).toBe('now ⟦CODE_0⟧ Run');
    expect(engine.calls).toBe(2);
    expect(engine.received).toEqual(['Run ⟦CODE_0⟧ now', 'Run ⟦CODE_0⟧ now']);
  });

  const outcomes: Array<[FakeMode, string]> = [
    ['drop', 'original-kept'],
    ['duplicate', 'original-kept'],
    ['invent', 'original-kept'],
    ['garble', 'original-kept'],
    ['faithful', 'translated'],
    ['reorder', 'translated'],
  ];
  it.each(outcomes)('الوضع %s عبر translateProtected ← %s', async (mode, expected) => {
    const engine = new FakeTranslationEngine({ mode });
    const result = await translateProtected('Run `npm install` then open src/app.ts please.', (t, c) => engine.translate(t, c));
    expect(result.status).toBe(expected);
    if (result.status === 'original-kept') expect(result.original).toBe('Run `npm install` then open src/app.ts please.');
  });

  it('flaky-whole: يفشل على الفقرة كاملة وينجح جملةً جملةً (مسار إعادة المحاولة الوحيد)', async () => {
    const engine = new FakeTranslationEngine({ mode: 'flaky-whole' });
    const result = await translateProtected('Run `npm install` first. Then open `app.ts` in the editor.', (t, c) => engine.translate(t, c));
    expect(result.status).toBe('translated');
    if (result.status === 'translated') expect(result.retryAttempts).toBe(1);
    expect(engine.calls).toBeGreaterThanOrEqual(3);
  });

  it('error يرمي، والإلغاء أثناء التأخير يرمي AbortError فورًا', async () => {
    await expect(new FakeTranslationEngine({ mode: 'error' }).translate('x')).rejects.toThrow('تعطل');
    vi.useFakeTimers();
    try {
      const engine = new FakeTranslationEngine({ delayMs: 10_000 });
      const controller = new AbortController();
      const promise = engine.translate('x', { signal: controller.signal });
      const caught = promise.catch((e: unknown) => e);
      controller.abort();
      expect(isAbort(await caught)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
