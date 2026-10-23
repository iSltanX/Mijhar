#!/usr/bin/env node
// تجربة T-0.3 (MJ4): حالة الفحوص في DOM صفحة PR (بلا تسجيل دخول) مقابل REST API العامة بلا مصادقة.
// لكل PR مرجعي: ثلاث طلبات API (الـPR، وcheck-runs لرأسه، وcombined status لرأسه) مع ترويسات x-ratelimit-*،
// وقراءة DOM في Chrome بملف تعريف مؤقت: صفحة المحادثة (رمز الحالة المجمَّع للالتزامات) وتبويب Checks (حالة كل مهمة)
// وجزء status-details لرأس الـPR (الحالات القديمة commit status وتطبيقات Checks).
// الاستعمال: node scripts/spikes/t03-status.mjs <owner/repo#n> ... --out evidence/T-0.3/raw/status.json
import fs from 'node:fs';
import { launchChromium, sleep, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const appendIndex = args.indexOf('--append');
if (appendIndex !== -1) args.splice(appendIndex, 1);
const targets = args.map((a) => {
  const [, repo, number] = /^([^#]+)#(\d+)$/.exec(a);
  return { repo, number: Number(number) };
});

const RATE_HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource'];
async function api(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mijhar-spike' },
    redirect: 'manual',
  });
  const rate = Object.fromEntries(RATE_HEADERS.map((h) => [h, response.headers.get(h)]));
  let body = null;
  const text = await response.text();
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: response.status, rate, location: response.headers.get('location'), body };
}

// تُقرأ في الصفحة: عناصر تبويب Checks.
function readChecksTab() {
  const items = [...document.querySelectorAll('a.SideNav-subItem, a[href*="/job/"], a[href*="check_run_id="]')].map((a) => {
    const row = a.closest('li, .checks-list-item, div');
    const svg = row?.querySelector('svg[aria-label]') ?? row?.querySelector('svg');
    const href = a.getAttribute('href');
    const id = /\/job\/(\d+)/.exec(href)?.[1] ?? /check_run_id=(\d+)/.exec(href)?.[1] ?? null;
    return { id, name: a.textContent.replace(/\s+/g, ' ').trim(), href, icon: svg?.getAttribute('class')?.replace(/selected-color-white\s*/g, '').trim() ?? null, label: svg?.getAttribute('aria-label') ?? null };
  });
  const unique = [...new Map(items.filter((i) => i.id).map((i) => [i.id, i])).values()];
  const text = document.body.innerText;
  return {
    items: unique,
    signInForLogs: text.includes('Sign in for the full log view'),
    annotations: /Annotations\s*\n([^\n]+)/.exec(text)?.[1] ?? null,
  };
}

// تُقرأ في الصفحة: صفحة المحادثة.
function readConversation() {
  const text = document.body.innerText;
  const rollups = [...document.querySelectorAll('details.commit-build-statuses')].map((d) => {
    const svg = d.querySelector('summary svg');
    return { label: svg?.getAttribute('aria-label') ?? null, summaryClass: d.querySelector('summary')?.getAttribute('class') ?? null, icon: svg?.getAttribute('class') ?? null, detailsUrl: d.getAttribute('data-deferred-details-content-url') };
  });
  const header = text.slice(0, 1500);
  const state = ['Open', 'Draft', 'Merged', 'Closed'].filter((s) => new RegExp(`\\n${s}\\n`).test(header));
  const phrases = ['This branch has conflicts', 'All checks have passed', 'Some checks were not successful', 'Merging is blocked', 'This pull request is still a work in progress', 'Draft', 'Merged', 'Closed', 'Sign up for free to join this conversation'];
  return { rollups, state, phrases: Object.fromEntries(phrases.map((p) => [p, text.includes(p)])) };
}

