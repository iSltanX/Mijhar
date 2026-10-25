#!/usr/bin/env node
// بوابة الموجة M (AC-10.3): نص النسبة وروابطه كما تعرضها الحزمة المبنية فعلًا في «حول مِجهَر» بصفحة الإعدادات، في المتصفحات الأربعة:
// «تصميم وتطوير سلطان» حرفًا بلا إضافة، ورابط https://bysltan.com في تبويب جديد بلا opener، والنسخة من المانيفست، وملف الإشعارات مشحون ويفتح،
// ولا رابط إلى مستودع مِجهَر الخاص (ولا إلى github.com أصلًا) في الصفحة.
// الاستعمال: npm run build && node evidence/wave-M/attribution-check.mjs [chrome edge brave firefox]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, waitUntil } from '../../tests/modules/d/token/browser/drivers.mjs';

const keys = process.argv.slice(2).filter((a) => BROWSERS[a]);
const list = keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox'];
const githubReply = () => ({ status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ message: 'Not Found' });
const results = [];
for (const key of list) {
  const target = BROWSERS[key].target;
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', target, 'manifest.json'), 'utf8')).version;
  const s = target === 'firefox' ? await firefoxSession({ extDir: path.join(ROOT, 'dist', target), githubReply, apiReply }) : await chromiumSession(key, { extDir: path.join(ROOT, 'dist', target), githubReply, apiReply });
  try {
    await s.d.options(`location.hash = '#about'; return true;`);
    await waitUntil(async () => (await s.d.options(`return Boolean(document.querySelector('#about [data-attribution]'));`)) || null, 8000);
    const got = await s.d.options(`
      const about = document.querySelector('#about');
      const site = about.querySelector('[data-action="about-site"]');
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
      const notices = await fetch(about.querySelector('[data-action="about-notices"]').href).then((r) => r.ok ? r.text() : null, () => null);
      return {
        attribution: about.querySelector('[data-attribution]').textContent,
        site: site ? { href: site.getAttribute('href'), target: site.getAttribute('target'), rel: site.getAttribute('rel') } : null,
        versionShown: about.textContent.includes(${JSON.stringify(version)}),
        // رابط مستودع: المسار نفسه github.com/iSltanX/… أو …/mijhar؛ لا رابط إنشاء الرمز الذي فيه «Mijhar» اسمًا في استعلامه.
        github: links.filter((h) => { const u = new URL(h); return u.host === 'github.com' && /^\\/(isltanx\\/|[^/]+\\/mijhar(\\/|$))/i.test(u.pathname); }),
        notices: notices ? notices.slice(0, 60) : null,
      };`);
    const ok = got.attribution === 'تصميم وتطوير سلطان' && got.site?.href === 'https://bysltan.com' && got.site?.target === '_blank' && /noopener/.test(got.site?.rel ?? '') && got.versionShown && got.github.length === 0 && /^THIRD-PARTY NOTICES/.test(got.notices ?? '');
    results.push({ browser: BROWSERS[key].label, version: s.browserVersion, ok, got });
    console.log(`${ok ? '✓' : '✗'} ${BROWSERS[key].label} ${s.browserVersion}: «${got.attribution}» · ${got.site?.href} (${got.site?.target}، ${got.site?.rel}) · النسخة ${version} ${got.versionShown ? 'ظاهرة' : 'غائبة'} · روابط المستودع ${got.github.length} · الإشعارات ${got.notices ? 'تفتح' : 'لا تفتح'}`);
  } finally {
    await s.close();
  }
}
fs.writeFileSync(path.join(ROOT, 'evidence/wave-M/attribution-result.json'), `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
