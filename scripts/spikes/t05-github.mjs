#!/usr/bin/env node
// تجربة T-0.5 (MJ11): صلاحيات رمز GitHub دقيق الحبيبات وإشاراته وحدود الطلبات والسجل الخام بمصادقة (AC-S5.3 وAC-S5.4، HYP-09).
// يُقرأ كل رمز من ملف يدلّ عليه متغير بيئة، ولا يُطبع ولا يُكتب في أي نتيجة (يُحجب أي ظهور عرضي له)، ولا يُرسل إلا إلى api.github.com.
//   T05_REPO=<owner/repo>          مستودع تجريبي خاص يملكه المالك (فيه PR وتشغيل Actions فاشل).
//   T05_TOKEN_FILE_MIN=<ملف>       رمز دقيق الحبيبات على ذلك المستودع وحده بصلاحية Metadata: read وحدها (الحد الأدنى الإلزامي).
//   T05_TOKEN_FILE_READ=<ملف>      رمز على المستودع نفسه بصلاحيات القراءة المرشحة: Metadata وContents وPull requests وChecks وActions
//                                  وCommit statuses وIssues، كلها Read-only؛ ولا صلاحية كتابة.
// بلا رموز يُقاس الشق غير الموثَّق وحده (الحد العام 60) ويُسجَّل الباقي «لم يُجرَ».
// الاستعمال: node scripts/spikes/t05-github.mjs [--out evidence/T-0.5/raw/github.json]
import fs from 'node:fs';
import { writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const API = 'https://api.github.com';
const readToken = (name) => {
  const file = process.env[name];
  return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
};
const TOKENS = { min: readToken('T05_TOKEN_FILE_MIN'), read: readToken('T05_TOKEN_FILE_READ') };
const REPO = process.env.T05_REPO ?? null;
// رمز بصيغة صحيحة ومحتوى مختلَق: لقياس إشارة الرمز غير الصالح/الملغى دون رمز حقيقي.
const FAKE = 'github_pat_11AAAAAAA0mijharT05invalidTokenForSignalProbe_0000000000000000000000000000000000';
const secrets = [TOKENS.min, TOKENS.read].filter(Boolean);
const redact = (value) => {
  let text = JSON.stringify(value);
  for (const s of secrets) text = text.split(s).join('«رمز محجوب»');
  return JSON.parse(text);
};
const HEADERS = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource', 'x-accepted-github-permissions', 'x-oauth-scopes', 'x-accepted-oauth-scopes', 'github-authentication-token-expiration', 'x-github-sso', 'retry-after', 'www-authenticate'];

async function call(path, token, { manual = false, follow = false } = {}) {
  const started = Date.now();
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mijhar-t05-spike' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { headers, redirect: manual ? 'manual' : 'follow' });
  const out = { path, status: response.status, ms: Date.now() - started, at: new Date().toISOString(), headers: {} };
  for (const h of HEADERS) {
    const v = response.headers.get(h);
    if (v !== null) out.headers[h] = v;
  }
  const location = response.headers.get('location');
  if (location) {
    // الرابط المؤقت الموقّع: المضيف وأسماء المعاملات ومدة الصلاحية من st/se وحدها، بلا التوقيع.
    const u = new URL(location);
    const st = u.searchParams.get('st');
    const se = u.searchParams.get('se');
    out.redirect = { host: u.host, params: [...u.searchParams.keys()], ttlSeconds: st && se ? (Date.parse(se) - Date.parse(st)) / 1000 : null };
    if (follow) {
      const blob = await fetch(location);
      const bytes = (await blob.arrayBuffer()).byteLength;
      out.redirect.follow = { status: blob.status, contentType: blob.headers.get('content-type'), bytes };
    }
  }
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      const body = await response.json();
      out.message = typeof body?.message === 'string' ? body.message : null;
      out.documentation = typeof body?.documentation_url === 'string' ? body.documentation_url : null;
      out.body = body;
    } catch {}
  } else if (!manual) {
    out.bytes = (await response.arrayBuffer()).byteLength;
  }
  return out;
}

const result = { measuredAt: new Date().toISOString(), repo: REPO ? 'مستودع المالك التجريبي (الاسم في التقرير)' : null, tokens: { min: Boolean(TOKENS.min), read: Boolean(TOKENS.read) } };

// 1. غير الموثَّق: الحد العام كما تعلنه /rate_limit (لا يُحتسب) وطلب عام.
const unauthLimit = await call('/rate_limit', null);
result.unauthenticated = { rateLimit: unauthLimit.body?.resources?.core ?? null, search: unauthLimit.body?.resources?.search ?? null, headers: unauthLimit.headers };
const pub = await call('/repos/octocat/Hello-World', null);
result.unauthenticated.publicRequest = { status: pub.status, headers: pub.headers };

// 2. إشارة الرمز غير الصالح (صيغة صحيحة ومحتوى مختلَق).
const bad = await call('/user', FAKE);
result.signals = { invalidToken: { status: bad.status, message: bad.message, headers: bad.headers } };
const badRepo = await call('/repos/octocat/Hello-World', FAKE);
result.signals.invalidTokenOnPublic = { status: badRepo.status, message: badRepo.message };