// تُقرأ في الصفحة: جزء status-details (HTML) لالتزام.
async function readStatusDetails(url) {
  const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' } });
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('.merge-status-item')].map((row) => {
    const svg = row.querySelector('svg');
    const name = row.querySelector('strong')?.textContent.trim() ?? null;
    const description = row.querySelector('.text-small, .color-fg-muted, [title]')?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    return { name, icon: svg?.getAttribute('class') ?? null, label: svg?.getAttribute('aria-label') ?? null, description, text: row.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) };
  });
  const summary = doc.querySelector('.merge-status-list')?.previousElementSibling?.textContent.replace(/\s+/g, ' ').trim() ?? doc.body.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
  return { status: response.status, rows, summary };
}

const results = [];
const browser = await launchChromium('chrome');
try {
  const page = await browser.context.newPage();
  for (const { repo, number } of targets) {
    const result = { repo, number, readAt: new Date().toISOString(), api: {}, dom: {} };
    const pull = await api(`/repos/${repo}/pulls/${number}`);
    const p = pull.body ?? {};
    const sha = p.head?.sha;
    result.api.pull = { status: pull.status, rate: pull.rate, state: p.state, merged: p.merged, draft: p.draft, mergeable: p.mergeable, mergeable_state: p.mergeable_state, head: sha, base: p.base?.ref };
    if (sha) {
      // صفحات check-runs حتى total_count (100 لكل صفحة).
      let runs = await api(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`);
      const all = [...(runs.body?.check_runs ?? [])];
      let pages = 1;
      while (runs.status === 200 && all.length < (runs.body?.total_count ?? 0)) {
        pages += 1;
        runs = await api(`/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${pages}`);
        all.push(...(runs.body?.check_runs ?? []));
        if (!runs.body?.check_runs?.length) break;
      }
      result.api.checkRuns = {
        status: runs.status,
        rate: runs.rate,
        pages,
        total: runs.body?.total_count,
        runs: all.map((r) => ({ id: String(r.id), name: r.name, app: r.app?.slug, status: r.status, conclusion: r.conclusion, annotations: r.output?.annotations_count })),
      };
      const combined = await api(`/repos/${repo}/commits/${sha}/status`);
      result.api.combinedStatus = {
        status: combined.status,
        rate: combined.rate,
        state: combined.body?.state,
        total: combined.body?.total_count,
        statuses: (combined.body?.statuses ?? []).map((s) => ({ context: s.context, state: s.state, description: s.description })),
      };
    }

    await page.goto(`https://github.com/${repo}/pull/${number}`, { waitUntil: 'domcontentloaded' });
    await sleep(7000);
    result.dom.conversation = await page.evaluate(readConversation);
    if (sha) result.dom.statusDetails = await page.evaluate(readStatusDetails, `/${repo}/commit/${sha}/status-details?popover=true`);

    await page.goto(`https://github.com/${repo}/pull/${number}/checks`, { waitUntil: 'domcontentloaded' });
    await sleep(7000);
    result.dom.checksTab = await page.evaluate(readChecksTab);

    // مطابقة كل مهمة في تبويب Checks بقيمتها في API (معرّف المهمة في Actions = معرّف check run).
    const byId = new Map((result.api.checkRuns?.runs ?? []).map((r) => [r.id, r]));
    result.match = result.dom.checksTab.items.map((i) => {
      const r = byId.get(i.id);
      return { id: i.id, name: i.name, domIcon: i.icon, domLabel: i.label, apiStatus: r?.status ?? null, apiConclusion: r?.conclusion ?? null, inApi: Boolean(r) };
    });
    results.push(result);
    console.error(`${repo}#${number}: API ${result.api.checkRuns?.runs.length ?? 0} runs / ${result.api.combinedStatus?.total ?? 0} statuses · DOM ${result.dom.checksTab.items.length} items / ${result.dom.statusDetails?.rows.length ?? 0} status rows · remaining ${result.api.combinedStatus?.rate['x-ratelimit-remaining'] ?? pull.rate['x-ratelimit-remaining']}`);
  }
} finally {
  await browser.close();
}
const append = appendIndex !== -1;
const previous = append && outFile && fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')).results : [];
const output = { browser: browser.version, results: [...previous, ...results] };
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));
