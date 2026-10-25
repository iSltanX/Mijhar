#!/usr/bin/env node
// AD-38 في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build)، بمشغّلي MJ15 ومضيف Anthropic وهمي محليًا: لا شبكة خارجية.
// مفتاح حساب خدمة مختلَق (sk-ant-svc-…) يُركَّب وقت التشغيل ولا يُكتب في أي دليل؛ والمزوّد الوهمي يعامله مفتاحًا غير مقيّد بمساحة عمل:
//   1. البطاقة تقبل صيغته محليًا (لا رفض «لا يطابق صيغة») وترسل طلب التحقق المعلن وحده من الخلفية، بلا anthropic-workspace-id.
//   2. ردّ 400 «not scoped to a workspace»: رسالة تحذير تسمّي مساحة العمل، والمفتاح «غير متحقق منه» لا «منتهٍ».
//   3. معرّف مساحة عمل بشكل خاطئ يُرفض محليًا بلا طلب؛ والصحيح يُحفظ بلا طلب، ثم «تحقق من المفتاح» يرسله في الترويسة فيُقبل المفتاح.
//   4. المعرّف يبقى بعد إعادة فتح الإعدادات؛ ولا مفتاح في DOM الإعدادات ولا الكونسول.
// الاستعمال: node tests/modules/e/provider/browser/anthropic-workspace-check.mjs [chrome edge brave firefox] [--out-dir <dir>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const KEY = ['sk', 'ant', 'svc', 'WsCheckFakeKeyOnly_'.repeat(3)].join('-');
const WS = 'wrkspc_01WsCheckSynthetic';
const SECRET_RE = /sk-ant-[A-Za-z0-9_-]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
const MODELS = [{ type: 'model', id: 'mock-haiku-2', display_name: 'Mock Haiku 2', lifecycle: 'active', max_tokens: 2048 }];

const githubReply = () => ({ status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });
const error = (status, type, message) => ({ status, body: { type: 'error', error: { type, message } } });

