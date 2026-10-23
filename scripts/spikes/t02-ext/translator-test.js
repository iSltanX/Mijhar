// اختبار Translator API في السياق الحالي؛ مشترك بين سكربت المحتوى ووثيقة offscreen وصفحة الإضافة.
globalThis.mjTranslatorTest = async function mjTranslatorTest({ create = true, sentences = [] } = {}) {
  const out = { context: globalThis.mjContext ?? 'unknown', Translator: typeof globalThis.Translator, userActivation: navigator.userActivation ? { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive } : null };
  if (typeof globalThis.Translator === 'undefined') return out;
  try { out.availability = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' }); } catch (e) { out.availabilityError = String(e); }
  if (!create) return out;
  const progress = [];
  const t0 = performance.now();
  try {
    const translator = await Translator.create({ sourceLanguage: 'en', targetLanguage: 'ar', monitor(m) { m.addEventListener('downloadprogress', (e) => progress.push(Math.round(e.loaded * 100) / 100)); } });
    out.createMs = Math.round(performance.now() - t0);
    out.create = 'ok';
    out.progressEvents = progress.length;
    out.progressLast = progress.at(-1) ?? null;
    out.availabilityAfter = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' });
    const t1 = performance.now();
    out.sample = await translator.translate('Run the tests before opening a pull request.');
    out.sampleMs = Math.round(performance.now() - t1);
    if (sentences.length) {
      out.outputs = [];
      for (const s of sentences) {
        const ts = performance.now();
        try { out.outputs.push({ text: await translator.translate(s), ms: Math.round(performance.now() - ts) }); } catch (e) { out.outputs.push({ error: String(e) }); }
      }
    }
    translator.destroy?.();
  } catch (e) {
    out.createMs = Math.round(performance.now() - t0);
    out.create = 'failed';
    out.createError = `${e.name}: ${e.message}`;
    out.progressEvents = progress.length;
  }
  return out;
};
