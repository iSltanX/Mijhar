// عينة fixture-code-view-drift (data/plan.json): نسخ من ملف كود بالبنية المقيسة في evidence/T-0.4 (AC-S4.1) — meta
// octolytics-dimension-repository_nwo وrepository_public، وreact-app.embeddedData ‏(refInfo.name وcurrentOid وpath)، وأسطر
// ‎.react-code-lines بمعرّفات L<n> وLC<n>. الأولى عند التزام أول (calculateTotal في السطر 40)، والثانية بعد إضافة 15 سطرًا فوقها
// (السطر 55)، ثم نسخ فيها النطاق مكرر بسياقه، وسطر معدَّل، وسطر محذوف، وسياق متغيّر والسطر باقٍ وحده؛ وصفحات «غير موجود» و«الدخول»
// لمحاكاة الحالتين E وF (لم يُقس شكلهما الحي في T-0.4). العينة اصطناعية لا لقطة حية.
export const REPO = { owner: 'octo', repo: 'shop' } as const;
export const PATH = 'src/cart.js';
export const SHA1 = '1111111111111111111111111111111111111111';
export const SHA2 = '2222222222222222222222222222222222222222';
export const BLOB_URL = `https://github.com/${REPO.owner}/${REPO.repo}/blob/main/${PATH}`;
/** سطر الدالة في النسخة الأولى. */
export const LINE = 40;

const HEAD = ["'use strict';", '', "const { round } = require('./money');", "const { TAX_RATE } = require('./config');", ''];

function filler(prefix: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i += 1) out.push(i % 4 === 0 ? '' : `const ${prefix}${i} = ${i * 7}; // ${prefix} ${i}`);
  return out;
}

const TOTAL = ['function calculateTotal(items) {', '  let sum = 0;', '  for (const item of items) sum += item.price * item.qty;', '  return round(sum * (1 + TAX_RATE));', '}'];
const TAIL = ['', 'function emptyCart() {', '  return [];', '}', '', 'module.exports = { calculateTotal, emptyCart };'];

/** النسخة الأولى: 35 سطرًا قبل الدالة (5 رأس + 34 حشو) فتبدأ في السطر 40. */
export const V1 = [...HEAD, ...filler('limit', 34), ...TOTAL, ...TAIL];
/** B: 15 سطرًا أُضيفت أعلى الملف؛ الدالة في 55. */
export const V2_SHIFTED = [...HEAD, ...filler('added', 15), ...filler('limit', 34), ...TOTAL, ...TAIL];
/** C: النطاق مكرر بسياقه ±2 (نسخة ثانية من الكتلة في آخر الملف) والأصل انزاح؛ فلا موضع واحد. */
export const V3_DUPLICATE = [...HEAD, ...filler('added', 3), ...filler('limit', 34), ...TOTAL, ...TAIL, ...filler('limit', 34).slice(-2), ...TOTAL, '', 'function emptyCart() {'];
/** D: نص السطر المرسى تغيّر. */
export const V4_CHANGED = V1.map((line, i) => (i === LINE - 1 ? 'function calculateTotal(items, coupon) {' : line));
/** D: السطر المرسى حُذف. */
export const V5_DELETED = V1.filter((_, i) => i !== LINE - 1);
/** D مع مرشح «بالنص وحده»: انزاح السطر إلى 55 وتغيّر سياقه (السطر بعده عُدِّل)، والسطر نفسه باقٍ في موضع واحد. */
export const V6_CONTEXT = V2_SHIFTED.map((line, i) => (i === LINE + 15 ? '  let sum = 0, count = 0;' : line));

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface PageOptions {
  readonly visibility?: 'public' | 'private';
  readonly commit?: string;
  /** بلا أسطر: Markdown معروض أو ملف ثنائي. */
  readonly rendered?: boolean;
}

export function codeViewHtml(lines: readonly string[], options: PageOptions = {}): string {
  const commit = options.commit ?? SHA1;
  const rows = options.rendered
    ? '<article class="markdown-body"><p>نص معروض بلا أرقام أسطر</p></article>'
    : `<div class="react-code-lines">${lines
        .map((text, i) => `<div class="react-code-line-container" id="LC${i + 1}-container"><div data-line-number="${i + 1}" id="L${i + 1}" class="react-line-number">${i + 1}</div><div id="LC${i + 1}" class="react-code-text">${escape(text)}</div></div>`)
        .join('\n')}</div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="octolytics-dimension-repository_nwo" content="${REPO.owner}/${REPO.repo}">
<meta name="octolytics-dimension-repository_public" content="${options.visibility === 'private' ? 'false' : 'true'}">
<title>cart.js at main · ${REPO.owner}/${REPO.repo}</title>
<script type="application/json" data-target="react-app.embeddedData">{"payload":{"codeViewLayoutRoute":{"refInfo":{"name":"main","currentOid":"${commit}"},"path":"${PATH}"}}}</script>
</head><body class="logged-in env-production">
<div id="js-repo-pjax-container"><main id="repo-content-pjax-container"><div data-testid="code-view" class="blob-wrapper">${rows}</div></main></div>
</body></html>`;
}

/** صفحة «غير موجود» بلا مستودع ظاهر (مورد محذوف أو مستودع خاص لا وصول إليه). */
export const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found · GitHub</title></head>
<body class="logged-out"><main><img alt="404 “This is not the web page you are looking for”" src="/404.png"><p>Find code, projects, and people on GitHub</p></main></body></html>`;

/** المستودع ظاهر والملف غير موجود فيه (أُعيدت تسميته أو حُذف). */
export const MISSING_IN_REPO_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="octolytics-dimension-repository_nwo" content="${REPO.owner}/${REPO.repo}">
<meta name="octolytics-dimension-repository_public" content="true">
<title>Page not found · GitHub</title></head>
<body><main id="repo-content-pjax-container"><h1>404 - page not found</h1><p>The main branch of shop does not contain the path ${PATH}.</p></main></body></html>`;

/** صفحة دخول بدل المورد. */
export const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in to GitHub · GitHub</title></head>
<body><main><form action="/session" method="post"><input name="login"><input name="password" type="password"></form></main></body></html>`;
