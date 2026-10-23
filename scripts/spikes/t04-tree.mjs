#!/usr/bin/env node
// تجربة T-0.4 (MJ4): شجرة الملفات المقتطعة، واكتشاف README العربي، وقراءة README وCONTRIBUTING بجلب من نفس الأصل،
// وكشف قالب PR من الشجرة (AC-S4.2 وAC-S4.3). بلا تسجيل دخول، في Chrome بملف تعريف مؤقت.
// الاستعمال: node scripts/spikes/t04-tree.mjs --out evidence/T-0.4/raw/tree.json
import { launchChromium, sleep, writeJson } from './lib.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];

const REPOS = [
  { repo: 'trekhleb/javascript-algorithms', size: 'صغير' },
  { repo: 'jlevy/the-art-of-command-line', size: 'صغير' },
  { repo: 'EbookFoundation/free-programming-books', size: 'متوسط' },
  { repo: 'pallets/flask', size: 'صغير' },
  { repo: 'nodejs/node', size: 'كبير' },
  { repo: 'kubernetes/kubernetes', size: 'كبير' },
];
const DIRS = ['nodejs/node/tree/main/test/parallel', 'kubernetes/kubernetes/tree/master/pkg', 'EbookFoundation/free-programming-books/tree/main/books'];

// أنماط أسماء README العربي المرشحة (تُقاس هنا ولا تُعتمد قبل التجربة).
const AR_NAME = /^readme[._-](ar|ara|arabic)([._-][a-z]{2})?\.(md|markdown|rst|txt|adoc)$/i;
const AR_HREF = /readme[._-](ar|ara|arabic)([._-][a-z]{2})?\.(md|markdown|rst|txt|adoc)|[/_-]ar(-[a-z]{2})?\.md$/i;

function readTreePage([arNameSource, arHrefSource]) {
  const AR_NAME = new RegExp(arNameSource, 'i');
  const AR_HREF = new RegExp(arHrefSource, 'i');
  let route = null;
  for (const s of document.querySelectorAll('script[data-target$="embeddedData"]')) {
    try {
      const p = JSON.parse(s.textContent).payload;
      route = p.codeViewRepoRoute ?? p.codeViewTreeRoute ?? route;
    } catch {}
  }
  const items = route?.tree?.items ?? [];
  const names = items.map((i) => i.name ?? i.path?.split('/').pop());
  const text = document.body.innerText;
  const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
  const overviewTabs = [...document.querySelectorAll('a[href*="-ov-file"]')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') }));
  return {
    items: items.length,
    totalCount: route?.tree?.totalCount ?? null,
    truncatedByCount: route?.tree?.totalCount != null ? items.length < route.tree.totalCount : null,
    truncationMessage: (text.match(/[^\n]*Sorry, we had to truncate[^\n]*/) ?? [null])[0],
    readmeShown: route?.tree?.readme?.displayName ?? route?.tree?.readme?.path ?? (document.querySelector('[id$="readme-ov-file"], #readme') ? 'موجود' : null),
    arabicByName: names.filter((n) => AR_NAME.test(n)),
    arabicByLink: [...new Set(hrefs.filter((h) => AR_HREF.test(h)))].slice(0, 6),
    contributingLinks: [...new Set(hrefs.filter((h) => /contributing/i.test(h)))].slice(0, 5),
    overviewTabs: [...new Map(overviewTabs.map((t) => [t.text, t])).values()],
    templateFiles: names.filter((n) => /^(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE|pull_request_template|issue_template)(\.md)?$/i.test(n)),
    hasDotGithub: names.includes('.github'),
  };
}

async function sameOriginRead(path) {
  const t0 = performance.now();
  try {
    const r = await fetch(path);
    const body = await r.text();
    return { path, status: r.status, finalHost: new URL(r.url).host, redirected: r.redirected, bytes: body.length, ms: Math.round(performance.now() - t0), contentType: r.headers.get('content-type'), arabicChars: (body.match(/[؀-ۿ]/g) ?? []).length };
  } catch (e) {
    return { path, error: String(e), ms: Math.round(performance.now() - t0) };
  }
}

const result = { measuredAt: new Date().toISOString(), repos: [], dirs: [] };
const browser = await launchChromium('chrome');
try {
  const page = await browser.context.newPage();
  for (const { repo, size } of REPOS) {
    await page.goto(`https://github.com/${repo}`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const home = await page.evaluate(readTreePage, [AR_NAME.source, AR_HREF.source]).catch((e) => ({ error: String(e) }));
    // .github: قوالب وCONTRIBUTING هناك.
    await page.goto(`https://github.com/${repo}/tree/HEAD/.github`, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    const dotGithub = await page.evaluate(readTreePage, [AR_NAME.source, AR_HREF.source]).catch((e) => ({ error: String(e) }));
    const reads = [];
    for (const p of [`/${repo}/raw/HEAD/README.md`, `/${repo}/raw/HEAD/CONTRIBUTING.md`, `/${repo}/raw/HEAD/.github/CONTRIBUTING.md`, ...home.arabicByName.map((n) => `/${repo}/raw/HEAD/${n}`)]) {
      reads.push(await page.evaluate(sameOriginRead, p));
    }
    result.repos.push({ repo, size, home, dotGithub: { items: dotGithub.items, templateFiles: dotGithub.templateFiles, contributing: dotGithub.contributingLinks }, reads });
    console.error(`${repo}: items ${home.items}/${home.totalCount} · ar ${home.arabicByName.join(',') || '—'} · links ${home.arabicByLink.length} · .github templates ${dotGithub.templateFiles?.join(',') || '—'}`);
  }
  for (const dir of DIRS) {
    await page.goto(`https://github.com/${dir}`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const info = await page.evaluate(readTreePage, [AR_NAME.source, AR_HREF.source]);
    result.dirs.push({ dir, items: info.items, totalCount: info.totalCount, truncatedByCount: info.truncatedByCount, truncationMessage: info.truncationMessage, arabicByName: info.arabicByName });
    console.error(`${dir}: ${info.items}/${info.totalCount} ${info.truncationMessage ?? ''}`);
  }
} finally {
  await browser.close();
}
if (outFile) writeJson(outFile, result);
else console.log(JSON.stringify(result, null, 2));
