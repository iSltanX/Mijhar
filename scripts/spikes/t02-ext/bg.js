// إضافة قياس T-0.2 (MJ4) — لا تُشحن. الخلفية: تنشئ وثيقة offscreen (Chromium) وتخزن نتائجها.
const api = globalThis.browser ?? globalThis.chrome;
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.op === 'offscreen') {
    (async () => {
      try {
        if (!api.offscreen) return sendResponse({ error: 'لا واجهة offscreen في هذا المتصفح' });
        // وثيقة جديدة في كل مرة ليُعاد الاختبار (قبل التنزيل وبعده).
        if (await api.offscreen.hasDocument?.()) await api.offscreen.closeDocument();
        await api.offscreen.createDocument({ url: 'offscreen.html', reasons: ['WORKERS'], justification: 'MJ4 spike: Translator API availability in offscreen context' });
        sendResponse({ created: true });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }
  if (msg?.op === 'offscreen-result') {
    api.storage.local.set({ offscreen: msg.result });
  }
  if (msg?.op === 'bg-translator') {
    (async () => {
      const out = { Translator: typeof globalThis.Translator };
      if (globalThis.Translator) {
        try { out.availability = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' }); } catch (e) { out.availabilityError = String(e); }
      }
      sendResponse(out);
    })();
    return true;
  }
  if (msg?.op === 'bg-ml') {
    sendResponse({ trial: typeof globalThis.browser?.trial, ml: typeof globalThis.browser?.trial?.ml });
    return false;
  }
  return false;
});
