#!/usr/bin/env node
// فحص تكامل المرحلة MJ9 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، لا على حزمة اختبار:
// الوحدة (ز) والوحدة (ح) تُركَّبان من BUILTIN_MODULES في سكربت المحتوى الحقيقي، وواجهاتهما في PANEL_VIEWS الحقيقية.
// صفحات github.com تُخدَم من عينات محلية (الشبكة الحقيقية غير مستعملة)؛ وapi.github.com يُخدَم من الخادم المحلي نفسه ويُسجَّل كل طلب إليه.
//  1. شريط README العربي (T-9.1): بيان النطاق ورابط الملف العربي والاقتطاع وزر docs/ داخل الصفحة.
//  2. بطاقة الملف الشخصي (T-9.4): «محتوى عربي» منفصل عن «بيانات يعلنها صاحب الحساب» حرفيًا.
//  3. الملاحظات (T-8.1): بطاقة الصفحة وعلامات الأسطر (ملف وفروق)، وإنشاء من الصفحة ثم رؤيتها وتحريرها وحذفها من اللوحة الأصلية
//     (سياقان حقيقيان يتشاركان storage.local)، وحالة «غير مثبتة» لـMarkdown، وإيقاف الوحدة (ز) يعيد DOM حرفيًا.
//  4. الدرج: لا حقول كتابة في أي تبويب (DEC-04) مع رسائل بديلة.
//  5. لوحة المجتمع (T-9.3 وT-9.4 وT-9.5): المرشد يقرأ ملفات المشروع، والاكتشاف يعرض الاستعلام ولا يفتح شيئًا، والموارد المضمّنة؛
//     وفي Firefox (extensions.webextOptionalPermissionPrompts=false) تُمنح الصلاحية الاختيارية فيُختبر المنح فعلًا: فحص docs/ وأعداد الوسوم وفحص الروابط.
//  6. تدقيق الشبكة: لا طلب إلى api.github.com قبل المنح ولا خارج الفحوص الثلاثة، ولا مضيف آخر.
// الاستعمال: node evidence/MJ9/integration-check.mjs [chrome edge brave firefox] ← evidence/MJ9/integration.json
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(read, timeoutMs = 6000, stepMs = 80) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const dbg = (...args) => process.env.MJ9_DEBUG && console.log('DEBUG', ...args);

// ---------- الصفحات المخدومة بدل github.com ----------

const FX_H = 'tests/modules/h/fixtures';
const FX_G = 'tests/modules/g/notes/fixtures';
const PR_ANCHOR = 'diff-c72a907ac323cd2f334ed0e2bd07d15ab62581c4753660c8a0d1c681b30be4b6';
const rename = (to) => (text) => text.replaceAll('octo/community', `octo/${to}`);
const PAGES = {
  '/octo/community': { file: `${FX_H}/fixture-community-repo.html` },
  '/octo/community-ar': { file: `${FX_H}/fixture-community-repo-arabic.html`, transform: rename('community-ar') },
  '/octo/community-trunc': { file: `${FX_H}/fixture-community-repo-truncated.html`, transform: rename('community-trunc') },
  '/abu_ahmad': { file: `${FX_H}/fixture-profile.html` },
  '/octo/demo/blob/main/lib/response.js': { file: `${FX_G}/fixture-code-view-drift.html` },
  '/octo/demo/blob/main/README.md': { file: `${FX_G}/fixture-blob-markdown.html` },
  '/octo/demo/pull/42/files': { file: `${FX_G}/fixture-pr-files.html` },
  '/octo/community/raw/HEAD/CONTRIBUTING.md': { file: `${FX_H}/fixture-contributing.md`, type: 'text/plain; charset=utf-8' },
  '/octo/community/raw/HEAD/README.md': { file: `${FX_H}/fixture-readme.md`, type: 'text/plain; charset=utf-8' },
  '/octo/community/raw/HEAD/.github/pull_request_template.md': { file: `${FX_H}/fixture-pr-template.md`, type: 'text/plain; charset=utf-8' },
};
const U = {
  community: 'https://github.com/octo/community',
  communityAr: 'https://github.com/octo/community-ar',
  communityTrunc: 'https://github.com/octo/community-trunc',
  profile: 'https://github.com/abu_ahmad',
  blob: 'https://github.com/octo/demo/blob/main/lib/response.js',
  markdown: 'https://github.com/octo/demo/blob/main/README.md',
  prFiles: 'https://github.com/octo/demo/pull/42/files',
};

/** ما يُخدَم في github.com: [status, type, body]. */
function serveGithub(pathname) {
  const page = PAGES[pathname];
  if (!page) return [404, 'text/plain', 'not found'];
  const raw = read(page.file);
  return [200, page.type ?? 'text/html; charset=utf-8', page.transform ? page.transform(raw) : raw];
}

