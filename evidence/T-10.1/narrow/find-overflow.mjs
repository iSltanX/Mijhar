#!/usr/bin/env node
// MJ26 (T-10.1): تتبّع التمرير الأفقي في صفحة الإعدادات بعرض 360 (سقط في mj13-check: 224 بكسل في Chromium و140 في Firefox). يفتح الحزمة المبنية في Chrome
// بعرض 360، ويسرد أوسع العناصر التي تتجاوز عرض النافذة (بمحدد يقرّب موضعها ونصها)، في الصفحة الرئيسية وصفحتي الدليل والبلاغ. ← overflow.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-narrow-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: BROWSERS.chrome.executable, headless: true, viewport: { width: 360, height: 800 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
const cdp = await context.browser().newBrowserCDPSession();
const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
const page = await context.newPage();
const out = {};
for (const hash of ['', '#guide/github-token', '#guide/provider-key', '#report']) {
  await page.goto(`chrome-extension://${id}/options.html${hash}`);
  await page.waitForSelector('#app[data-ready="true"]');
  await page.waitForTimeout(800);
  out[hash || 'settings'] = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const path = [];
        for (let n = el; n && n !== document.body && path.length < 4; n = n.parentElement) path.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + (n.getAttribute('data-section') ? `[data-section=${n.getAttribute('data-section')}]` : '') + (n.className && typeof n.className === 'string' ? `.${n.className.split(' ').slice(0, 2).join('.')}` : ''));
        wide.push({ path: path.join(' > '), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70), ws: getComputedStyle(el).whiteSpace });
      }
    }
    // الأعمق أولًا: العنصر الذي يتجاوز ولا يتجاوز أحد أبنائه هو المسبّب.
    const leaves = wide.filter((w) => !wide.some((o) => o !== w && o.path.startsWith(w.path) && o.path.length > w.path.length));
    return { vw, overflow, culprits: leaves.slice(0, 15) };
  });
  console.log(hash || 'settings', JSON.stringify(out[hash || 'settings'].overflow), JSON.stringify(out[hash || 'settings'].culprits.slice(0, 6), null, 0).slice(0, 1600));
}
fs.writeFileSync(path.join(HERE, 'overflow.json'), `${JSON.stringify(out, null, 2)}\n`);
await context.close();
fs.rmSync(profile, { recursive: true, force: true });
