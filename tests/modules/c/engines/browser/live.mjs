#!/usr/bin/env node
// الحزمة المشحونة على صفحات github.com حية (T-4.3، TEST-TR-04): سكربت المحتوى الحقيقي يسجّل محرك DEC-03 تحت سياسة صلاحيات الصفحة الحقيقية
// (Permissions-Policy)، بملف تعريف مؤقت جديد لكل متصفح، بلا دخول ولا إرسال. حيث المحرك متاح: README وصف مشكلة وتعليق ونص محدد بنقر وتحديد فعليين؛
// وحيث لا محرك: الحالة الصريحة و«نسخ النص المقنَّع» إلى الحافظة الحقيقية. ويُسجَّل عنوان كل طلب من الصفحة (بلا الاستعلام) أثناء الترجمة أو النسخ
// في عائلة Chromium؛ وMarionette لا يرصد الشبكة فلا يُسجَّل في Firefox.
// يتطلب dist مبنيًا (npm run build). الاستعمال: node tests/modules/c/engines/browser/live.mjs [chrome edge brave firefox] [--out <ملف json>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, launchFirefox, machineInfo, sleep, waitFor, writeJson } from '../../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const PAGES = { readme: 'https://github.com/octocat/Spoon-Knife', issue: 'https://github.com/microsoft/TypeScript/issues/1' };
const GITHUB_HOSTS = /(^|\.)(github\.com|githubassets\.com|githubusercontent\.com)$/;
const NOT_READY = 'لم يجهز مترجم المتصفح بعد';

