// اختيار المحرك وفق DEC-03 ج-2 (TEST-TR-04، AC-C4): بالتوفر المكتشف وقت التشغيل لا باسم المتصفح؛ وغياب Translator API حالة صريحة؛ والتسجيل
// عند بدء سكربت المحتوى لا يسأل المتصفح ولا يترجم.
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES, installTranslationEngine, selectLocalEngine, TranslatorApiEngine, UnavailableEngine } from '../../../../src/modules/c/engines';
import { getTranslationService, setTranslationService } from '../../../../src/modules/c/ui';
import { FakeTranslatorApi } from './fake-translator';

afterEach(() => setTranslationService(null));

/** سياق لا يُقرأ منه شيء غير Translator: أي وصول إلى navigator (اسم المتصفح) يفشل الاختبار. */
function scopeWith(translator: unknown): object {
  return {
    Translator: translator,
    get navigator(): never {
      throw new Error('الاختيار لا يقرأ navigator');
    },
  };
}

describe('selectLocalEngine', () => {
  it('Translator API موجودة ← مهايئها، وحالته من availability() وقت التشغيل (Chrome وBrave: جاهز؛ Edge: سبب صريح)', async () => {
    const chrome = selectLocalEngine(scopeWith(new FakeTranslatorApi({ state: 'downloadable' }).asGlobal()));
    expect(chrome).toBeInstanceOf(TranslatorApiEngine);
    expect(await chrome.availability()).toEqual({ state: 'ready' });
    const edge = selectLocalEngine(scopeWith(new FakeTranslatorApi({ state: 'unavailable' }).asGlobal()));
    expect(edge).toBeInstanceOf(TranslatorApiEngine);
    expect(await edge.availability()).toEqual({ state: 'unavailable', reason: ENGINE_MESSAGES.pairUnavailable });
  });

  it('لا Translator API (Firefox) ← لا محرك محلي بسبب صريح، والترجمة ترمي السبب نفسه', async () => {
    const engine = selectLocalEngine(scopeWith(undefined));
    expect(engine).toBeInstanceOf(UnavailableEngine);
    expect(await engine.availability()).toEqual({ state: 'unavailable', reason: ENGINE_MESSAGES.noEngine });
    await expect(engine.translate('x', {})).rejects.toThrow(ENGINE_MESSAGES.noEngine);
  });

  it('شيء باسم Translator بلا create وavailability لا يُعدّ محركًا', () => {
    expect(selectLocalEngine(scopeWith({ create: () => null }))).toBeInstanceOf(UnavailableEngine);
    const partial = Object.assign(() => null, { availability: async () => 'available' });
    expect(selectLocalEngine(scopeWith(partial))).toBeInstanceOf(UnavailableEngine);
  });

  it('لا مسار ONNX ولا browser.trial.ml: وجود browser.trial.ml في السياق لا يغيّر الاختيار', () => {
    const firefox = { browser: { trial: { ml: { createEngine: () => null, runEngine: () => null } } } };
    expect(selectLocalEngine(firefox)).toBeInstanceOf(UnavailableEngine);
  });
});

describe('installTranslationEngine', () => {
  it('يسجّل المحرك المختار لواجهة الترجمة دون أن يسأل المتصفح أو ينشئ مترجمًا', () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = installTranslationEngine(scopeWith(fake.asGlobal()));
    expect(getTranslationService()).toBe(engine);
    expect(engine.id).toBe('translator-api');
    expect(fake.availabilityCalls).toBe(0);
    expect(fake.createCalls).toBe(0);
  });

  it('في سياق بلا Translator API يسجّل محركًا غير متاح (فتظهر الحالة الصريحة والبديل لا السكون)', () => {
    expect(installTranslationEngine(scopeWith(undefined)).id).toBe('none');
    expect(getTranslationService()?.id).toBe('none');
  });
});
