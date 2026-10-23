#!/usr/bin/env node
// MJ8 (T-5.4): حفظ ثلاث صفحات مقارنة عامة حقيقية (فرعان والتزامان ووسمان) بلا تسجيل دخول، بالدالة نفسها التي حفظت بها T-0.1 عيناتها
// (t01-capture.mjs: DOM المعروض بلا <script> ولا JSON مضمّن ولا رموز جلسة). تُحفظ في tests/modules/d/fixtures/ بأسماء gh-compare-*.html
// مع gh-compare-samples.json (المصدر ووقت الحفظ والحجم). الاستعمال: node scripts/spikes/t54-capture-compare.mjs
// أذن المالك بحفظها صراحةً في 2026-10-23 (ثلاث صفحات عامة، قراءة فقط). الالتزامان يُشتقّان من رابط «Permalink» في صفحة وسمين آخرين
// فلا يُكتب أي sha بيد.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from './lib.mjs';
import { capture } from './t01-capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tests/modules/d/fixtures');

const REPO = 'https://github.com/sindresorhus/is-plain-obj';
const SAMPLES = [
  { name: 'branches', kind: 'مقارنة بين فرعين (مستودع octocat/Hello-World الرسمي للتجارب)', url: 'https://github.com/octocat/Hello-World/compare/master...octocat-patch-1' },
  { name: 'tags', kind: 'مقارنة بين وسمين (إصداران)', url: `${REPO}/compare/v3.0.0...v4.0.0` },
  // الالتزامان: sha الطرفين كما يحلّهما GitHub لـv4.0.0...v4.1.0 (رابط Permalink في الصفحة نفسها).
  { name: 'commits', kind: 'مقارنة بين التزامين', url: null, derive: `${REPO}/compare/v4.0.0...v4.1.0` },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await launchChromium('chrome');
const index = [];
try {
  const page = await browser.context.newPage();
  for (const sample of SAMPLES) {
    if (!sample.url) {
      await page.goto(sample.derive, { waitUntil: 'domcontentloaded' });
      await sleep(6000);
      const permalink = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /^Permalink$/.test(a.textContent.trim()))?.href);
      const m = /\/compare\/[^:/]+:([0-9a-f]{7,40})\.\.\.[^:/]+:([0-9a-f]{7,40})/.exec(permalink ?? '');
      if (!m) throw new Error(`لم يُعثر على Permalink بـsha في ${sample.derive}`);
      sample.url = `${REPO}/compare/${m[1]}...${m[2]}`;
    }
    const html = await capture(page, sample);
    const file = path.join(OUT, `gh-compare-${sample.name}.html`);
    fs.writeFileSync(file, html);
    index.push({ name: sample.name, kind: sample.kind, url: sample.url, file: path.relative(ROOT, file), bytes: Buffer.byteLength(html), capturedAt: new Date().toISOString() });
    console.error(`${sample.name}: ${sample.url} — ${Buffer.byteLength(html)} بايت`);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'gh-compare-samples.json'), `${JSON.stringify({ browser: browser.version, samples: index }, null, 2)}\n`);
