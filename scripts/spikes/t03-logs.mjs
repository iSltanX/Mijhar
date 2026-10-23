#!/usr/bin/env node
// تجربة T-0.3 (MJ4): الوصول إلى سجلات Actions بلا مصادقة، في الواجهة وفي REST API، على مستودع عام.
// الاستعمال: node scripts/spikes/t03-logs.mjs <owner/repo> <run_id> <job_id> <head_sha> --out evidence/T-0.3/raw/logs.json
// يقيس: صفحة المهمة لغير المسجّل، ورابط «السجل الخام» في الواجهة، وتفاصيل المهمة وAnnotations، وتوجيه نقطة السجل
// ومهلة الرابط المؤقت (طلب الرابط فورًا ثم بعد 30 و65 ثانية و5 دقائق)، وسجل التشغيل المضغوط.
import { launchChromium, sleep, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const [repo, runId, jobId, sha] = args;

const RATE_HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource'];
async function request(url, { api = false } = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: api ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mijhar-spike' } : { 'User-Agent': 'Mozilla/5.0 mijhar-spike' },
    redirect: 'manual',
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return {
    url: url.replace(/\?.*$/, '?…'),
    status: response.status,
    ms: Date.now() - started,
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    bytes: buffer.length,
    rate: api ? Object.fromEntries(RATE_HEADERS.map((h) => [h, response.headers.get(h)])) : undefined,
    json,
    text: json ? undefined : text,
  };
}

// معاملات الرابط المؤقت بلا التوقيع نفسه.
function describeSigned(location) {
  if (!location) return null;
  const u = new URL(location);
  const params = Object.fromEntries([...u.searchParams.entries()].filter(([k]) => !/sig|signature|token|skoid|sktid|skt|ske|sks|skv/i.test(k)).map(([k, v]) => [k, v.length > 60 ? `${v.slice(0, 60)}…` : v]));
  return { host: u.host, path: u.pathname.replace(/[0-9a-f-]{20,}/gi, '…'), params, paramNames: [...u.searchParams.keys()] };
}

const result = { repo, runId, jobId, sha, measuredAt: new Date().toISOString() };

// 1) الواجهة: صفحة المهمة لغير المسجّل.
const browser = await launchChromium('chrome');
try {
  const page = await browser.context.newPage();
  await page.goto(`https://github.com/${repo}/actions/runs/${runId}/job/${jobId}`, { waitUntil: 'domcontentloaded' });
  await sleep(8000);
  result.uiJobPage = await page.evaluate(() => {
    const text = document.body.innerText;
    const steps = [...document.querySelectorAll('check-step')].map((s) => ({
      name: s.getAttribute('data-name'),
      number: s.getAttribute('data-number'),
      conclusion: s.getAttribute('data-conclusion'),
      logUrl: s.getAttribute('data-log-url'),
      externalId: s.getAttribute('data-external-id') ? 'موجود' : null,
      linesRendered: s.querySelectorAll('.js-check-step-line, .CheckStep-line').length,
    }));
    const links = [...document.querySelectorAll('a')].filter((a) => /raw|logs|Sign in/i.test(a.textContent + a.getAttribute('href'))).map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), href: a.getAttribute('href') }));
    const annotations = [...document.querySelectorAll('annotation-message, .js-annotation, [data-annotation]')].length;
    return {
      title: document.title,
      signInForLogs: /Sign in for the full log view|Sign in to view logs/.test(text),
      phrases: ['Sign in for the full log view', 'Sign in to view logs', 'View raw logs', 'Annotations', 'Process completed with exit code'].filter((p) => text.includes(p)),
      steps,
      links: links.slice(0, 10),
      annotationNodes: annotations,
      annotationText: (/Annotations\s*\n([\s\S]{0, 600})/.exec(text)?.[1] ?? '').slice(0, 600),
    };
  });
} finally {
  await browser.close();
}

// 2) الواجهة: رابط السجل الخام بلا جلسة.
result.uiRawLogs = await request(`https://github.com/${repo}/commit/${sha}/checks/${jobId}/logs`);
result.uiRawLogs.text = result.uiRawLogs.text?.slice(0, 300);

// 3) API: تفاصيل المهمة (الخطوات ونتائجها) وAnnotations.
const job = await request(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}`, { api: true });
result.apiJob = { status: job.status, rate: job.rate, conclusion: job.json?.conclusion, steps: (job.json?.steps ?? []).map((s) => ({ number: s.number, name: s.name, status: s.status, conclusion: s.conclusion })) };
const annotations = await request(`https://api.github.com/repos/${repo}/check-runs/${jobId}/annotations`, { api: true });
result.apiAnnotations = { status: annotations.status, rate: annotations.rate, items: (annotations.json ?? []).map?.((a) => ({ path: a.path, start_line: a.start_line, level: a.annotation_level, title: a.title, message: a.message?.slice(0, 300) })) ?? annotations.json };

// 4) API: سجل المهمة — التوجيه ومهلة الرابط المؤقت.
const logs = await request(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`, { api: true });
result.apiJobLogs = { status: logs.status, rate: logs.rate, ms: logs.ms, signed: describeSigned(logs.location), body: logs.json ?? logs.text?.slice(0, 300) };
result.signedUrlFetches = [];
if (logs.location) {
  const t0 = Date.now();
  for (const at of [0, 30, 65, 300]) {
    const wait = t0 + at * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await request(logs.location);
    const entry = { afterSeconds: Math.round((Date.now() - t0) / 1000), status: r.status, bytes: r.bytes, contentType: r.contentType };
    if (r.status === 200 && at === 0) {
      const lines = r.text.split('\n');
      entry.lines = lines.length;
      entry.errorLines = lines.filter((l) => /##\[error\]|Error:|error TS|FAIL|✗|exit code/i.test(l)).slice(0, 15).map((l) => l.slice(0, 220));
      entry.groupMarkers = lines.filter((l) => /##\[(group|endgroup|error|warning)\]/.test(l)).length;
      entry.firstLine = lines[0]?.slice(0, 120);
    } else if (r.status !== 200) {
      entry.body = r.text?.slice(0, 300);
    }
    result.signedUrlFetches.push(entry);
  }
}

// 5) API: سجل التشغيل المضغوط.
const runLogs = await request(`https://api.github.com/repos/${repo}/actions/runs/${runId}/logs`, { api: true });
result.apiRunLogs = { status: runLogs.status, rate: runLogs.rate, signed: describeSigned(runLogs.location), body: runLogs.json ?? runLogs.text?.slice(0, 300) };

if (outFile) writeJson(outFile, result);
console.log(JSON.stringify(result, null, 2));
