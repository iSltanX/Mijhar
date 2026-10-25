#!/usr/bin/env node
// MJ26، T-10.1: تفسير مخالفة color-contrast التي سجّلها axe في Firefox بالوضع الداكن على عُقد ضبط الاتجاه (mijhar-bidi-group) في صفحة المشكلة
// المحفوظة. يقرأ في الوضع نفسه لون العقدة ولون أبيها (عقدة GitHub) وخلفية السلسلة كلها ونظام الألوان المعلن، ليُعرف أهي ألوان مِجهَر أم ألوان المتصفح
// الافتراضية لصفحة محفوظة بلا أنماط GitHub. لا يغيّر شيئًا في الإضافة.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, firefoxSession, sleep } from '../../../tests/modules/d/token/browser/drivers.mjs';

const SAMPLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/spikes/samples.json'), 'utf8')).samples;
const issue = SAMPLES.find((s) => s.name === 'issue-etos-1');
const body = fs.readFileSync(path.join(ROOT, issue.file), 'utf8');
const githubReply = (pathname) => (pathname === new URL(issue.url).pathname ? { status: 200, type: 'text/html; charset=utf-8', body } : { status: 404, type: 'text/plain', body: 'not found' });
const session = await firefoxSession({ extDir: path.join(ROOT, 'dist/firefox'), githubReply, apiReply: () => ({ message: 'Not Found' }) });
const out = { browser: 'Firefox', version: session.browserVersion, page: issue.url, modes: {} };
try {
  for (const dark of [false, true]) {
    await session.chrome(`Services.prefs.setIntPref('ui.systemUsesDarkTheme', ${dark ? 1 : 0}); Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override', ${dark ? 0 : 1}); return true;`);
    await sleep(300);
    await session.d.openGithub(issue.url);
    await sleep(2500);
    out.modes[dark ? 'dark' : 'light'] = await session.d.github(`
      const g = document.querySelector('.mijhar-bidi-group');
      if (!g) return { group: null };
      const cs = (e) => getComputedStyle(e);
      const chain = []; for (let e = g; e; e = e.parentElement) chain.push({ tag: e.tagName.toLowerCase(), bg: cs(e).backgroundColor });
      return {
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        colorScheme: cs(document.documentElement).colorScheme,
        meta: document.querySelector('meta[name="color-scheme"]')?.content ?? null,
        stylesheets: document.styleSheets.length,
        groupColor: cs(g).color,
        parentColor: cs(g.parentElement).color,
        parentTag: g.parentElement.tagName.toLowerCase(),
        groupInlineStyle: g.getAttribute('style'),
        opaqueBackgrounds: chain.filter((c) => !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c.bg)),
        chainLength: chain.length,
      };`);
  }
} finally {
  await session.close();
}
fs.writeFileSync(path.join(ROOT, 'evidence/T-10.1/final/ff-contrast-probe.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
