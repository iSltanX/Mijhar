#!/usr/bin/env node
// تجربة T-0.2 (MJ4): سياقات browser.trial.ml في Firefox وسلوكه عند نقص الذاكرة (AC-S2.3)، دون تنزيل نموذج:
// التفضيلان مفعّلان، وtrialML ممنوحة، ثم يُرفع browser.ml.minimumPhysicalMemory فوق ذاكرة الجهاز ويُطلب المحرك.
// الاستعمال: node scripts/spikes/t02-firefox-ml.mjs --pkgs <الحزم> --cache <ذاكرة النموذج> --out evidence/T-0.2/raw/firefox-ml.json
import http from 'node:http';
import { launchFirefox, sleep, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args.splice(i, 2)[1]; };
const outFile = take('--out');
const pkgs = take('--pkgs');
const cache = take('--cache');
// يُعاد استعمال بناء firefox الذي أنتجته t02-engines.mjs، مع نسخ الملفات الثلاثة المعدّلة بعده.
void pkgs;
const { default: fs } = await import('node:fs');
const path = (await import('node:path')).default;
const buildDir = path.join(cache, '..', 't02-build', 'firefox');
for (const f of ['bg.js', 'cs.js', 'ml.js']) fs.copyFileSync(new URL(`./t02-ext/${f}`, import.meta.url), path.join(buildDir, f));

const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!DOCTYPE html><p>mj</p>'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const ff = await launchFirefox({ prefs: { 'browser.ml.enable': true, 'extensions.ml.enabled': true } });
const GRANT = `
  const [id, perms, origins] = arguments; const done = arguments[arguments.length - 1];
  const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
  ExtensionPermissions.add(id, { permissions: perms, origins }, WebExtensionPolicy.getByID(id).extension).then(() => done(true), (e) => done(String(e)));
`;
const call = (expr, arg) => ff.execAsync(`const done = arguments[arguments.length - 1]; Promise.resolve((window.wrappedJSObject ?? window).${expr}(arguments[0])).then((v) => done(JSON.parse(JSON.stringify(v ?? null))), (e) => done({ error: String(e) }));`, [arg ?? null], 'content', 300000);
const r = { version: ff.version, memoryGB: Math.round((await import('node:os')).default.totalmem() / 2 ** 30) };
try {
  const id = await ff.installAddon(buildDir);
  const uuid = await ff.exec('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname;', [id], 'chrome');
  await ff.execAsync(GRANT, [id, ['trialML'], [`http://127.0.0.1/*`]], 'chrome');
  await ff.navigate(`${origin}/`);
  await sleep(2000);
  r.contentScript = JSON.parse(await ff.exec('return document.documentElement.dataset.mjCsInit ?? "null";'));
  await ff.navigate(`moz-extension://${uuid}/ml.html`);
  await sleep(1000);
  r.extensionPage = await call('mjMl.probe');
  r.background = await call('mjMl.background');
  await ff.exec("Services.prefs.setIntPref('browser.ml.minimumPhysicalMemory', 1024); return true;", [], 'chrome');
  r.lowMemory = { pref: 'browser.ml.minimumPhysicalMemory=1024 (فوق ذاكرة الجهاز)', run: await call('mjMl.run', { taskName: 'translation', modelId: 'Xenova/opus-mt-en-ar', modelHub: 'huggingface', dtype: 'q8', input: 'Hello' }) };
  // المحرك مرة واحدة ثم runEngine لكل جملة (إنشاء محرك ثانٍ يُرفض: «Engine already created»، مقيس في engines-firefox.json).
  await ff.exec("Services.prefs.clearUserPref('browser.ml.minimumPhysicalMemory'); return true;", [], 'chrome');
  await ff.navigate(`moz-extension://${uuid}/ml.html`);
  await sleep(1000);
  const ref = JSON.parse(fs.readFileSync(new URL('../../fixtures/spikes/t02-reference.json', import.meta.url), 'utf8'));
  const { mask } = await import('./t02-validator.mjs');
  const masked = ref.sentences.map((x) => mask(x));
  const { sampleRss } = await import('./lib.mjs');
  const rss = sampleRss(ff.profileDir);
  const first = await call('mjMl.run', { taskName: 'translation', modelId: 'Xenova/opus-mt-en-ar', modelHub: 'huggingface', dtype: 'q8', input: masked[0].masked });
  r.engine = { createMs: first.createMs, error: first.error ?? null, progressLast: first.progress?.at(-1) ?? null };
  r.sentences = [{ result: first.result, ms: first.runMs }];
  for (const m of masked.slice(1)) r.sentences.push(await call('mjMl.runOnly', m.masked));
  const paragraphs = [];
  for (const p of ref.paragraphs) paragraphs.push(await call('mjMl.runOnly', p));
  r.paragraphs = paragraphs.map((x) => ({ ms: x.ms, text: x.result?.[0]?.translation_text ?? x.error }));
  r.rss = rss.stop();
} catch (e) {
  r.error = String(e.stack ?? e);
} finally {
  await ff.close();
  server.close();
}
console.log(JSON.stringify({ ...r, sentences: r.sentences?.length, paragraphs: r.paragraphs?.map((x) => x.ms) }, null, 2));
if (outFile) writeJson(outFile, { masked: null, results: [{ browser: 'firefox', version: r.version, ml: { contexts: { contentScript: r.contentScript, extensionPage: r.extensionPage, background: r.background }, lowMemory: r.lowMemory, engine: r.engine, sentences: r.sentences, paragraphs: r.paragraphs, rss: r.rss, error: r.error } }] });
