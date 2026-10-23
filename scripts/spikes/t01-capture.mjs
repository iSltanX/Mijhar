#!/usr/bin/env node
// تجربة T-0.1 (MJ4): حفظ عينات حقيقية من صفحات GitHub العامة بعد اكتمال عرضها (بلا تسجيل دخول).
// يُحفظ DOM المعروض بلا <script> ولا بيانات JSON المضمّنة ولا مسبقات التحميل، مع روابط أنماط GitHub كما هي،
// فتُعرض العينة قريبة من الأصل حين تُقدَّم محليًا. الاستعمال: node scripts/spikes/t01-capture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'fixtures/spikes');

export const SAMPLES = [
  { name: 'readme-shakkala', kind: 'README عربي مشكول مع جداول وكود', url: 'https://github.com/Barqawiz/Shakkala' },
  { name: 'readme-js-algorithms-ar', kind: 'README عربي مختلط بقوائم وروابط وكود', url: 'https://github.com/trekhleb/javascript-algorithms/blob/master/README.ar-AR.md' },
  { name: 'repo-arabic-stop-words', kind: 'صفحة مستودع بوصف وREADME', url: 'https://github.com/mohataher/arabic-stop-words' },
  { name: 'issue-etos-1', kind: 'محادثة Issue عربية مختلطة', url: 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1' },
  { name: 'issue-winscreen-1', kind: 'محادثة Issue عربية', url: 'https://github.com/M-Tech54/WinScreen-Lite-By-python/issues/1' },
  { name: 'pr-watad-80', kind: 'محادثة PR عربية مختلطة', url: 'https://github.com/Watad-Project/Watad/pull/80' },
  { name: 'commits-bms', kind: 'قائمة التزامات برسائل عربية', url: 'https://github.com/ahrrfy/business_management_system/commits' },
  { name: 'commit-bms-1', kind: 'صفحة التزام برسالة عربية (بلا جداول الفروق لحجمها)', url: null, stripDiff: true },
];

export async function capture(page, sample) {
  await page.goto(sample.url, { waitUntil: 'domcontentloaded' });
  await sleep(7000);
  await page.mouse.wheel(0, 30000);
  await sleep(2500);
  return page.evaluate((stripDiff) => {
    const clone = document.documentElement.cloneNode(true);
    if (stripDiff) clone.querySelectorAll('table').forEach((e) => e.remove());
    clone.querySelectorAll('script, link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"], template, iframe').forEach((e) => e.remove());
    clone.querySelectorAll('meta[name="csrf-token"], meta[name="request-id"], meta[name="html-safe-nonce"], meta[name="visitor-payload"], meta[name="visitor-hmac"], input[name="authenticity_token"]').forEach((e) => e.remove());
    return `<!DOCTYPE html>\n${clone.outerHTML}`;
  }, Boolean(sample.stripDiff));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchChromium('chrome');
  const index = [];
  try {
    const page = await browser.context.newPage();
    for (const sample of SAMPLES) {
      if (!sample.url) {
        // أول التزام في القائمة المحفوظة.
        await page.goto('https://github.com/ahrrfy/business_management_system/commits', { waitUntil: 'domcontentloaded' });
        await sleep(6000);
        sample.url = await page.evaluate(() => new URL(document.querySelector('a[href*="/commit/"]').getAttribute('href'), location.href).href.replace(/#.*$/, ''));
      }
      const html = await capture(page, sample);
      const file = path.join(OUT, `gh-${sample.name}.html`);
      fs.writeFileSync(file, html);
      index.push({ ...sample, file: path.relative(ROOT, file), bytes: Buffer.byteLength(html), capturedAt: new Date().toISOString() });
      console.error(`${sample.name}: ${Buffer.byteLength(html)} بايت`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify({ browser: browser.version, samples: index }, null, 2) + '\n');
}