// 3. الموثَّق على المستودع التجريبي.
if (!REPO || !TOKENS.read) {
  result.authenticated = { notRun: 'لم يُجرَ: لم يُتح مستودع تجريبي خاص ورمز قراءة دقيق الحبيبات (T05_REPO وT05_TOKEN_FILE_READ)' };
} else {
  const base = `/repos/${REPO}`;
  // اكتشاف PR وتشغيل فاشل ومهمته بالرمز الكامل للقراءة.
  const pulls = await call(`${base}/pulls?state=all&per_page=1`, TOKENS.read);
  const pr = Array.isArray(pulls.body) ? pulls.body[0] : null;
  const runs = await call(`${base}/actions/runs?per_page=5`, TOKENS.read);
  const run = (runs.body?.workflow_runs ?? []).find((r) => r.conclusion === 'failure') ?? runs.body?.workflow_runs?.[0] ?? null;
  const jobs = run ? await call(`${base}/actions/runs/${run.id}/jobs`, TOKENS.read) : null;
  const job = jobs?.body?.jobs?.[0] ?? null;
  const sha = pr?.head?.sha ?? run?.head_sha ?? null;
  const baseRef = pr?.base?.ref ?? 'main';
  result.discovered = { pr: pr?.number ?? null, run: run?.id ?? null, runConclusion: run?.conclusion ?? null, job: job?.id ?? null, sha: sha ? `${sha.slice(0, 7)}…` : null, base: baseRef };
  const endpoints = [
    { id: 'repo', path: base, documented: 'Metadata: read' },
    { id: 'pull', path: pr ? `${base}/pulls/${pr.number}` : null, documented: 'Pull requests: read' },
    { id: 'check-runs', path: sha ? `${base}/commits/${sha}/check-runs?per_page=100` : null, documented: 'Checks: read' },
    { id: 'combined-status', path: sha ? `${base}/commits/${sha}/status` : null, documented: 'Commit statuses: read' },
    { id: 'branch', path: `${base}/branches/${encodeURIComponent(baseRef)}`, documented: 'Contents: read (وحماية الفرع للقراءة: Administration: read بحسب التوثيق)' },
    { id: 'job', path: job ? `${base}/actions/jobs/${job.id}` : null, documented: 'Actions: read' },
    { id: 'job-logs', path: job ? `${base}/actions/jobs/${job.id}/logs` : null, documented: 'Actions: read', manual: true },
    { id: 'run-logs', path: run ? `${base}/actions/runs/${run.id}/logs` : null, documented: 'Actions: read', manual: true },
    { id: 'annotations', path: job ? `${base}/check-runs/${job.id}/annotations` : null, documented: 'Checks: read' },
    { id: 'contents', path: `${base}/contents/README.md`, documented: 'Contents: read' },
    { id: 'compare', path: pr ? `${base}/compare/${encodeURIComponent(pr.base.ref)}...${encodeURIComponent(pr.head.ref)}` : null, documented: 'Contents: read' },
    { id: 'search-issues', path: `/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr`)}&per_page=1`, documented: 'Issues: read أو Pull requests: read (مستودع خاص)' },
  ];
  result.endpoints = [];
  for (const e of endpoints) {
    if (!e.path) {
      result.endpoints.push({ id: e.id, notRun: 'لا مورد في المستودع التجريبي لهذه النقطة' });
      continue;
    }
    const row = { id: e.id, documented: e.documented };
    row.unauthenticated = await call(e.path, null, { manual: e.manual });
    if (TOKENS.min) row.minToken = await call(e.path, TOKENS.min, { manual: e.manual });
    row.readToken = await call(e.path, TOKENS.read, { manual: e.manual, follow: e.manual });
    for (const k of ['unauthenticated', 'minToken', 'readToken']) if (row[k]) delete row[k].body;
    result.endpoints.push(row);
  }
  const authLimit = await call('/rate_limit', TOKENS.read);
  result.authenticated = { rateLimit: authLimit.body?.resources?.core ?? null, search: authLimit.body?.resources?.search ?? null, tokenExpirationHeader: authLimit.headers['github-authentication-token-expiration'] ?? null };
}
if (!TOKENS.min) result.minTokenNotRun = 'لم يُجرَ: لم يُتح رمز بصلاحية Metadata وحدها (T05_TOKEN_FILE_MIN)، فلا يُثبت رفض أقل صلاحية';

const safe = redact(result);
if (outFile) writeJson(outFile, safe);
else console.log(JSON.stringify(safe, null, 2));
console.error(`غير موثَّق: الحد ${safe.unauthenticated.rateLimit?.limit} والمتبقي ${safe.unauthenticated.rateLimit?.remaining}؛ رمز مختلَق: ${safe.signals.invalidToken.status} ${safe.signals.invalidToken.message}؛ موثَّق: ${safe.authenticated?.notRun ?? `الحد ${safe.authenticated?.rateLimit?.limit}`}`);