// ——— دوال تُنفَّذ في الصفحة (العالم الرئيسي يرى جذور الظل المفتوحة) ———
function barsFn() {
  const ARABIC = /[؀-ۿ]/;
  return [...document.querySelectorAll('mijhar-host[data-mijhar-host="c.ui.bar"]')].map((host, index) => {
    const root = host.shadowRoot;
    // جسم النص أول شقيق تالٍ ليس مضيفًا لمِجهَر (قد يُدرج مضيف آخر بين الشريط والنص).
    let body = host.nextElementSibling;
    const between = [];
    while (body && body.localName === 'mijhar-host') {
      between.push(body.getAttribute('data-mijhar-host'));
      body = body.nextElementSibling;
    }
    const translations = body ? [...body.querySelectorAll('mijhar-host[data-mijhar-host="c.ui.translation"]')] : [];
    const texts = translations.filter((h) => h.getAttribute('data-kind') === 'translation').map((h) => h.shadowRoot?.querySelector('.tr-body')?.textContent ?? '');
    return {
      index,
      phase: root?.querySelector('.bar')?.getAttribute('data-phase'),
      note: root?.querySelector('[data-note]')?.textContent?.replace(/\s+/g, ' ').trim(),
      actions: [...(root?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('data-action') ?? b.getAttribute('data-mode')),
      body: body ? (body.getAttribute('data-testid') ?? body.className).slice(0, 60) : null,
      between,
      translations: texts.length,
      warnings: translations.filter((h) => h.getAttribute('data-kind') === 'warning').length,
      arabic: texts.filter((t) => ARABIC.test(t)).length,
      tokenLeak: texts.some((t) => /[⟦⟧]|\{\d+\}|\[\[\d+\]\]/.test(t)),
      sample: texts.slice(0, 2).map((t) => t.slice(0, 160)),
    };
  });
}
function buttonFn(arg) {
  const host = document.querySelectorAll('mijhar-host[data-mijhar-host="c.ui.bar"]')[arg.index];
  const el = host?.shadowRoot?.querySelector(`[data-action="${arg.action}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}
function dragFn() {
  const p = [...document.querySelectorAll('article.markdown-body p')].find((el) => /[A-Za-z]{4}/.test(el.textContent ?? ''));
  if (!p) return null;
  p.scrollIntoView({ block: 'center', behavior: 'instant' });
  const first = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
  if (!first) return null;
  const a = document.createRange();
  a.setStart(first, 0);
  a.setEnd(first, 1);
  const s = a.getBoundingClientRect();
  const b = document.createRange();
  b.setStart(first, 0);
  b.setEnd(first, Math.min(30, first.length));
  const rects = b.getClientRects();
  const e = rects[rects.length - 1];
  return { x1: Math.round(s.left + 1), y1: Math.round(s.top + s.height / 2), x2: Math.round(e.right), y2: Math.round(e.top + e.height / 2) };
}
function selectionFn() {
  const root = document.querySelector('mijhar-host[data-mijhar-host="c.ui.selection"]')?.shadowRoot;
  const at = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  };
  const card = root?.querySelector('.sel-card');
  const translation = card?.querySelector('[data-section="translation"]')?.textContent ?? null;
  return {
    selected: document.getSelection()?.toString() ?? '',
    button: at(root?.querySelector('[data-action="translate-selection"]')),
    copyButton: at(root?.querySelector('[data-action="copy-masked"]')),
    card: card && { status: card.getAttribute('data-status'), translation, arabic: /[؀-ۿ]/.test(translation ?? ''), notice: card.querySelector('[data-section="notice"]')?.textContent ?? null, copyNote: card.querySelector('[data-section="copy-note"]')?.textContent ?? null },
  };
}

// ——— مشغّل موحّد ———
function driver(key, b, ff) {
  if (ff) {
    const actions = (list) => ff.actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: list }]);
    return {
      goto: (url) => ff.navigate(url),
      eval: (fn, arg) => ff.exec(`return (${fn})(arguments[0]);`, [arg ?? null]),
      click: (x, y) => actions([{ type: 'pointerMove', duration: 0, x, y, origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]),
      drag: (d) => actions([{ type: 'pointerMove', duration: 0, x: d.x1, y: d.y1, origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', duration: 200, x: d.x2, y: d.y2, origin: 'viewport' }, { type: 'pointerUp', button: 0 }]),
      requests: () => [],
      clipboard: async () => null,
    };
  }
  const page = b.page;
  const hosts = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    // طلبات الشبكة وحدها؛ موارد الإضافة نفسها (chrome-extension://) ليست اتصالًا.
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.push(`${url.origin}${url.pathname}`);
  });
  return {
    goto: async (url) => {
      const response = await page.goto(url, { waitUntil: 'load' });
      return response?.headers()['permissions-policy'] ?? null;
    },
    eval: (fn, arg) => page.evaluate(fn, arg ?? null),
    click: (x, y) => page.mouse.click(x, y),
    drag: async (d) => {
      await page.mouse.move(d.x1, d.y1);
      await page.mouse.down();
      await page.mouse.move(d.x2, d.y2, { steps: 8 });
      await page.mouse.up();
    },
    requests: () => hosts.splice(0),
    clipboard: () => page.evaluate(() => navigator.clipboard.readText()).catch((e) => `خطأ: ${e.message}`),
  };
}

async function waitBars(d) {
  const bars = await waitFor(async () => {
    const list = await d.eval(barsFn);
    return list.length > 0 && list[0].note !== undefined ? list : null;
  }, 30000, 250);
  await sleep(1500);
  return bars && d.eval(barsFn);
}

async function translateBar(d, index) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const t0 = Date.now();
    // صفحات GitHub الحية تواصل الرسم بعد ظهور الأشرطة: يُعاد حساب موضع الزر بعد الاستقرار، والنقرة التي لم تبدأ جلسة تُعاد.
    let started = false;
    for (let click = 1; click <= 3 && !started; click += 1) {
      await d.eval(buttonFn, { index, action: 'translate' });
      await sleep(800);
      const at = await d.eval(buttonFn, { index, action: 'translate' });
      if (!at) return { attempts, error: 'لا زر ترجمة', bar: (await d.eval(barsFn))[index] };
      const before = (await d.eval(barsFn))[index]?.note;
      await d.click(at.x, at.y);
      started = Boolean(await waitFor(async () => {
        const now = (await d.eval(barsFn))[index];
        return now?.phase === 'working' || now?.phase === 'done' || now?.note !== before;
      }, 5000, 200));
    }
    const bar = await waitFor(async () => {
      const b = (await d.eval(barsFn))[index];
      return b && ['done', 'error', 'empty'].includes(b.phase) ? b : null;
    }, 240000, 300);
    attempts.push({ attempt, ms: Date.now() - t0, phase: bar?.phase ?? 'timeout', note: bar?.note });
    if (bar?.phase !== 'error' || !bar.note?.includes(NOT_READY)) return { attempts, bar };
    await sleep(15000);
  }
  return { attempts, bar: (await d.eval(barsFn))[index] };
}

const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), pages: PAGES, results: [] };
for (const key of keys) {
  const r = { key };
  let ff = null;
  let b = null;
  try {
    if (key === 'firefox') {
      ff = await launchFirefox();
      r.browser = ff.version;
      await ff.installAddon(path.join(ROOT, 'dist/firefox'));
    } else {
      const launched = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium') });
      await launched.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://github.com' });
      b = { ...launched, page: await launched.context.newPage() };
      r.browser = launched.version;
    }
    const d = driver(key, b, ff);
    // README
    r.permissionsPolicy = await d.goto(PAGES.readme);
    const bars = await waitBars(d);
    r.readmeBars = bars;
    const first = bars?.[0];
    const ready = Boolean(first) && !first.note.startsWith('المحرك غير متاح');
    r.ready = ready;
    d.requests();
    if (ready) {
      r.readme = await translateBar(d, 0);
      // نص محدد
      const drag = await d.eval(dragFn);
      if (drag) {
        await d.drag(drag);
        await sleep(400);
        const sel = await d.eval(selectionFn);
        if (sel.button) {
          await d.click(sel.button.x, sel.button.y);
          r.selection = (await waitFor(async () => {
            const s = await d.eval(selectionFn);
            return s.card && s.card.status !== 'working' ? s : null;
          }, 60000, 250))?.card;
        } else r.selection = { error: 'لا زر «ترجمة المحدد»', sel };
      }
      r.readmeRequestHosts = [...new Set(d.requests())];
      // وصف مشكلة وتعليق
      await d.goto(PAGES.issue);
      const issueBars = await waitBars(d);
      r.issueBars = issueBars?.map(({ index, body, phase }) => ({ index, body, phase }));
      d.requests();
      r.issueDescription = issueBars?.[0] ? await translateBar(d, 0) : { error: 'لا شريط' };
      r.comment = issueBars?.[1] ? await translateBar(d, 1) : { error: 'لا شريط ثانٍ' };
      r.issueRequestHosts = [...new Set(d.requests())];
    } else {
      const at = await d.eval(buttonFn, { index: 0, action: 'copy-masked' });
      if (at) {
        await d.click(at.x, at.y);
        await sleep(600);
        r.afterCopy = (await d.eval(barsFn))[0];
        const clip = await d.clipboard();
        r.clipboard = clip === null ? 'لم يُقرأ (Firefox: قراءة الحافظة من الصفحة محجوبة؛ يُكتفى بإعلان نجاح النسخ)' : clip.slice(0, 300);
      } else r.afterCopy = { error: 'لا زر «نسخ النص المقنَّع»' };
      r.copyRequestHosts = [...new Set(d.requests())];
    }
  } catch (e) {
    r.error = String(e.stack ?? e);
  } finally {
    await (ff ?? b)?.close();
  }
  const hosts = [...(r.readmeRequestHosts ?? []), ...(r.issueRequestHosts ?? []), ...(r.copyRequestHosts ?? [])];
  r.nonGithubHosts = [...new Set(hosts.map((u) => new URL(u).hostname).filter((h) => !GITHUB_HOSTS.test(h)))];
  output.results.push(r);
  const line = r.ready
    ? `README ${r.readme?.bar?.translations ?? '?'} مترجمة/${r.readme?.bar?.warnings ?? '?'} أصل · تحديد ${r.selection?.status ?? '?'} · وصف ${r.issueDescription?.bar?.phase ?? '?'} · تعليق ${r.comment?.bar?.phase ?? '?'}`
    : `غير متاح: ${r.readmeBars?.[0]?.note?.slice(0, 60) ?? r.error?.slice(0, 120)} · بعد النسخ: ${r.afterCopy?.note?.slice(-60) ?? r.afterCopy?.error}`;
  console.error(`${key} ${r.browser ?? ''}: ${line} · مضيفات خارج GitHub: ${JSON.stringify(r.nonGithubHosts)}`);
}
if (outFile) writeJson(outFile, output);