/** ما يُخدَم في api.github.com: [status, body]. */
function serveApi(pathname, search) {
  if (pathname === '/repos/octo/community/contents/docs') return [200, [{ name: 'README.ar.md', path: 'docs/README.ar.md', type: 'file', html_url: 'https://github.com/octo/community/blob/main/docs/README.ar.md' }, { name: 'guide.md', path: 'docs/guide.md', type: 'file' }]];
  if (pathname === '/search/issues') return [200, { total_count: /good first issue/.test(decodeURIComponent(search)) ? 12 : 3, items: [] }];
  const repo = /^\/repos\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (repo) return [200, { full_name: `${repo[1]}/${repo[2]}`, html_url: `https://github.com/${repo[1]}/${repo[2]}`, archived: false, pushed_at: '2026-10-20T00:00:00Z', license: { spdx_id: 'MIT' } }];
  return [404, { message: 'Not Found' }];
}

// ---------- مجسّات تعمل داخل الصفحة (كل منها يأخذ وسيطًا واحدًا) ----------

const probes = {
  hosts: () => [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host')),
  card: () => {
    const host = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'g');
    if (!host?.shadowRoot) return null;
    const r = host.shadowRoot;
    const slot = r.querySelector('.notes-card');
    return {
      shown: Boolean(slot),
      count: r.querySelector('.count')?.textContent ?? null,
      expanded: r.querySelector('.card-bar')?.getAttribute('aria-expanded') ?? null,
      chips: [...r.querySelectorAll('.chip')].map((c) => `${c.getAttribute('data-level')}:${c.getAttribute('aria-pressed')}`),
      field: r.querySelector('label.field')?.textContent ?? null,
      notes: [...r.querySelectorAll('.note')].map((n) => ({ id: n.getAttribute('data-note-id'), level: n.getAttribute('data-level'), text: n.querySelector('.note-text')?.textContent ?? null, anchor: n.querySelector('.anchor')?.getAttribute('data-status') ?? null, flash: n.hasAttribute('data-flash') })),
      styled: getComputedStyle(r.querySelector('.card-bar') ?? r.firstElementChild).display,
    };
  },
  markers: () => [...document.querySelectorAll('mijhar-host[data-mijhar-host="g-line-marker"]')].map((h) => ({ line: h.parentElement?.getAttribute('data-line-number'), id: h.parentElement?.id ?? null, label: h.shadowRoot?.querySelector('.line-marker')?.getAttribute('aria-label') ?? null })),
  // إجراء داخل ظل مضيف: {host, sel, do: 'click' | 'type', value}
  act: (a) => {
    const host = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === a.host);
    const el = host?.shadowRoot?.querySelector(a.sel);
    if (!el) return false;
    if (a.do === 'type') {
      el.value = a.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else el.click();
    return true;
  },
  // إجراء في الصفحة العادية (لوحة الإضافة وصفحة الإعدادات)
  page: (a) => {
    const el = document.querySelector(a.sel);
    if (!el) return false;
    if (a.do === 'type') {
      el.value = a.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (a.change) el.dispatchEvent(new Event('change', { bubbles: true }));
    } else el.click();
    return true;
  },
  text: (a) => document.querySelector(a.sel)?.textContent ?? null,
  count: (a) => document.querySelectorAll(a.sel).length,
  readme: () => {
    const host = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'h');
    if (!host?.shadowRoot) return null;
    const r = host.shadowRoot;
    const q = (s) => r.querySelector(s);
    return {
      state: q('[data-readme-state]')?.getAttribute('data-readme-state') ?? null,
      statement: q('[data-readme-state]')?.textContent ?? null,
      scope: q('[data-readme-scope]')?.textContent ?? null,
      truncated: q('[data-readme-truncated]')?.textContent ?? null,
      matches: [...r.querySelectorAll('[data-readme-match]')].map((a) => `${a.getAttribute('data-readme-match')} ${a.href}`),
      scanButton: Boolean(q('[data-action="scan-docs"]')),
      scanState: q('[data-scan-state]')?.getAttribute('data-scan-state') ?? null,
      scanText: q('[data-scan-state]')?.textContent ?? null,
      before: host.nextElementSibling?.tagName ?? null,
      all: r.textContent,
    };
  },
  profile: () => {
    const host = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'h');
    const r = host?.shadowRoot;
    if (!r) return null;
    const f = (n) => r.querySelector(`[data-field="${n}"]`)?.textContent ?? null;
    return {
      contentTitle: r.querySelector('[data-block="arabic-content"] h3')?.textContent,
      repos: [...r.querySelectorAll('[data-block="arabic-content"] [data-repo]')].map((n) => n.getAttribute('data-repo')),
      declaredTitle: r.querySelector('[data-block="declared"] h3')?.textContent,
      name: f('name'),
      location: f('location'),
      bio: f('bio'),
      notice: r.querySelector('[data-declared-notice]')?.textContent ?? null,
      contentText: r.querySelector('[data-block="arabic-content"]')?.textContent ?? '',
    };
  },
  drawer: () => {
    const host = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'drawer');
    const r = host?.shadowRoot;
    if (!r) return null;
    const tabs = [...r.querySelectorAll('[role="tab"]')];
    return { open: host.hasAttribute('data-open'), tabs: tabs.length };
  },
  drawerTab: (a) => {
    const r = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'drawer')?.shadowRoot;
    const tab = r?.querySelector(`[role="tab"][id$="-tab-${a.id}"]`);
    if (!tab) return null;
    tab.click();
    return new Promise((resolve) =>
      setTimeout(() => {
        const fields = [...r.querySelectorAll('input, textarea, select, [contenteditable]')].filter((el) => !(el.type === 'checkbox' || el.type === 'radio'));
        resolve({ fields: fields.length, notices: [...r.querySelectorAll('[data-native-only]')].map((n) => n.getAttribute('data-native-only')), views: [...r.querySelectorAll('[data-view]')].map((n) => n.getAttribute('data-view')) });
      }, 400),
    );
  },
  // <main> الحي يطابق تحليل العينة الخام بمحلل المتصفح حرفيًا (أسلوب الموجة C).
  mainMatches: (a) => {
    const original = new DOMParser().parseFromString(a.raw, 'text/html').querySelector('main')?.outerHTML;
    const live = document.querySelector('main')?.outerHTML;
    if (original === live) return { equal: true };
    let i = 0;
    while (i < original.length && original[i] === live[i]) i += 1;
    return { equal: false, at: i, original: original.slice(Math.max(0, i - 80), i + 80), live: live.slice(Math.max(0, i - 80), i + 80) };
  },
  storageNotes: async () => {
    const api = globalThis.browser ?? globalThis.chrome ?? window.wrappedJSObject?.browser;
    const all = await api.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith('mijhar:data:notes.'))
      .map(([, v]) => ({ id: v.id, level: v.target.level, view: v.target.view ?? null, text: v.text, anchorStatus: v.anchorStatus, start: v.target.start ?? null, path: v.target.path ?? null }));
  },
  clearNotes: async () => {
    const api = globalThis.browser ?? globalThis.chrome ?? window.wrappedJSObject?.browser;
    const all = await api.storage.local.get(null);
    await api.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('mijhar:data:notes.')));
    return true;
  },
  sendDrawer: async (a) => {
    const api = globalThis.browser ?? globalThis.chrome ?? window.wrappedJSObject?.browser;
    const tabs = await api.tabs.query({ url: 'https://github.com/*' });
    const own = tabs.filter((t) => t.url.startsWith(a.url));
    for (const t of own) await api.tabs.sendMessage(t.id, { type: 'mijhar:drawer', action: 'open' });
    return own.length;
  },
};

