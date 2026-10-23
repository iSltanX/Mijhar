#!/usr/bin/env node
// تجربة T-0.1 (MJ4): هل يقرأ زر نسخ كتلة الكود في GitHub نص DOM المعروض أم قيمة محفوظة عند العرض؟
// يُعدَّل نص الكتلة في DOM ثم يُنقر الزر وتُقرأ حافظة المتصفح الداخلية (Chrome بلا واجهة، بلا تسجيل دخول).
// الاستعمال: node scripts/spikes/t01-copybutton.mjs --out evidence/T-0.1/raw/copybutton.json
import { launchChromium, sleep, writeJson } from './lib.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];
const URLS = ['https://github.com/Barqawiz/Shakkala', 'https://github.com/trekhleb/javascript-algorithms/blob/master/README.ar-AR.md'];
const b = await launchChromium('chrome');
const results = [];
try {
  await b.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://github.com' });
  const page = await b.context.newPage();
  for (const url of URLS) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const info = await page.evaluate(() => {
      const box = document.querySelector('.markdown-body .snippet-clipboard-content, .markdown-body .highlight');
      if (!box) return { found: false };
      const btn = box.querySelector('clipboard-copy, button[aria-label*="Copy"]');
      const pre = box.querySelector('pre');
      const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
      const first = w.nextNode();
      const before = pre.textContent;
      first.nodeValue = `${first.nodeValue}«تعديل-DOM»`;
      return { found: true, tag: btn?.tagName.toLowerCase(), valueAttr: btn?.getAttribute('value')?.slice(0, 80) ?? null, dataAttr: box.getAttribute('data-snippet-clipboard-copy-content')?.slice(0, 80) ?? null, domBefore: before.slice(0, 80), domAfter: pre.textContent.slice(0, 100) };
    });
    if (info.found) {
      await page.evaluate(() => {
        const box = document.querySelector('.markdown-body .snippet-clipboard-content, .markdown-body .highlight');
        const btn = box.querySelector('clipboard-copy, button[aria-label*="Copy"]');
        btn.click();
      });
      await sleep(500);
      info.clipboard = await page.evaluate(async () => { try { return (await navigator.clipboard.readText()).slice(0, 120); } catch (e) { return `خطأ: ${e}`; } });
      info.clipboardHasDomEdit = info.clipboard.includes('«تعديل-DOM»');
    }
    results.push({ url, ...info });
    console.error(url, JSON.stringify(info).slice(0, 300));
  }
} finally {
  await b.close();
}
if (outFile) writeJson(outFile, { browser: b.version, measuredAt: new Date().toISOString(), results });
