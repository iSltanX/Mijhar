// يحاكي وكيل CONNECT في tests/core/ui-host/browser/firefox.mjs (الأسطر 95–110) بلا Firefox:
// الخادم المحلي ينهي الاتصال أولًا (كمهلة keep-alive)، ثم يغلق العميل جانبه بعد ذلك بقليل.
// المتغير FIX=1 يضيف معالجي close المتقابلين. المتوقع بلا إصلاح: لا يُستدعى رد proxy.close() وتخرج Node برمز 13.
import net from 'node:net';
import http from 'node:http';
const FIX = process.env.FIX === '1';
const log = (m) => console.log(`[${(performance.now() / 1000).toFixed(2)}s] ${m}`);

const site = net.createServer((sock) => { sock.on('data', () => {}); setTimeout(() => sock.end(), 100); });
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const sitePort = site.address().port;

const proxy = http.createServer();
proxy.on('connect', (req, client, head) => {
  const upstream = net.connect(sitePort, '127.0.0.1', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(client);
    client.pipe(upstream);
  });
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
  if (FIX) { upstream.on('close', () => client.destroy()); client.on('close', () => upstream.destroy()); }
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));

// «Firefox»: يفتح نفقًا ويبقيه، ثم يغلق جانبه بعد أن يكون الخادم قد أنهى (+100ms).
const browser = net.connect({ port: proxy.address().port, host: '127.0.0.1', allowHalfOpen: true }, () => {
  browser.write('CONNECT github.com:443 HTTP/1.1\r\nHost: github.com:443\r\n\r\n');
});
browser.on('data', () => {});
browser.on('error', () => {});
// بعد أن ينهي الخادم (+100ms) يرسل العميل بايتات متأخرة (كتنبيه TLS أو بداية طلب) ثم يغلق جانبه.
setTimeout(() => { log('العميل يرسل بايتات متأخرة بعد إنهاء الخادم'); browser.write('late-bytes'); }, 250);
setTimeout(() => { log('العميل يغلق جانبه'); browser.end(); }, 400);

await new Promise((r) => setTimeout(r, 800));
log(`قبل الإغلاق: proxy._connections=${proxy._connections}`);
setTimeout(() => {}, 0);
await new Promise((r) => site.close(r));
log('site أُغلق');
await new Promise((r) => proxy.close(r)); // ← هنا يتعلق بلا إصلاح
log('proxy أُغلق (الرد استُدعي)');
