// Firefox: مسار browser.trial.ml في صفحة إضافة (تُمنح صلاحية trialML الاختيارية من سياق chrome قبل الاستدعاء).
window.mjMl = {
  async background() { return browser.runtime.sendMessage({ op: 'bg-ml' }); },
  async probe() {
    return { trial: typeof browser.trial, ml: typeof browser.trial?.ml, methods: browser.trial?.ml ? Object.keys(browser.trial.ml) : [] };
  },
  async runOnly(input) {
    const t0 = performance.now();
    try {
      const result = await browser.trial.ml.runEngine({ args: [input] });
      return { result, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { error: `${e?.name ?? ''}: ${e?.message ?? e}` };
    }
  },
  async run({ taskName, modelId, modelHub, dtype, input }) {
    const out = { progress: [] };
    const onProgress = (p) => out.progress.push({ type: p.type, statusText: p.statusText, progress: p.progress, ok: p.ok });
    try { browser.trial.ml.onProgress.addListener(onProgress); } catch (e) { out.progressListenerError = String(e); }
    const t0 = performance.now();
    try {
      await browser.trial.ml.createEngine({ taskName, modelId, modelHub, dtype });
      out.createMs = Math.round(performance.now() - t0);
      const t1 = performance.now();
      out.result = await browser.trial.ml.runEngine({ args: Array.isArray(input) ? input : [input] });
      out.runMs = Math.round(performance.now() - t1);
    } catch (e) {
      out.error = `${e?.name ?? ''}: ${e?.message ?? e}`;
      out.elapsedMs = Math.round(performance.now() - t0);
    }
    out.progress = out.progress.slice(-5);
    return out;
  },
};
document.documentElement.dataset.ready = '1';
