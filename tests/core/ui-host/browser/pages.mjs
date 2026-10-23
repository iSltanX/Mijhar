// ما يشترك فيه مشغّلا Chromium وFirefox: العينات التي تُخدَم بدل github.com، وانتظار شرط.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export const PAGES = {
  '/octo/demo/pull/42': { file: 'pages/pr.html' },
  '/octo/control/pull/1': { file: 'adversarial/control-pr.html' },
  '/octo/hostile/pull/1': { file: 'adversarial/hostile-pr.html', csp: "style-src 'self'" },
  '/assets/hostile.css': { file: 'adversarial/hostile.css', type: 'text/css; charset=utf-8' },
};
export const CONTROL_URL = 'https://github.com/octo/control/pull/1';
export const HOSTILE_URL = 'https://github.com/octo/hostile/pull/1';
export const readFixture = (file) => fs.readFileSync(path.join(ROOT, 'fixtures', file), 'utf8');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitUntil(read, timeoutMs = 5000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}
