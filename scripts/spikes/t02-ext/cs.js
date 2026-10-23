// سكربت المحتوى: يقيس Translator في عالم الإضافة المعزول على صفحة الاختبار المحلية.
globalThis.mjContext = 'content-script';
(async () => {
  const init = await globalThis.mjTranslatorTest({ create: false });
  init.trialMl = typeof globalThis.browser?.trial?.ml;
  document.documentElement.dataset.mjCsInit = JSON.stringify(init);
  const btn = document.createElement('button');
  btn.id = 'mj-cs-act';
  btn.textContent = 'mj activate';
  btn.addEventListener('click', async () => {
    document.documentElement.dataset.mjCsActivationAtClick = String(navigator.userActivation?.isActive);
    const r = await globalThis.mjTranslatorTest({ create: true });
    document.documentElement.dataset.mjCs = JSON.stringify(r);
  });
  document.body.appendChild(btn);
  // محاولة بلا تفاعل مستخدم.
  const noAct = await globalThis.mjTranslatorTest({ create: true });
  document.documentElement.dataset.mjCsNoActivation = JSON.stringify(noAct);
})();
