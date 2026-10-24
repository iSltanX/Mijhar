// مسجّل الشبكة لمتصفحات Chromium عبر CDP الخام (T-4.5، TEST-PRIV-01): يتصل بمنفذ التصحيح (--remote-debugging-port) ويلحق نفسه بكل هدف
// (الصفحات وعمّال الخدمة للإضافة وصفحاتها والإطارات والعمّال) فيرصد Network.requestWillBeSent وwebSocketCreated من الجميع، لا من الصفحة وحدها.
// أداة قياس لا تُشحن (لا يستوردها شيء من الإضافة). تعمل على WebSocket العام في Node ≥ 22.
//  - الرصد يحدث عند إصدار الطلب، قبل أي اعتراض: الطلب الذي تحجبه الأداة (route.abort) يظهر هنا كما لو خرج.
//  - ما يجريه المتصفح نفسه خارج الأهداف (تنزيل حزمة اللغة، المحدّث، السلامة) لا يمر بهذه الأهداف فلا يظهر، ولا يُدّعى فحصه.
const TYPES = new Set(['page', 'service_worker', 'background_page', 'iframe', 'worker', 'shared_worker', 'webview', 'other', 'tab']);

/**
 * @param {string} wsUrl عنوان WebSocket للمتصفح (webSocketDebuggerUrl من /json/version)
 */
export async function attachNetworkRecorder(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`تعذّر الاتصال بـ${wsUrl}`)), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const attached = new Set();
  const sessions = new Map();
  /** @type {any[]} */
  const requests = [];
  const targets = [];
  let stopped = false;
  // الهدف الواحد قد يُلحَق به مرتين (اكتشاف يدوي وإلحاق تلقائي): الطلب نفسه يصل من الجلستين فيُسجَّل مرة.
  const seen = new Set();
  const first = (key) => (seen.has(key) ? false : (seen.add(key), true));

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) return resolve(null);
      const id = (nextId += 1);
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const quiet = (promise) => promise.catch(() => null);

  async function init(sessionId, info, waiting) {
    sessions.set(sessionId, info);
    targets.push({ type: info.type, url: info.url, title: info.title });
    await quiet(send('Network.enable', { maxPostDataSize: 65536 }, sessionId));
    await quiet(send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId));
    if (waiting) await quiet(send('Runtime.runIfWaitingForDebugger', {}, sessionId));
  }

  async function attach(targetId) {
    if (attached.has(targetId) || stopped) return;
    attached.add(targetId);
    await quiet(send('Target.attachToTarget', { targetId, flatten: true }));
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (p) (msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result));
      return;
    }
    const { method, params, sessionId } = msg;
    if (method === 'Target.targetCreated' && TYPES.has(params.targetInfo.type)) void attach(params.targetInfo.targetId);
    else if (method === 'Target.attachedToTarget') {
      attached.add(params.targetInfo.targetId);
      void init(params.sessionId, params.targetInfo, params.waitingForDebugger);
    } else if (method === 'Network.requestWillBeSent') {
      const r = params.request;
      if (!first(`${params.requestId}|${r.method}|${r.url}`)) return;
      const info = sessions.get(sessionId) ?? {};
      const entry = {
        url: r.url,
        method: r.method,
        type: params.type,
        initiator: params.initiator?.type,
        documentURL: params.documentURL,
        headers: r.headers ?? {},
        postData: r.postData ?? null,
        hasPostData: Boolean(r.hasPostData),
        requestId: params.requestId,
        t: Date.now(),
        target: { type: info.type, url: info.url },
      };
      requests.push(entry);
      if (entry.hasPostData && entry.postData === null) {
        void quiet(send('Network.getRequestPostData', { requestId: params.requestId }, sessionId)).then((res) => {
          if (res?.postData) entry.postData = res.postData;
        });
      }
    } else if (method === 'Network.webSocketCreated') {
      if (!first(`ws|${params.requestId}|${params.url}`)) return;
      const info = sessions.get(sessionId) ?? {};
      requests.push({ url: params.url, method: 'WEBSOCKET', type: 'WebSocket', headers: {}, postData: null, t: Date.now(), target: { type: info.type, url: info.url } });
    }
  });

  await send('Target.setDiscoverTargets', { discover: true });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const { targetInfos } = (await send('Target.getTargets')) ?? { targetInfos: [] };
  for (const info of targetInfos) if (TYPES.has(info.type)) await attach(info.targetId);

  return {
    /** كل الطلبات المسجَّلة حتى الآن (نسخة). */
    snapshot: () => requests.map((r) => ({ ...r })),
    /** الطلبات بين طابعين زمنيين (ms). */
    between: (from, to = Date.now()) => requests.filter((r) => r.t >= from && r.t <= to).map((r) => ({ ...r })),
    /** الأهداف التي أُلحق بها المسجّل (للتحقق من أن عامل الإضافة رُصد). */
    targets: () => [...targets],
    async stop() {
      stopped = true;
      ws.close();
    },
  };
}

/** عنوان WebSocket للمتصفح من منفذ التصحيح. */
export async function browserWsUrl(port) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`لا منفذ تصحيح على ${port}`);
}
