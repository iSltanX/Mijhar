// أداة تتبّع تُحمَّل بـ node --import قبل tests/core/ui-host/browser/run.mjs. لا تعدّل المستودع ولا سلوك الفحص.
// المخرج: ملف TRACE_FILE (كتابة متزامنة كي تبقى الأسطر الأخيرة عند الخروج غير الطبيعي).
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const require = createRequire(import.meta.url);
const out = process.env.TRACE_FILE;
const t0 = Date.now();
const log = (msg) => fs.appendFileSync(out, `[+${String((Date.now() - t0) / 1000).padStart(6)}s] ${msg}\n`);
log(`بدأ التتبع pid=${process.pid} node=${process.version}`);

const cp = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const tracked = new Set();
let sockSeq = 0;
function track(sock, kind, extra = '') {
  const rec = { id: ++sockSeq, kind, extra, at: Date.now(), closedAt: null, sock };
  tracked.add(rec);
  sock.once('close', () => { rec.closedAt = Date.now(); });
  return rec;
}
const describe = (rec) => {
  const s = rec.sock;
  return `#${rec.id} ${rec.kind}${rec.extra ? ' ' + rec.extra : ''} فُتح +${((rec.at - t0) / 1000).toFixed(2)}s destroyed=${s.destroyed} readyState=${s.readyState} paused=${s.isPaused?.()} flowing=${s.readableFlowing} readableEnded=${s.readableEnded} writableEnded=${s.writableEnded} writableLength=${s.writableLength} handle=${s._handle ? 'نعم' : 'لا'} bytesR=${s.bytesRead} bytesW=${s.bytesWritten} port=${s.remotePort ?? '-'}`;
};
const servers = [];
const spawn0 = cp.spawn;
cp.spawn = function (cmd, args, opts) {
  const isFirefox = /firefox/i.test(String(cmd));
  let options = opts;
  if (isFirefox && opts && opts.stdio === 'ignore') {
    const fd = fs.openSync(process.env.TRACE_FILE.replace(/\.log$/, '') + `.firefox-${Date.now()}.log`, 'a');
    options = { ...opts, stdio: ['ignore', fd, fd] };
  }
  const child = spawn0.call(this, cmd, args, options);
  log(`spawn ${String(cmd).split('/').pop()} pid=${child.pid}`);
  child.once('exit', (code, signal) => log(`child ${String(cmd).split('/').pop()} pid=${child.pid} خرج code=${code} signal=${signal}`));
  child.once('error', (e) => log(`child ${String(cmd).split('/').pop()} خطأ: ${e.message}`));
  return child;
};

for (const [name, mod] of [['http', http], ['https', https]]) {
  const create0 = mod.createServer;
  mod.createServer = function (...a) {
    const s = create0.apply(this, a);
    const listen0 = s.listen;
    s.listen = function (...b) { log(`${name} server listen`); return listen0.apply(this, b); };
    const close0 = s.close;
    s.close = function (...b) { log(`${name} server close() استُدعي (_connections=${s._connections})`); return close0.apply(this, b); };
    s.once('close', () => log(`${name} server أُغلق فعلًا`));
    servers.push([name, s]);
    s.on('connection', (sock) => track(sock, `${name}-conn`));
    s.on('connect', (req) => log(`CONNECT ${String(req.url).split(':')[0]}`));
    return s;
  };
}

const connect0 = net.connect;
let connectCount = 0;
net.connect = function (...a) {
  const s = connect0.apply(this, a);
  track(s, 'net.connect', `:${typeof a[0] === 'object' ? a[0].port : a[0]}`);
  const port = typeof a[0] === 'object' ? a[0].port : a[0];
  const marionette = typeof port === 'number' && ++connectCount <= 3;
  if (marionette) {
    log(`net.connect :${port}`);
    s.once('close', (hadError) => log(`socket :${port} أُغلق hadError=${hadError}`));
    s.once('error', (e) => log(`socket :${port} error ${e.code ?? e.message}`));
    s.once('end', () => log(`socket :${port} end (الطرف الآخر أنهى)`));
  }
  return s;
};

const write0 = net.Socket.prototype.write;
net.Socket.prototype.write = function (data, ...rest) {
  try {
    const text = typeof data === 'string' ? data : data?.toString?.('utf8');
    const m = text && /^\d+:\[0,(\d+),"([^"]+)"/.exec(text);
    if (m) log(`marionette → #${m[1]} ${m[2]}`);
  } catch {}
  return write0.call(this, data, ...rest);
};

const setTimeout0 = globalThis.setTimeout;
globalThis.setTimeout = function (fn, ms, ...rest) {
  const timer = setTimeout0(fn, ms, ...rest);
  if (ms === 10000) timer.unref?.();
  return timer;
};
syncBuiltinESMExports();

process.on('beforeExit', () => {
  log(`beforeExit: الموارد النشطة = ${JSON.stringify(process.getActiveResourcesInfo())}`);
  for (const [name, s] of servers) log(`  ${name} server: listening=${s.listening} _connections=${s._connections}`);
  const open = [...tracked].filter((r) => !r.closedAt);
  log(`  مقابس لم تُغلق: ${open.length} من ${tracked.size}`);
  for (const r of open) log(`    ${describe(r)}`);
});
process.on('exit', (code) => log(`exit code=${code}`));
process.on('uncaughtException', (e) => { log(`uncaughtException: ${e?.stack ?? e}`); process.exit(99); });
process.on('unhandledRejection', (e) => { log(`unhandledRejection: ${e?.stack ?? e}`); });
