#!/usr/bin/env node
// تجربة T-0.4 (MJ4): استخراج المستودع والفرع والالتزام والمسار والسطر/النطاق والرابط الثابت من DOM صفحات GitHub (AC-S4.1).
// كل صفحة تُفتح بلا تسجيل دخول في Chrome بملف تعريف مؤقت، ويُطبَّق مستخرج نوعها، ثم يُتحقق من الرابط الثابت:
// في صفحة الملف بمقارنته بما ينتجه اختصار GitHub «y»، وفي صفحات الفروق بمطابقة diff-<sha256(path)> لسمة data-anchor.
// الاستعمال: node scripts/spikes/t04-anchor.mjs --out evidence/T-0.4/raw/anchor.json
import crypto from 'node:crypto';
import { launchChromium, sleep, writeJson } from './lib.mjs';

const outIndex = process.argv.indexOf('--out');
const outFile = outIndex === -1 ? null : process.argv[outIndex + 1];

const CASES = [
  { type: 'blob', note: 'فرع افتراضي، نطاق أسطر', url: 'https://github.com/expressjs/express/blob/master/lib/response.js#L100-L110' },
  { type: 'blob', note: 'فرع باسم فيه شرطة مائلة', url: 'https://github.com/axios/axios/blob/chore/v2-pnpm-monorepo/README.md?plain=1#L5' },
  { type: 'blob', note: 'وسم (tag)', url: 'https://github.com/expressjs/express/blob/v5.3.0/lib/application.js#L42' },
  { type: 'blob', note: 'رابط ثابت على التزام', url: 'https://github.com/nodejs/node/blob/04e330617369cb79fef577da236c52f04380023c/lib/fs.js#L20-L25' },
  { type: 'blob', note: 'Markdown معروض بلا plain', url: 'https://github.com/pallets/flask/blob/main/README.md#L3' },
  { type: 'blob', note: 'ملف ثنائي (صورة)', url: 'https://github.com/axios/axios/blob/v1.x/logo.svg' },
  { type: 'commit', note: 'صفحة التزام', url: 'https://github.com/expressjs/express/commit/cf6722bf89a86905281d9160b6482e08166b5ef0' },
  { type: 'pull-files', note: 'ملفات PR', url: 'https://github.com/nodejs/node/pull/66911/files' },
  { type: 'compare', note: 'مقارنة وسمين', url: 'https://github.com/expressjs/express/compare/v5.2.1...v5.3.0' },
  { type: 'pull', note: 'محادثة PR', url: 'https://github.com/nodejs/node/pull/66911' },
  { type: 'pull', note: 'محادثة PR مدموج', url: 'https://github.com/nodejs/node/pull/66900' },
];

