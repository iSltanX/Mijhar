#!/usr/bin/env node
// MJ26، T-10.2، DEC-08: الاختصارات كما يسجّلها كل متصفح فعلًا للحزمة المبنية (commands.getAll من صفحة إعدادات الإضافة)، وزر شريط الأدوات (action).
// الاختصار المسجَّل يتبع نظام التشغيل الذي يعمل عليه المتصفح: هنا macOS، فيُتوقع مفتاح mac من المانيفست.
// الاستعمال: npm run build && node evidence/T-10.2/shortcuts-check.mjs [chrome edge brave firefox]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession } from '../../tests/modules/d/token/browser/drivers.mjs';

const keys = process.argv.slice(2).filter((a) => BROWSERS[a]);
const list = keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox'];
const githubReply = () => ({ status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ message: 'Not Found' });
const results = [];
for (const key of list) {
  const target = BROWSERS[key].target;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', target, 'manifest.json'), 'utf8'));
  const expected = Object.fromEntries(Object.entries(manifest.commands).map(([name, c]) => [name, c.suggested_key?.mac ?? c.suggested_key?.default ?? '']));
  const session = target === 'firefox' ? await firefoxSession({ extDir: path.join(ROOT, 'dist', target), githubReply, apiReply }) : await chromiumSession(key, { extDir: path.join(ROOT, 'dist', target), githubReply, apiReply });
  try {
    const got = await session.d.options(`const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser; const all = await api.commands.getAll(); const action = api.action ? { title: (await api.action.getTitle({})) } : null; return { commands: all.map((c) => ({ name: c.name, shortcut: c.shortcut ?? '' })), action };`);
    // التسجيل يكتب المفاتيح بصيغة المتصفح (⌃⇧G في Chromium على macOS، وCtrl+Shift+G في Firefox): يُقارن بعد توحيد الرموز.
    const norm = (s) => s.replace(/MacCtrl|⌃|Ctrl/g, 'Ctrl').replace(/⇧/g, 'Shift').replace(/⌥/g, 'Alt').replace(/⌘/g, 'Command').replace(/\+/g, '').replace(/\s/g, '').split('').sort().join('');
    const rows = Object.entries(expected).map(([name, want]) => {
      const have = got.commands.find((c) => c.name === name)?.shortcut ?? null;
      return { name, want, have, ok: have !== null && norm(have) === norm(want) };
    });
    results.push({ browser: BROWSERS[key].label, version: session.browserVersion, rows, action: got.action });
    console.log(`${BROWSERS[key].label} ${session.browserVersion}: ${rows.map((r) => `${r.ok ? '✓' : '✗'} ${r.name} = «${r.have}» (المانيفست ${r.want})`).join(' · ')} · زر الشريط: ${got.action ? `«${got.action.title}»` : 'لا'}`);
  } finally {
    await session.close();
  }
}
fs.writeFileSync(path.join(ROOT, 'evidence/T-10.2/shortcuts-result.json'), `${JSON.stringify({ at: new Date().toISOString(), os: process.platform, results }, null, 2)}\n`);
process.exit(results.every((r) => r.rows.every((x) => x.ok) && r.action) ? 0 : 1);