// ---------- السيناريوهات (مشتركة بين المحركين) ----------

const ASSERTIVE = [/لا يوجد/, /لا توجد/, /غير موجود/, /ليس (لديه|له|فيه)/, /لا ملف/, /no arabic readme/i];

async function scenarios(d, check, ctx) {
  const settle = () => sleep(350);
  // التبويب الخلفي في Firefox يُبطَّأ مؤقتاته فيتأخر ظهور الزر ثوانيَ: لا نقر قبل حضوره.
  const clickWhenPresent = async (name, sel, timeout = 20000) => {
    const present = await waitUntil(async () => ((await d.ev(name, probes.count, { sel })) > 0 ? true : null), timeout, 150);
    if (!present) return false;
    return d.realClick(name, sel);
  };

  // 1) شريط README العربي
  await d.open('community', U.community);
  const community = await waitUntil(async () => (await d.ev('community', probes.readme)) ?? null, 10000);
  check('readme.scope', community?.state === 'not-found-in-scope' && community.statement.includes('نطاق الفحص الحالي'), { state: community?.state });
  check('readme.no-assertive-absence', Boolean(community) && ASSERTIVE.every((p) => !p.test(community.all)), {});
  check('readme.banner-before-readme', community?.before === 'ARTICLE' || community?.before === 'DIV', { before: community?.before });
  check('readme.scope-detail', /9 عنصرًا من شجرة الجذر/.test(community?.scope ?? ''), { scope: community?.scope });
  await d.ev('community', probes.act, { host: 'h', sel: '[data-action="scan-docs"]', do: 'click' });
  const scan = await waitUntil(async () => (await d.ev('community', probes.readme))?.scanState, 5000);
  const scanned = await d.ev('community', probes.readme);
  check('readme.docs-scan-in-page-incomplete', scan === 'incomplete' && /لم يكتمل/.test(scanned?.scanText ?? ''), { scanText: scanned?.scanText });
  check('readme.docs-scan-in-page-no-api-request', ctx.apiRequests().length === 0, { requests: ctx.apiRequests().length });
  await ctx.shot('readme-banner', 'community');

  await d.open('community-ar', U.communityAr);
  const ar = await waitUntil(async () => (await d.ev('community-ar', probes.readme))?.state === 'found' && (await d.ev('community-ar', probes.readme)), 10000);
  check('readme.arabic-found', ar?.state === 'found' && ar.matches.some((m) => m.startsWith('README.ar-AR.md https://github.com/octo/community-ar/blob/main/README.ar-AR.md')), { matches: ar?.matches });
  check('readme.arabic-no-scan-button', ar?.scanButton === false, {});

  await d.open('community-trunc', U.communityTrunc);
  const trunc = await waitUntil(async () => (await d.ev('community-trunc', probes.readme))?.truncated && (await d.ev('community-trunc', probes.readme)), 10000);
  check('readme.truncation-announced', /مقتطعة.*1000.*5108|مقتطعة.*5108/.test(trunc?.truncated ?? ''), { truncated: trunc?.truncated });

  // 2) بطاقة الملف الشخصي
  await d.open('profile', U.profile);
  const profile = await waitUntil(async () => (await d.ev('profile', probes.profile)) ?? null, 10000);
  check('profile.two-separate-blocks', profile?.contentTitle === 'محتوى عربي' && profile?.declaredTitle === 'بيانات يعلنها صاحب الحساب', { profile: profile && { c: profile.contentTitle, d: profile.declaredTitle } });
  check('profile.declared-verbatim', profile?.name === 'Mohammed Al-Farsi' && profile?.location === 'Riyadh, Saudi Arabia' && profile?.bio === 'Backend engineer', { name: profile?.name, location: profile?.location, bio: profile?.bio });
  check('profile.arabic-content-from-description-only', JSON.stringify(profile?.repos) === JSON.stringify(['abu_ahmad/arabic-nlp']) && !/Riyadh|Saudi|Mohammed/.test(profile?.contentText ?? ''), { repos: profile?.repos });
  check('profile.notice', /نص حر لا يمثل استنتاجًا/.test(profile?.notice ?? ''), {});
  await ctx.shot('profile-card', 'profile');

  // 3) الملاحظات: الصفحة ثم اللوحة (سياقان حقيقيان)
  await d.open('options', `${d.origin}/options.html`);
  await waitUntil(async () => (await d.ev('options', probes.text, { sel: '#app' })) !== null && (await d.ev('options', probes.count, { sel: '[data-section="units"] input' })) > 0, 8000);
  await d.ev('options', probes.clearNotes);

  await d.open('blob', `${U.blob}#L3-L5`);
  const card0 = await waitUntil(async () => (await d.ev('blob', probes.card))?.shown && (await d.ev('blob', probes.card)), 10000);
  check('notes.card-collapsed-by-default', card0?.expanded === 'false' && card0?.count === '0', { card: card0 && { e: card0.expanded, c: card0.count } });
  check('notes.card-styled', card0?.styled === 'flex', { display: card0?.styled });
  await d.ev('blob', probes.act, { host: 'g', sel: '.card-bar', do: 'click' });
  await settle();
  const card1 = await d.ev('blob', probes.card);
  check('notes.levels-on-blob-page', JSON.stringify(card1?.chips) === JSON.stringify(['repo:false', 'file:false', 'line:true']), { chips: card1?.chips });
  check('notes.line-target-from-hash', /\(3–5\)/.test(card1?.field ?? ''), { field: card1?.field });
  await d.ev('blob', probes.act, { host: 'g', sel: 'textarea', do: 'type', value: 'ملاحظة على الأسطر ٣ إلى ٥' });
  await d.ev('blob', probes.act, { host: 'g', sel: '[data-action="create"]', do: 'click' });
  await settle();
  const stored1 = await waitUntil(async () => ((await d.ev('options', probes.storageNotes)).length ? d.ev('options', probes.storageNotes) : null), 5000);
  // بعد MJ12 (T-8.3) تُنشأ للملاحظة مرساة عند إنشائها فتكون حالتها «matched» لا «unverified» (كانت الثانية قبل وجود المحرك).
  check('notes.line-note-stored', stored1?.length === 1 && stored1[0].level === 'line' && stored1[0].view === 'blob' && stored1[0].start === 3 && stored1[0].anchorStatus === 'matched' && stored1[0].path === 'lib/response.js', { stored: stored1 });
  const markers1 = await waitUntil(async () => ((await d.ev('blob', probes.markers)).length ? d.ev('blob', probes.markers) : null), 5000);
  check('notes.marker-beside-line-number', markers1?.length === 1 && markers1[0].line === '3', { markers: markers1 });
  check('notes.marker-aria-label', markers1?.[0]?.label === 'ملاحظة خاصة على هذا السطر', {});
  await ctx.shot('blob-card-and-marker', 'blob');
  const card2 = await d.ev('blob', probes.card);
  check('notes.card-lists-note', card2?.notes.length === 1 && card2.notes[0].anchor === 'matched' && card2.count === '1', { notes: card2?.notes });

  // اللوحة الأصلية في تبويب خلفي، وصفحة GitHub هي التبويب النشط
  await d.open('panel', `${d.origin}/sidepanel.html`);
  await waitUntil(async () => (await d.ev('panel', probes.text, { sel: '#app' })) !== null && (await d.ev('panel', probes.count, { sel: '[role="tab"]' })) === 5, 8000);
  await d.front('blob');
  await d.ev('panel', probes.page, { sel: '#mj-native-tab-notes', do: 'click' });
  const panelNotes = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-notes-view] .note' })) > 0 ? true : null), 8000);
  check('notes.panel-sees-page-note', Boolean(panelNotes), {});
  await ctx.shot('panel-notes', 'panel', 'blob');
  check('notes.panel-reads-active-tab', /octo\/demo/.test((await d.ev('panel', probes.text, { sel: '[data-notes-page]' })) ?? ''), { page: await d.ev('panel', probes.text, { sel: '[data-notes-page]' }) });
  await d.ev('panel', probes.page, { sel: '[data-action="edit"]', do: 'click' });
  await d.ev('panel', probes.page, { sel: '.note textarea', do: 'type', value: 'ملاحظة معدّلة من اللوحة' });
  await d.ev('panel', probes.page, { sel: '[data-action="save-edit"]', do: 'click' });
  const edited = await waitUntil(async () => ((await d.ev('blob', probes.card))?.notes[0]?.text === 'ملاحظة معدّلة من اللوحة' ? true : null), 6000);
  check('notes.edit-in-panel-reaches-page', Boolean(edited), { page: (await d.ev('blob', probes.card))?.notes });
  const keptStatus = (await d.ev('options', probes.storageNotes))[0];
  check('notes.edit-keeps-anchor-status-separate', keptStatus?.anchorStatus === 'matched' && keptStatus?.text === 'ملاحظة معدّلة من اللوحة', { keptStatus });
  // مستوى الملف من اللوحة
  await d.ev('panel', probes.page, { sel: '.chip[data-level="file"]', do: 'click' });
  await d.ev('panel', probes.page, { sel: '[data-notes-view] textarea', do: 'type', value: 'ملاحظة على الملف' });
  await d.ev('panel', probes.page, { sel: '[data-action="create"]', do: 'click' });
  const fileSeen = await waitUntil(async () => ((await d.ev('blob', probes.card))?.count === '2' ? true : null), 6000);
  check('notes.file-note-from-panel-reaches-page', Boolean(fileSeen), { count: (await d.ev('blob', probes.card))?.count });
  // حذف السطر من اللوحة يزيل العلامة
  await d.ev('panel', probes.page, { sel: '.chip[data-level="line"]', do: 'click' });
  await d.ev('panel', probes.page, { sel: '[data-action="delete"]', do: 'click' });
  await d.ev('panel', probes.page, { sel: '[data-action="confirm-delete"]', do: 'click' });
  const markerGone = await waitUntil(async () => ((await d.ev('blob', probes.markers)).length === 0 ? true : null), 6000);
  check('notes.delete-in-panel-removes-marker', Boolean(markerGone), { markers: await d.ev('blob', probes.markers) });

  // الإيقاف والتشغيل من صفحة الإعدادات: DOM حرفيًا
  await d.ev('options', probes.page, { sel: '#mj-unit-g', do: 'click' });
  const off = await waitUntil(async () => ((await d.ev('blob', probes.hosts)).includes('g') ? null : true), 6000);
  const mainAfterOff = await d.ev('blob', probes.mainMatches, { raw: read(PAGES['/octo/demo/blob/main/lib/response.js'].file) });
  check('notes.unit-off-removes-card', Boolean(off), { hosts: await d.ev('blob', probes.hosts) });
  check('notes.unit-off-restores-main', mainAfterOff?.equal === true, { mainAfterOff });
  await d.ev('options', probes.page, { sel: '#mj-unit-g', do: 'click' });
  const on = await waitUntil(async () => ((await d.ev('blob', probes.hosts)).includes('g') ? true : null), 6000);
  check('notes.unit-on-restores-card', Boolean(on), {});

  // Markdown: لا أسطر في DOM → «غير مثبتة»
  await d.ev('options', probes.clearNotes);
  await d.open('markdown', `${U.markdown}#L2`);
  await waitUntil(async () => (await d.ev('markdown', probes.card))?.shown, 10000);
  await d.ev('markdown', probes.act, { host: 'g', sel: '.card-bar', do: 'click' });
  await settle();
  await d.ev('markdown', probes.act, { host: 'g', sel: 'textarea', do: 'type', value: 'سطر في Markdown معروض' });
  await d.ev('markdown', probes.act, { host: 'g', sel: '[data-action="create"]', do: 'click' });
  await settle();
  const md = await waitUntil(async () => ((await d.ev('options', probes.storageNotes)).length ? d.ev('options', probes.storageNotes) : null), 5000);
  check('notes.markdown-line-unanchored-but-saved', md?.length === 1 && md[0].anchorStatus === 'unanchored' && md[0].text === 'سطر في Markdown معروض', { stored: md });
  check('notes.no-marker-for-unlocatable-line', (await d.ev('markdown', probes.markers)).length === 0, {});

  // فروق طلب دمج
  await d.ev('options', probes.clearNotes);
  await d.open('pr', `${U.prFiles}#${PR_ANCHOR}R5`);
  await waitUntil(async () => (await d.ev('pr', probes.card))?.shown, 10000);
  await d.ev('pr', probes.act, { host: 'g', sel: '.card-bar', do: 'click' });
  await settle();
  const prCard = await d.ev('pr', probes.card);
  check('notes.diff-line-level-selected', prCard?.chips?.includes('line:true') && /src\/app\.js/.test(prCard?.field ?? ''), { chips: prCard?.chips, field: prCard?.field });
  await d.ev('pr', probes.act, { host: 'g', sel: 'textarea', do: 'type', value: 'ملاحظة على فرق' });
  await d.ev('pr', probes.act, { host: 'g', sel: '[data-action="create"]', do: 'click' });
  await settle();
  const prMarkers = await waitUntil(async () => ((await d.ev('pr', probes.markers)).length ? d.ev('pr', probes.markers) : null), 5000);
  check('notes.diff-marker-on-right-side-line', prMarkers?.length === 1 && prMarkers[0].id === `${PR_ANCHOR}R5`, { markers: prMarkers });
  const prStored = await d.ev('options', probes.storageNotes);
  check('notes.diff-note-stored-with-path', prStored?.[0]?.view === 'diff' && prStored[0].path === 'src/app.js', { stored: prStored });
  await d.ev('options', probes.clearNotes);

  // 4) الدرج: لا حقول كتابة
  const sent = await d.ev('options', probes.sendDrawer, { url: U.community });
  await d.front('community');
  const drawerOpen = await waitUntil(async () => (await d.ev('community', probes.drawer))?.open, 6000);
  check('drawer.opens-by-message', sent >= 1 && Boolean(drawerOpen), { sent });
  const tabsSeen = {};
  for (const id of ['context', 'glossary', 'notes', 'community', 'settings']) tabsSeen[id] = await d.ev('community', probes.drawerTab, { id });
  await d.ev('community', probes.drawerTab, { id: 'notes' });
  await ctx.shot('drawer-notes-notice', 'community');
  check('drawer.no-text-fields-in-any-tab', Object.values(tabsSeen).every((t) => t && t.fields === 0), { tabs: tabsSeen });
  check('drawer.notes-tab-shows-native-only-notice', tabsSeen.notes?.notices?.includes('ملاحظاتي'), { notices: tabsSeen.notes?.notices });
  // الإشعاران الأصليان من MJ9 يبقيان؛ وأضافت MJ12 (T-9.2) ثالثًا لمعالج README، فيُقاس الأصليان ولا يُحصر العدد في اثنين.
  check('drawer.community-tab', JSON.stringify(tabsSeen.community?.views) === JSON.stringify(['readme', 'guide']) && ['اكتشاف المحتوى العربي', 'موارد تعلّم عربية'].every((n) => tabsSeen.community?.notices?.includes(n)), { community: tabsSeen.community });

  // 5) لوحة المجتمع (تبويب GitHub نشط = /octo/community)
  await d.front('community');
  await d.front('panel');
  await d.front('community');
  await d.ev('panel', probes.page, { sel: '#mj-native-tab-community', do: 'click' });
  const views = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-view]' })) === 4 ? true : null), 20000, 150);
  check('community.four-views-in-panel', Boolean(views), { views: await d.ev('panel', probes.count, { sel: '[data-view]' }) });
  const clicked = await clickWhenPresent('panel', '[data-action="read-project"]');
  void clicked;
  const guide = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-guide-state="done"]' })) > 0 ? true : null), 20000, 150);
  check('community.guide-reads-project-files', Boolean(guide) && (await d.ev('panel', probes.count, { sel: '[data-file="contributing"] [data-group]' })) >= 3, { groups: await d.ev('panel', probes.count, { sel: '[data-file="contributing"] [data-group]' }), html: ((await d.ev('panel', (a) => document.querySelector('[data-guide-state]')?.outerHTML ?? document.querySelector('[data-view="guide"]')?.innerText ?? null)) ?? '').slice(0, 700) });
  check('community.guide-reports-missing', /لم يُعثر على CODE_OF_CONDUCT/.test((await d.ev('panel', probes.text, { sel: '[data-missing-kind="conduct"]' })) ?? ''), {});
  const apiBefore = ctx.apiRequests().length;
  check('community.discovery-query-visible', /topic:arabic OR topic:rtl/.test((await d.ev('panel', (a) => document.querySelector('#mj-disc-projects-query')?.value ?? null)) ?? ''), {});
  const pagesBefore = await ctx.pageCount();
  await d.ev('panel', probes.page, { sel: '#mj-disc-language', do: 'type', value: 'python' });
  check('community.discovery-opens-nothing', (await ctx.pageCount()) === pagesBefore, { before: pagesBefore, after: await ctx.pageCount() });
  await ctx.shot('panel-community', 'panel', 'community');
  check('community.resources-builtin-listed', (await d.ev('panel', probes.count, { sel: '[data-resource-id]' })) === 12, { items: await d.ev('panel', probes.count, { sel: '[data-resource-id]' }) });
  check('community.no-api-before-click', ctx.apiRequests().length === apiBefore, { before: apiBefore, after: ctx.apiRequests().length });

  if (ctx.permissionAutoGrant) {
    // Firefox: webextOptionalPermissionPrompts=false → المنح بنقر صريح يتم فعلًا.
    await clickWhenPresent('panel', '[data-action="scan-docs"]');
    const found = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-scan-state="found"]' })) > 0 ? true : null), 20000, 150);
    check('community.docs-scan-after-grant-finds-arabic-readme', Boolean(found) && /README\.ar\.md/.test((await d.ev('panel', probes.text, { sel: '[data-scan-state="found"]' })) ?? ''), {});
    await clickWhenPresent('panel', '[data-action="load-counts"]');
    const counts = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-count]' })) >= 3 ? true : null), 20000, 150);
    check('community.label-counts-after-grant', Boolean(counts), { counts: await d.ev('panel', probes.count, { sel: '[data-count]' }) });
    await clickWhenPresent('panel', '[data-action="check-all"]');
    const checked = await waitUntil(async () => ((await d.ev('panel', probes.count, { sel: '[data-check-summary]' })) > 0 ? true : null), 30000, 150);
    check('community.resources-check-after-grant', Boolean(checked) && /تُحقق من 12/.test((await d.ev('panel', probes.text, { sel: '[data-check-summary]' })) ?? ''), { summary: await d.ev('panel', probes.text, { sel: '[data-check-summary]' }) });
    const api = ctx.apiRequests();
    const paths = api.map((r) => `${r.method} ${r.path}`);
    check('network.api-only-for-the-three-explicit-checks', api.length >= 16 && paths.every((p) => /^GET \/(repos\/[^/]+\/[^/?]+(\/contents\/docs)?|search\/issues)(\?|$)/.test(p)), { total: api.length, sample: paths.slice(0, 5) });
  } else {
    // عائلة Chromium: نافذة الصلاحية لا تُقبل آليًا؛ النقر يبدأ الطلب ولا يصدر شيء إلى api.github.com.
    await clickWhenPresent('panel', '[data-action="check-all"]');
    await sleep(800);
    check('community.permission-click-sends-nothing-while-pending', ctx.apiRequests().length === apiBefore, { before: apiBefore, after: ctx.apiRequests().length });
    check('network.no-api-requests-without-grant', ctx.apiRequests().length === 0, { requests: ctx.apiRequests() });
  }
}

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj9-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, checks: [], console: [] };
  const apiRequests = [];
  const other = [];
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === 'api.github.com') apiRequests.push({ method: request.method(), path: url.pathname + url.search });
      else if (url.host !== 'github.com' && url.protocol.startsWith('http')) other.push(request.url());
    });
    await context.route('https://github.com/**', (route) => {
      const [status, type, body] = serveGithub(new URL(route.request().url()).pathname);
      return route.fulfill({ status, contentType: type, body });
    });
    await context.route('https://api.github.com/**', (route) => {
      const url = new URL(route.request().url());
      const [status, body] = serveApi(url.pathname, url.search);
      return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const pages = {};
    const driver = {
      origin: `chrome-extension://${id}`,
      async open(name, url) {
        const page = await context.newPage();
        page.on('console', (m) => (m.type() === 'error' || m.text().includes('[mijhar]')) && result.console.push(`${name}: ${m.type()}: ${m.text()}`));
        pages[name] = page;
        await page.goto(url);
        return page;
      },
      front: (name) => pages[name].bringToFront(),
      ev: (name, fn, arg) => pages[name].evaluate(fn, arg),
      // نقرة حقيقية (موثوقة) تحمل تنشيط المستخدم الذي تشترطه permissions.request.
      realClick: async (name, sel) => {
        await pages[name].click(sel, { timeout: 8000 });
        return true;
      },
    };
    const check = (name, pass, detail) => result.checks.push({ name, pass: Boolean(pass), detail });
    await scenarios(driver, check, {
      apiRequests: () => apiRequests,
      pageCount: async () => context.pages().length,
      permissionAutoGrant: false,
      // اللقطة تُقدّم الصفحة للأمام ثم تعيد الصفحة النشطة السابقة: اللوحة تقرأ التبويب النشط.
      // لقطة اللوحة تؤخذ وهي في تبويب خلفي (تقرأ صفحة GitHub النشطة)، فلا تُقدَّم للأمام؛ وغيرها يُقدَّم ثم يُعاد النشط.
      shot: async (name, page, back) => {
        fs.mkdirSync(path.join(HERE, 'integration-screens'), { recursive: true });
        const hidden = page === 'panel';
        if (!hidden) await pages[page].bringToFront();
        await sleep(200);
        await pages[page].screenshot({ path: path.join(HERE, 'integration-screens', `${key}-${name}.png`), fullPage: false }).catch(() => {});
        if (back && !hidden) {
          await pages[back].bringToFront();
          await sleep(200);
        }
      },
    });
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { apiGithub: apiRequests, other };
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين ----------

const SERVED = new Set(['github.com', 'api.github.com']);

function marionette(socket) {
  let pending = Buffer.alloc(0);
  const waiters = [];
  let id = 0;
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const header = /^(\d+):/.exec(pending.subarray(0, 12).toString('latin1'));
      if (!header) return;
      const start = header[0].length;
      const length = Number(header[1]);
      if (pending.length < start + length) return;
      const body = pending.subarray(start, start + length).toString('utf8');
      pending = pending.subarray(start + length);
      waiters.shift()?.(JSON.parse(body));
    }
  });
  const next = () => new Promise((resolve) => waiters.push(resolve));
  return {
    handshake: next,
    async send(name, params = {}) {
      const message = JSON.stringify([0, ++id, name, params]);
      socket.write(`${Buffer.byteLength(message)}:${message}`);
      const [, , error, result] = await next();
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim());
      return result;
    },
  };
}

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj9-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    log.requests.push({ host, method: req.method, path: url.pathname + url.search });
    if (host === 'api.github.com') {
      const [status, body] = serveApi(url.pathname, url.search);
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
      return;
    }
    const [status, type, body] = serveGithub(url.pathname);
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (!SERVED.has(host)) {
      log.refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(sitePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return { log, caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const prefs = (proxyPort) =>
  [
    ['marionette.port', 0],
    ['extensions.webextOptionalPermissionPrompts', false],
    ['network.proxy.type', 1],
    ['network.proxy.http', '127.0.0.1'],
    ['network.proxy.http_port', proxyPort],
    ['network.proxy.ssl', '127.0.0.1'],
    ['network.proxy.ssl_port', proxyPort],
    ['network.proxy.no_proxies_on', ''],
    ['network.proxy.allow_hijacking_localhost', true],
    ['network.stricttransportsecurity.preloadlist', false],
    ['network.dns.disablePrefetch', true],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj9-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', checks: [], console: [] };
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    result.browserVersion = capabilities.browserVersion;
    const { value: id } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    let context = 'content';
    const setContext = async (value) => {
      if (context === value) return;
      await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chrome = async (script, args = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args })).value;
    };
    await chrome(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const host = await chrome('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const handles = {};
    let current = null;
    const driver = {
      origin: `moz-extension://${host}`,
      async open(name, url) {
        await setContext('content');
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
        current = name;
        await c.send('WebDriver:Navigate', { url });
      },
      async front(name) {
        await setContext('content');
        await c.send('WebDriver:SwitchToWindow', { handle: handles[name], focus: true });
        current = name;
      },
      async realClick(name, sel) {
        if (current !== name) {
          await setContext('content');
          await c.send('WebDriver:SwitchToWindow', { handle: handles[name], focus: false });
          current = name;
        }
        await setContext('content');
        const { value: el } = await c.send('WebDriver:FindElement', { using: 'css selector', value: sel });
        await c.send('WebDriver:ElementClick', { id: el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0] });
        return true;
      },
      async ev(name, fn, arg) {
        // التبديل بلا تركيز: التبويب المحدد (النشط) يبقى كما ضبطه front فتقرؤه اللوحة.
        if (current !== name) {
          await setContext('content');
          await c.send('WebDriver:SwitchToWindow', { handle: handles[name], focus: false });
          current = name;
        }
        await setContext('content');
        const reply = await c.send('WebDriver:ExecuteAsyncScript', {
          script: `const done = arguments[arguments.length - 1]; Promise.resolve((${fn.toString()})(arguments[0])).then((v) => done(v === undefined ? null : v), (e) => done({ thrown: String(e) }))`,
          args: [arg ?? null],
        });
        if (reply.value && typeof reply.value === 'object' && 'thrown' in reply.value) throw new Error(reply.value.thrown);
        return reply.value;
      },
    };
    const check = (name, pass, detail) => result.checks.push({ name, pass: Boolean(pass), detail });
    let pageCount = 0;
    await scenarios(
      {
        ...driver,
        realClick: driver.realClick,
        async open(name, url) {
          pageCount += 1;
          return driver.open(name, url);
        },
      },
      check,
      {
        apiRequests: () => servers.log.requests.filter((r) => r.host === 'api.github.com'),
        pageCount: async () => pageCount,
        permissionAutoGrant: true,
        shot: async () => {},
        },
    );
    result.console = await chrome(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension/i.test(t));`);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = {
      apiGithub: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      other: [],
      githubPages: servers.log.requests.filter((r) => r.host === 'github.com').length,
      refusedHosts: [...new Set(servers.log.refused)],
    };
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const keys = process.argv.slice(2).filter((a) => BROWSERS[a]);
const results = {};
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  results[key] = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const r = results[key];
  const failed = r.checks.filter((c) => !c.pass);
  console.log(
    `${r.label} ${r.browserVersion ?? ''}: ${r.error ? `خطأ: ${r.error.split('\n')[0]}` : ''} فحوص ${r.checks.length - failed.length}/${r.checks.length}` +
      ` · api.github.com ${r.network?.apiGithub?.length} · مضيفات أخرى ${r.network?.other?.length ?? 0} · أخطاء الإضافة ${r.extensionErrors ? r.extensionErrors.runtime.length + r.extensionErrors.manifest.length : '—'} · رسائل مجمّعة ${r.console?.length}`,
  );
  for (const f of failed) console.log(`   ✗ ${f.name} ${JSON.stringify(f.detail)}`);
}
fs.mkdirSync(HERE, { recursive: true });
fs.writeFileSync(path.join(HERE, 'integration.json'), `${JSON.stringify(results, null, 2)}\n`);
