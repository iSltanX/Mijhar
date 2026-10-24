#!/usr/bin/env node
// لقطات حقل «النموذج» (DEC-13 ن-5) على الحزمة المشحونة في Chrome، للمطابقة البصرية مع O-23 وO-27 وO-28 بالوضعين الفاتح والداكن — محاكاة: مضيفا
// OpenAI وGemini وهميان محليان، ومفاتيح مختلَقة تُركَّب وقت التشغيل. لا يحفظ إلا صورًا لعنصر الحقل، ولا سرّ فيها (لا يُعرض مفتاح بعد حفظه).
// الاستعمال: node evidence/wave-L/model-field-screens.mjs ← evidence/wave-L/screens/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, chromiumSession, sleep, waitUntil } from '../../tests/modules/d/token/browser/drivers.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screens');
const OPENAI_KEY = ['sk', 'proj', 'ModelFieldScreensFakeKey'.repeat(4)].join('-');
const GEMINI_KEY = ['AIza', 'SyFakeModelFieldScreensKey012345678'].join('');
const SECONDS = Math.floor(Date.now() / 1000);
const state = { geminiDown: true };

const openaiReply = (entry) => {
  if (entry.path === '/v1/models') return { status: 200, body: { object: 'list', data: ['gpt-mock-6', 'gpt-mock-5-mini', 'gpt-mock-embed'].map((id, i) => ({ id, object: 'model', created: SECONDS - i * 86400, owned_by: 'mock' })) } };
  const sent = JSON.parse(entry.body ?? '{}');
  if (sent.model === 'gpt-gone-1') return { status: 404, body: { error: { code: 'model_not_found', message: 'The model `gpt-gone-1` does not exist or you do not have access to it.' } } };
  return { status: 200, body: { object: 'response', status: 'completed', model: sent.model, output: [{ type: 'message', content: [{ type: 'output_text', text: 'pong' }] }] } };
};
const geminiReply = () => (state.geminiDown ? { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'unavailable' } } } : { status: 200, body: { models: [] } });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-model-field-screens-'));
fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
const manifestFile = path.join(dir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.openai.com/*', 'https://generativelanguage.googleapis.com/*'])];
delete manifest.optional_host_permissions;
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

fs.mkdirSync(OUT, { recursive: true });
const session = await chromiumSession('chrome', {
  extDir: dir,
  githubReply: () => ({ status: 404, type: 'text/plain', body: 'not found' }),
  apiReply: () => ({ status: 404, body: {} }),
  extra: { 'api.openai.com': openaiReply, 'generativelanguage.googleapis.com': geminiReply },
});
try {
  const { d } = session;
  const page = session.context.pages().find((p) => p.url().endsWith('/options.html'));
  await page.setViewportSize({ width: 900, height: 1400 });
  const select = (id) => d.options(`const s = document.querySelector('#mj-provider-select'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  const until = (code, ms = 10000) => waitUntil(() => d.options(code), ms);
  const shot = async (name) => {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await sleep(250);
      const el = page.locator('[data-model-field]');
      await el.scrollIntoViewIfNeeded();
      await el.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`) });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };
  const type = async (value) => {
    await d.options(`const f = document.querySelector('[data-model-input]'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
    await d.fill('[data-model-input]', value);
    await d.click('#mj-conn-provider-key-title');
  };

  // OpenAI بلا مفتاح (O-24): الحقل يعمل وزر + معطّل.
  await select('openai');
  await until(`return document.querySelector('[data-provider-card]')?.getAttribute('data-provider-card') === 'openai' && document.querySelector('[data-key-state]')?.getAttribute('data-key-state') === 'none' || null;`);
  await shot('1-openai-no-key');
  // بالمفتاح: القائمة مفتوحة (O-23 وO-27).
  await d.fill('#mj-key-input', OPENAI_KEY);
  await d.click('[data-action="key-save"]');
  await until(`return document.querySelector('[data-provider-key]')?.getAttribute('data-health') === 'healthy' || null;`);
  await type('gpt-mock-5-mini');
  await d.click('[data-action="model-list"]');
  await until(`return document.querySelectorAll('[role="option"]').length > 0 || null;`);
  await d.options(`const f = document.querySelector('[data-model-input]'); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); return true;`);
  await shot('2-openai-list-open');
  await d.click('[role="option"][data-model="gpt-mock-6"]');
  await until(`return document.querySelector('[data-model-input]')?.value === 'gpt-mock-6' && !document.querySelector('[data-model-list]') || null;`);
  // الاختبار: مقبول ثم مرفوض (O-28).
  await d.click('[data-action="model-test"]');
  await until(`return document.querySelector('[data-model-test="accepted"]') ? true : null;`);
  await shot('3-test-accepted');
  await type('gpt-gone-1');
  await d.click('[data-action="model-test"]');
  await until(`return document.querySelector('[data-model-test="rejected"]') ? true : null;`);
  await shot('4-test-rejected');
  // Gemini: جلب القائمة متعذّر (O-28).
  await select('gemini');
  await until(`return document.querySelector('[data-provider-card]')?.getAttribute('data-provider-card') === 'gemini' || null;`);
  await d.fill('#mj-key-input', GEMINI_KEY);
  await d.click('[data-action="key-save"]');
  await until(`return document.querySelector('[data-key-state]')?.getAttribute('data-key-state') === 'session' || null;`);
  await d.click('[data-action="model-list"]');
  await until(`return document.querySelector('[data-list-state="failed"]') ? true : null;`);
  await shot('5-gemini-list-failed');
  state.geminiDown = false;
  await d.click('[data-action="model-list-retry"]');
  await until(`return document.querySelector('[data-list-state="empty"]') ? true : null;`);
  await shot('6-gemini-list-empty');
  console.log(`حُفظت اللقطات في ${path.relative(ROOT, OUT)}`);
} finally {
  await session.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
