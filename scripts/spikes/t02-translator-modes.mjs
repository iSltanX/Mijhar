#!/usr/bin/env node
// تجربة T-0.2 (MJ4): Translator API في صفحة عادية (العالم الرئيسي) بنقرة حقيقية، بلا واجهة وبواجهة، في Chrome وEdge وBrave،
// لفصل قيد الوضع بلا واجهة عن قيد السياق. الاستعمال: node scripts/spikes/t02-translator-modes.mjs --out evidence/T-0.2/raw/translator-modes.json
import { launchChromium, serveDir, writeJson } from './lib.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];
const server = await serveDir(new URL('../../fixtures/spikes', import.meta.url).pathname);
const results = [];
for (const key of ['chrome', 'edge', 'brave']) {
  for (const headless of [true, false]) {
    const b = await launchChromium(key, { headless });
    try {
      const page = await b.context.newPage();
      await page.goto(`${server.url}/fixture-editor.html`);
      await page.evaluate(() => {
        const btn = document.createElement('button');
        btn.id = 'go';
        btn.textContent = 'go';
        btn.onclick = () => {
          window.__p = (async () => {
            const out = { before: await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' }) };
            const prog = [];
            const t0 = performance.now();
            try {
              const t = await Translator.create({ sourceLanguage: 'en', targetLanguage: 'ar', monitor(m) { m.addEventListener('downloadprogress', (e) => prog.push(e.loaded)); } });
              out.createMs = Math.round(performance.now() - t0);
              out.sample = await t.translate('Run the tests before opening a pull request.');
            } catch (e) {
              out.error = `${e.name}: ${e.message}`;
              out.ms = Math.round(performance.now() - t0);
            }
            out.progressEvents = prog.length;
            out.after = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' });
            return out;
          })();
        };
        document.body.appendChild(btn);
      });
      await page.click('#go');
      const r = await page.evaluate(() => window.__p);
      results.push({ browser: key, version: b.version, headless, ...r });
      console.error(key, headless ? 'headless' : 'headed', JSON.stringify(r));
    } finally {
      await b.close();
    }
  }
}
await server.close();
if (outFile) writeJson(outFile, { measuredAt: new Date().toISOString(), context: 'صفحة ويب عادية (العالم الرئيسي)، نقرة Playwright حقيقية، ملف تعريف مؤقت جديد', results });
