// خلفية تجربة T-0.5 (لا تُشحن): الحافظة في الخلفية، وطلب مزوّد التحليل من الخلفية، وضبط مستوى وصول التخزين (HYP-07).
// المفتاح التجريبي (إن وُجد) يصل في الرسالة وحدها ولا يُخزَّن ولا يُعاد في أي نتيجة.
const api = globalThis.browser ?? globalThis.chrome;
const err = (e) => ({ name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 300) });

async function providerProbe(probe) {
  const out = [];
  for (const variant of probe.variants ?? []) {
    try {
      const started = Date.now();
      const response = await fetch(probe.url ?? 'https://api.anthropic.com/v1/messages', { method: probe.method ?? 'POST', headers: variant.headers, body: probe.method === 'GET' ? undefined : JSON.stringify(variant.body ?? probe.body) });
      const contentType = response.headers.get('content-type') ?? '';
      const result = { variant: variant.name, status: response.status, type: response.type, ms: Date.now() - started, headers: {} };
      for (const name of ['content-type', 'access-control-allow-origin', 'anthropic-ratelimit-requests-limit', 'anthropic-ratelimit-input-tokens-remaining', 'retry-after']) result.headers[name] = response.headers.get(name);
      result.headers['request-id'] = response.headers.get('request-id') ? 'موجود' : null;
      if (contentType.includes('text/event-stream')) {
        // البث: تُعدّ الأحداث وأنواعها ووقت أول جزء، ولا يُحفظ النص.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstChunkMs = null;
        const types = {};
        let usage = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          firstChunkMs ??= Date.now() - started;
          buffer += decoder.decode(value, { stream: true });
          for (const line of buffer.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              types[event.type] = (types[event.type] ?? 0) + 1;
              if (event.type === 'message_start') usage = { ...event.message?.usage };
              if (event.type === 'message_delta' && event.usage) usage = { ...usage, ...event.usage };
            } catch {}
          }
          buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
        }
        Object.assign(result, { stream: true, firstChunkMs, eventTypes: types, usage });
      } else {
        let body = null;
        try {
          body = await response.json();
        } catch {}
        Object.assign(result, { error: body?.error ?? null, usage: body?.usage ?? null, inputTokens: body?.input_tokens ?? null, model: body?.model ?? null, models: Array.isArray(body?.data) ? body.data.map((m) => m.id) : null });
      }
      out.push(result);
    } catch (e) {
      out.push({ variant: variant.name, threw: err(e) });
    }
  }
  return out;
}

async function storageStep(step) {
  const out = {};
  for (const area of ['local', 'session']) {
    const s = api.storage[area];
    if (!s) {
      out[area] = { available: false };
      continue;
    }
    if (step === 'write') {
      await s.set({ 't05-secret': 'not-a-real-secret' });
      out[area] = { written: true, setAccessLevel: typeof s.setAccessLevel };
    } else if (step === 'restrict' || step === 'open') {
      const level = step === 'restrict' ? 'TRUSTED_CONTEXTS' : 'TRUSTED_AND_UNTRUSTED_CONTEXTS';
      if (typeof s.setAccessLevel !== 'function') out[area] = { setAccessLevel: typeof s.setAccessLevel };
      else {
        try {
          await s.setAccessLevel({ accessLevel: level });
          out[area] = { setAccessLevel: 'function', applied: level };
        } catch (e) {
          out[area] = { setAccessLevel: 'function', error: err(e) };
        }
      }
    } else if (step === 'clear') {
      await s.remove('t05-secret');
      out[area] = { cleared: true };
    }
  }
  return out;
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.t05) return undefined;
  (async () => {
    if (message.t05 === 'bg-clipboard') {
      const facts = { context: typeof window === 'undefined' ? 'service-worker' : 'background-page', clipboardApi: typeof globalThis.navigator?.clipboard?.writeText };
      if (facts.clipboardApi !== 'function') return { ok: false, ...facts };
      try {
        await navigator.clipboard.writeText(message.text);
        return { ok: true, ...facts, text: message.text };
      } catch (e) {
        return { ok: false, ...facts, error: err(e), text: message.text };
      }
    }
    if (message.t05 === 'provider') return providerProbe(message.probe);
    if (message.t05 === 'storage') return storageStep(message.step);
    return null;
  })().then(sendResponse, (e) => sendResponse({ threw: err(e) }));
  return true;
});