/** Anthropic وهمي لمفتاح غير مقيّد بمساحة عمل، برسائل الخطأ الموثّقة. */
function anthropicReply(entry) {
  const h = Object.fromEntries(Object.entries(entry.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (h.authorization !== `Bearer ${KEY}` || h['x-api-key'] !== undefined) return error(401, 'authentication_error', 'invalid bearer token');
  const ws = h['anthropic-workspace-id'];
  if (ws === undefined) return error(400, 'invalid_request_error', 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use. Add the header, or use an API key that is scoped to a workspace.');
  if (ws !== WS) return error(404, 'not_found_error', `Workspace \`${ws}\` not found.`);
  if (entry.path.startsWith('/v1/models')) return { status: 200, body: { data: MODELS, has_more: false } };
  return error(404, 'not_found_error', 'not found');
}

/** نسخة من dist/<target>: الشيفرة كما هي، ومضيف المزوّد ممنوح آليًا (لا نافذة إذن). */
function derived(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-ad38-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.anthropic.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

async function scenario(d, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const sent = () => network.extra.map((r) => ({ method: r.method, path: r.path, from: r.from, workspace: Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === 'anthropic-workspace-id')?.[1] ?? null }));
  const card = await waitUntil(() => d.options(`const c = document.querySelector('[data-provider-card]'); return c ? { id: c.getAttribute('data-provider-card'), ws: Boolean(c.querySelector('[data-workspace-field]')), help: c.querySelector('#mj-workspace-help')?.textContent ?? '' } : null;`), 10000);
  check('بطاقة Anthropic فيها حقل «معرّف مساحة العمل» الاختياري ويعلن ترويسته ومضيفه', card?.id === 'anthropic' && card.ws && card.help.includes('anthropic-workspace-id') && card.help.includes('api.anthropic.com'), card);

  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const first = await waitUntil(() => d.options(`const m = document.querySelector('[data-key-message]'); const k = document.querySelector('[data-key-check]'); return m && m.getAttribute('data-tone') === 'warning' ? { message: m.textContent, health: k?.getAttribute('data-health') ?? null } : null;`), 12000);
  check('مفتاح sk-ant-svc… يمر بفحص الصيغة؛ ورفض مساحة العمل تحذير يسمّيها، والمفتاح «غير متحقق منه» لا «منتهٍ»', first && first.message.includes('معرّف مساحة عمل') && first.message.includes('not scoped to a workspace') && first.health === 'unverified', first);
  check('طلب واحد: التحقق المعلن GET /v1/models من الخلفية، بلا ترويسة مساحة عمل', JSON.stringify(sent()) === JSON.stringify([{ method: 'GET', path: '/v1/models?limit=100', from: 'background', workspace: null }]), sent());

  await d.fill('[data-workspace-input]', 'wrkspc_bad!');
  await d.click('[data-provider-rules]');
  const bad = await waitUntil(() => d.options(`return document.querySelector('[data-workspace-error]')?.textContent ?? null;`), 5000);
  check('معرّف بشكل خاطئ يُرفض محليًا ولا يُحفظ ولا يُرسل', bad && bad.includes('wrkspc_') && network.extra.length === 1, { bad, requests: network.extra.length });

  await d.fill('[data-workspace-input]', WS);
  await d.click('[data-provider-rules]');
  const saved = await waitUntil(() => d.options(`const m = document.querySelector('[data-key-message]')?.textContent ?? ''; return m.includes('حُفظ معرّف مساحة العمل') && !document.querySelector('[data-workspace-error]') ? m : null;`), 5000);
  check('المعرّف الصحيح يُحفظ بلا طلب، والرسالة تعلن ترويسته', saved && saved.includes('anthropic-workspace-id') && network.extra.length === 1, { saved, requests: network.extra.length });

  await d.click('[data-action="key-check"]');
  const healthy = await waitUntil(() => d.options(`const k = document.querySelector('[data-key-check]'); return k?.getAttribute('data-health') === 'healthy' ? { text: k.textContent, html: document.documentElement.outerHTML } : null;`), 12000);
  const second = sent()[1];
  check('«تحقق من المفتاح» يرسل المعرّف في anthropic-workspace-id فيُقبل المفتاح', healthy && second?.workspace === WS && second.from === 'background' && network.extra.length === 2, { second, health: Boolean(healthy) });
  check('لا مفتاح في DOM الإعدادات', healthy && !hasSecret(healthy.html), null);

  await d.options(`location.reload(); return true;`).catch(() => null);
  await sleep(1500);
  const kept = await waitUntil(() => d.options(`const v = document.querySelector('[data-workspace-input]')?.value; return v ? v : null;`), 10000);
  check('المعرّف يبقى بعد إعادة فتح الإعدادات', kept === WS, kept);
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derived(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  try {
    const options = { extDir, githubReply, apiReply, extra: { 'api.anthropic.com': anthropicReply } };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, checks, session.network);
    result.extensionErrors = await session.extensionErrors();
  } catch (e) {
    result.error = String(e?.stack ?? e);
  } finally {
    if (session) {
      // وسوم فقط: لا قيم ترويسات المفتاح ولا أجسام.
      result.network = session.network.extra.map((r) => {
        const h = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        return { method: r.method, path: r.path, from: r.from, key: h.authorization === `Bearer ${KEY}` ? 'synthetic-bearer' : h.authorization || h['x-api-key'] ? 'other' : null, workspace: h['anthropic-workspace-id'] ?? null };
      });
      result.blockedExternalHosts = [...session.network.blocked].sort();
      result.consoleHasSecret = hasSecret(await Promise.resolve(session.consoleText()).catch(() => ''));
      await session.close();
    }
    fs.rmSync(extDir, { recursive: true, force: true });
  }
  return result;
}

const results = {};
for (const key of keys.length ? keys : ['chrome', 'firefox']) {
  console.log(`— ${BROWSERS[key].label}`);
  const r = await run(key);
  results[key] = r;
  if (r.error) console.log(`  ✗ خطأ: ${r.error}`);
  if (r.consoleHasSecret) console.log('  ✗ سرّ في الكونسول');
}
const failed = Object.values(results).some((r) => r.error || r.consoleHasSecret || r.checks.some((c) => !c.ok));
const out = JSON.stringify({ check: 'AD-38 anthropic-workspace', at: new Date().toISOString(), results }, null, 2);
if (hasSecret(out)) throw new Error('الناتج يحتوي سرًّا؛ لم يُكتب');
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'anthropic-workspace-check.json'), `${out}\n`);
}
console.log(failed ? 'فشل' : 'نجح');
process.exit(failed ? 1 : 0);
