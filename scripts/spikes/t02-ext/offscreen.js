// وثيقة offscreen (Chromium): Translator بلا أي تفاعل مستخدم ممكن.
globalThis.mjContext = 'offscreen';
(async () => {
  const result = await globalThis.mjTranslatorTest({ create: true });
  chrome.runtime.sendMessage({ op: 'offscreen-result', result });
})();
