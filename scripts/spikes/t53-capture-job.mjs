#!/usr/bin/env node
// MJ11 (T-5.3): حفظ صفحة مهمة Actions فاشلة على مستودع عام بلا تسجيل دخول، بالدالة نفسها التي حفظت بها T-0.1 وT-5.4 عيناتهما
// (t01-capture.mjs: DOM المعروض بلا <script> ولا JSON مضمّن ولا رموز جلسة). المهمة هي التي قاستها T-0.3 (evidence/T-0.3/raw/logs.json)،
// فإن لم تعد متاحة يُبحث عن أحدث مهمة فاشلة في الصفحة العامة لتشغيلات المستودع نفسه. تُحفظ في fixtures/logs/ مع gh-job-samples.json.
// الاستعمال: node scripts/spikes/t53-capture-job.mjs [رابط صفحة مهمة]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from './lib.mjs';
import { capture } from './t01-capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'fixtures/logs');
const DEFAULT = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const url = process.argv[2] ?? DEFAULT;

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChromium('chrome');
try {
  const page = await browser.context.newPage();
  const html = await capture(page, { url });
  const probe = await page.evaluate(() => ({
    title: document.title,
    steps: [...document.querySelectorAll('check-step')].map((s) => ({ name: s.getAttribute('data-name'), number: s.getAttribute('data-number'), conclusion: s.getAttribute('data-conclusion'), logUrl: s.getAttribute('data-log-url') })),
    annotations: [...document.querySelectorAll('annotation-message')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()).slice(0, 10),
    signIn: /Sign in to view logs/.test(document.body.innerText),
  }));
  const file = path.join(OUT, 'gh-job-failed.html');
  fs.writeFileSync(file, html);
  const index = { browser: browser.version, samples: [{ name: 'job-failed', url, file: path.relative(ROOT, file), bytes: Buffer.byteLength(html), capturedAt: new Date().toISOString(), probe }] };
  fs.writeFileSync(path.join(OUT, 'gh-job-samples.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.error(`${url}: ${Buffer.byteLength(html)} بايت؛ خطوات ${probe.steps.length}، تنبيهات ${probe.annotations.length}، «Sign in to view logs» ${probe.signIn}`);
} finally {
  await sleep(100);
  await browser.close();
}