// يُنفَّذ في الصفحة: كل الحقول بمصدرها.
function extract(type) {
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content ?? null;
  const payloads = [...document.querySelectorAll('script[data-target$="embeddedData"]')].map((s) => {
    try { return JSON.parse(s.textContent).payload ?? null; } catch { return null; }
  }).filter(Boolean);
  const pick = (fn) => { for (const p of payloads) { try { const v = fn(p); if (v != null) return v; } catch {} } return null; };
  const hash = /^#L(\d+)(?:C\d+)?(?:-L(\d+))?/.exec(location.hash);
  const nwo = meta('octolytics-dimension-repository_nwo');
  const r = { nwo: { value: nwo, source: 'meta octolytics-dimension-repository_nwo' }, route: `${meta('route-controller')}#${meta('route-action')}` };
  if (type === 'blob') {
    const layout = pick((p) => p.codeViewLayoutRoute);
    r.branch = { value: layout?.refInfo?.name ?? null, source: 'embeddedData codeViewLayoutRoute.refInfo.name', refType: layout?.refInfo?.refType ?? null };
    r.commit = { value: layout?.refInfo?.currentOid ?? null, source: 'embeddedData codeViewLayoutRoute.refInfo.currentOid' };
    r.path = { value: layout?.path ?? null, source: 'embeddedData codeViewLayoutRoute.path' };
    r.lines = { value: hash ? [Number(hash[1]), Number(hash[2] ?? hash[1])] : null, source: 'location.hash #L<n>-L<m>' };
    r.lineDom = hash ? { lc: Boolean(document.getElementById(`LC${hash[1]}`)), dataLineNumber: Boolean(document.querySelector(`[data-line-number="${hash[1]}"]`)) } : null;
    r.isBinaryOrRendered = { lcCount: document.querySelectorAll('[id^="LC"]').length, markdownBody: Boolean(document.querySelector('article.markdown-body, .markdown-body')), img: Boolean(document.querySelector('img[src*="/raw/"], img[src*="raw.githubusercontent"]')) };
    if (r.commit.value && r.path.value) r.permalink = `https://github.com/${nwo}/blob/${r.commit.value}/${r.path.value.split('/').map(encodeURIComponent).join('/')}${hash ? location.hash.replace(/C\d+/g, '') : ''}`;
  } else if (type === 'commit') {
    const route = pick((p) => p.commitRoute);
    r.commit = { value: route?.commit?.oid ?? null, source: 'embeddedData commitRoute.commit.oid' };
    r.branch = { value: null, source: 'الالتزام لا ينتمي إلى فرع واحد في الصفحة (قائمة الفروع تُحمَّل لاحقًا)' };
    r.paths = { value: (route?.diffEntryData ?? []).map((d) => d.path), source: 'embeddedData commitRoute.diffEntryData[].path' };
    r.domPaths = [...document.querySelectorAll('[data-file-path]')].map((e) => e.getAttribute('data-file-path'));
    r.diffAnchors = [...document.querySelectorAll('[data-diff-anchor]')].map((e) => e.getAttribute('data-diff-anchor'));
    r.lineAnchors = [...document.querySelectorAll('[data-line-anchor]')].slice(0, 6).map((e) => e.getAttribute('data-line-anchor'));
  } else if (type === 'pull-files' || type === 'compare') {
    const files = [...document.querySelectorAll('[data-tagsearch-path], .file[data-path], copy-clipboard[value]')].map((e) => e.getAttribute('data-tagsearch-path') ?? e.getAttribute('data-path')).filter(Boolean);
    r.paths = { value: [...new Set(files)], source: '[data-tagsearch-path] / [data-path]' };
    r.anchors = [...document.querySelectorAll('[data-anchor^="diff-"], .file[id^="diff-"], [id^="diff-"][data-path]')].map((e) => ({ path: e.getAttribute('data-path') ?? e.getAttribute('data-tagsearch-path') ?? e.closest('[data-tagsearch-path]')?.getAttribute('data-tagsearch-path'), anchor: e.getAttribute('data-anchor') ?? e.id })).filter((a) => a.path).slice(0, 40);
    const viewFile = [...document.querySelectorAll('a[href*="/blob/"]')].map((a) => /\/blob\/([0-9a-f]{40})\//.exec(a.getAttribute('href'))?.[1]).filter(Boolean);
    r.commit = { value: [...new Set(viewFile)], source: 'روابط «View file» (/blob/<sha>/)' };
    const sample = document.querySelector('td[data-line-number]');
    r.lineCells = { count: document.querySelectorAll('td[data-line-number]').length, sampleId: sample?.id ?? null, sampleClass: sample?.className ?? null };
    r.branch = { value: [...document.querySelectorAll('.head-ref, .base-ref, .commit-ref')].map((e) => e.textContent.trim()).slice(0, 4), source: '.head-ref/.base-ref/.commit-ref' };
  } else if (type === 'pull') {
    const pr = pick((p) => p.pullRequestsLayoutRoute?.pullRequest);
    r.pull = pr ? { number: pr.number, state: pr.state, headBranch: pr.headBranch, headOwner: pr.headRepositoryOwnerLogin, headSha: pr.headSha, baseBranch: pr.baseBranch, baseSha: pr.baseSha, mergeCommitSha: pr.mergeCommitSha } : null;
    r.source = 'embeddedData pullRequestsLayoutRoute.pullRequest';
  }
  return r;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const results = [];
const browser = await launchChromium('chrome');
try {
  const page = await browser.context.newPage();
  for (const c of CASES) {
    await page.goto(c.url, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    const r = { ...c, extracted: await page.evaluate(extract, c.type) };
    if (c.type === 'blob') {
      // «y» يحوّل الرابط إلى صيغته القانونية (VER-13)؛ نقارن به الرابط الثابت المبني.
      await page.mouse.click(5, 400).catch(() => {});
      await page.keyboard.press('y');
      await sleep(1500);
      r.yUrl = page.url();
      r.permalinkMatchesY = r.extracted.permalink ? decodeURIComponent(r.extracted.permalink.replace(/\?plain=1/, '')) === decodeURIComponent(r.yUrl.replace(/\?plain=1/, '')) : false;
    }
    if (c.type === 'pull-files' || c.type === 'compare') {
      r.anchorCheck = r.extracted.anchors.map((a) => ({ path: a.path, ok: a.anchor === `diff-${sha256(a.path)}` }));
    }
    results.push(r);
    console.error(`${c.type} (${c.note}): ${JSON.stringify(r.extracted).slice(0, 160)}`);
  }
} finally {
  await browser.close();
}
const output = { browser: browser.version, measuredAt: new Date().toISOString(), results };
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));
