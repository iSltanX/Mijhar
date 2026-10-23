// صفحة الإضافة: Translator بتفاعل مستخدم، ومسار ONNX (transformers.js محليًا)، وجلب مضيف النموذج المعلن.
globalThis.mjContext = 'extension-page';
const api = globalThis.browser ?? globalThis.chrome;
window.mj = {
  pending: null,
  async translatorNoActivation() { return globalThis.mjTranslatorTest({ create: true }); },
  armActivation(sentences) {
    this.pending = null;
    document.getElementById('act').onclick = () => { this.pending = globalThis.mjTranslatorTest({ create: true, sentences }); };
    return true;
  },
  async activationResult() { return this.pending ? await this.pending : { error: 'لم يُنقر الزر' }; },
  async offscreen() {
    await api.storage.local.remove('offscreen');
    const r = await api.runtime.sendMessage({ op: 'offscreen' });
    for (let i = 0; i < 600; i += 1) {
      const { offscreen } = await api.storage.local.get('offscreen');
      if (offscreen) return { create: r, result: offscreen };
      await new Promise((x) => setTimeout(x, 500));
    }
    return { create: r, result: null, note: 'انتهت المهلة' };
  },
  async background() { return api.runtime.sendMessage({ op: 'bg-translator' }); },
  async permissions() { return api.permissions.getAll(); },
  async hfFetch() {
    const out = {};
    const probe = async (label, url, init) => {
      const t0 = performance.now();
      try {
        const r = await fetch(url, init);
        const body = await r.arrayBuffer();
        out[label] = { status: r.status, finalHost: new URL(r.url).host, redirected: r.redirected, bytes: body.byteLength, ms: Math.round(performance.now() - t0) };
      } catch (e) {
        out[label] = { error: String(e), ms: Math.round(performance.now() - t0) };
      }
    };
    await probe('config', 'https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/config.json');
    await probe('onnxRange', 'https://huggingface.co/Xenova/opus-mt-en-ar/resolve/main/onnx/encoder_model_quantized.onnx', { headers: { Range: 'bytes=0-1023' } });
    return out;
  },
  async onnx({ remoteHost, paragraphs, sentences }) {
    const out = { csp: null };
    const t0 = performance.now();
    let T;
    try {
      T = await import('./lib/transformers.js');
    } catch (e) {
      return { importError: String(e) };
    }
    out.importMs = Math.round(performance.now() - t0);
    T.env.allowLocalModels = false;
    T.env.remoteHost = remoteHost;
    T.env.useBrowserCache = false;
    T.env.backends.onnx.wasm.wasmPaths = new URL('./ort/', location.href).href;
    out.crossOriginIsolated = self.crossOriginIsolated;
    out.numThreads = T.env.backends.onnx.wasm.numThreads ?? null;
    const t1 = performance.now();
    let translator;
    try {
      translator = await T.pipeline('translation', 'Xenova/opus-mt-en-ar', { dtype: 'q8', device: 'wasm' });
    } catch (e) {
      out.loadError = `${e?.message ?? e}\n${e?.stack ?? ''}`.slice(0, 600);
      out.loadMs = Math.round(performance.now() - t1);
      return out;
    }
    out.loadMs = Math.round(performance.now() - t1);
    // بطاقة النموذج: «a sentence initial language token is required in the form of >>id<<» (هنا >>ara<<)؛ يُقاس بها وبدونها.
    const run = async (items, prefix, maxTokens) => {
      const list = [];
      for (const p of items) {
        const ts = performance.now();
        const r = await translator(`${prefix}${p}`, { max_new_tokens: maxTokens });
        list.push({ chars: p.length, ms: Math.round(performance.now() - ts), text: r[0]?.translation_text });
      }
      return list;
    };
    out.paragraphs = await run(paragraphs, '>>ara<< ', 400);
    out.sentences = await run(sentences, '>>ara<< ', 256);
    out.sentencesNoPrefix = await run(sentences, '', 256);
    return out;
  },
};
document.documentElement.dataset.ready = '1';
