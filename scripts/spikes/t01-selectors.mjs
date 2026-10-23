#!/usr/bin/env node
// تجربة T-0.1 (MJ4): مصفوفة المحددات (AC-S1.1) وسلوك الاتجاه الحالي (HYP-15) على العينات المحفوظة في fixtures/spikes،
// في المتصفحات الأربعة. لكل محدد: عدد المطابقات وهل فيها نص عربي؛ ولكل عنصر نصي كتلي في المحتوى: سمة dir
// والاتجاه المحسوب ونسبة العربية بعد استبعاد code وa والإشارات، لمعرفة أين يصيب سلوك GitHub وأين يخطئ.
// الاستعمال: node scripts/spikes/t01-selectors.mjs [chrome edge brave firefox] --out evidence/T-0.1/raw/selectors.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, serveDir, sleep, writeJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

// المحددات الأولية في الخطة (3.أ) ومرشحات رُصدت في العينات.
const SELECTORS = [
  { id: 'markdown-body', css: '.markdown-body', from: 'الخطة' },
  { id: 'issue-title-classic', css: '.gh-header-title .js-issue-title', from: 'الخطة' },
  { id: 'issue-title-testid', css: '[data-testid="issue-title"]', from: 'الخطة' },
  { id: 'commit-title', css: '.commit-title', from: 'الخطة' },
  { id: 'commit-desc', css: '.commit-desc', from: 'الخطة' },
  { id: 'repo-desc-f4', css: '.f4.my-3', from: 'الخطة' },
  { id: 'markdown-title', css: '.markdown-title', from: 'مرشح' },
  { id: 'bdi', css: 'bdi', from: 'مرشح' },
  { id: 'comment-body-testid', css: '[data-testid="markdown-body"]', from: 'مرشح' },
  { id: 'issue-body-testid', css: '[data-testid="issue-body"] .markdown-body, [data-testid="issue-body-viewer"]', from: 'مرشح' },
  { id: 'pr-title-header', css: '.gh-header-title .markdown-title', from: 'مرشح' },
  { id: 'commit-row-item', css: '[data-testid="commit-row-item"] h4', from: 'مرشح' },
  { id: 'commit-message-container', css: '[class*="commitMessageContainer"]', from: 'مرشح (فئة CSS مُجزَّأة)' },
  { id: 'latest-commit', css: '[data-testid="latest-commit-html"]', from: 'مرشح' },
  { id: 'repo-description-module', css: '[class*="description__"]', from: 'مرشح (فئة CSS مُجزَّأة)' },
  { id: 'comment-body-classic', css: '.comment-body.markdown-body', from: 'مرشح' },
  { id: 'textarea', css: 'textarea', from: 'حقول التحرير' },
  { id: 'contenteditable', css: '[contenteditable="true"]', from: 'حقول التحرير' },
];

function survey(selectors) {
  const AR = /[؀-ۿ]/g;
  const LATIN = /[A-Za-z]/g;
  const arabicOf = (el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('code, pre, a, .user-mention, kbd, samp').forEach((e) => e.remove());
    const text = clone.textContent;
    const ar = (text.match(AR) ?? []).length;
    const la = (text.match(LATIN) ?? []).length;
    return { ar, la, ratio: ar + la ? ar / (ar + la) : 0, words: (text.match(/[؀-ۿ]+/g) ?? []).length };
  };
  const firstStrong = (text) => {
    for (const ch of text) {
      if (/[֐-ࣿ]/.test(ch)) return 'rtl';
      if (/[A-Za-zÀ-ɏ]/.test(ch)) return 'ltr';
    }
    return null;
  };
  const sel = selectors.map((s) => {
    let nodes = [];
    try { nodes = [...document.querySelectorAll(s.css)]; } catch (e) { return { id: s.id, error: String(e) }; }
    const withArabic = nodes.filter((n) => /[؀-ۿ]/.test(n.textContent));
    return { id: s.id, count: nodes.length, withArabic: withArabic.length, sample: (withArabic[0] ?? nodes[0])?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) ?? null };
  });
  // العنوان: العنصر الذي نصه يساوي بداية عنوان الصفحة.
  const titleText = document.title.split(' · ')[0].replace(/ by [^ ]+$/, '').replace(/^GitHub - [^:]+: /, '').trim();
  const titleEl = [...document.querySelectorAll('h1, h1 *, bdi, span, a, p')].find((e) => e.children.length <= 2 && e.textContent.trim() === titleText);
  const describe = (e) => e && { tag: e.tagName.toLowerCase(), classes: [...e.classList].join(' '), testid: e.closest('[data-testid]')?.getAttribute('data-testid') ?? null, dir: e.getAttribute('dir'), computed: getComputedStyle(e).direction, parentTag: e.parentElement?.tagName.toLowerCase() };
  // الكتل النصية في المحتوى.
  const blocks = [...document.querySelectorAll('.markdown-body :is(p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote > p), .markdown-title, [data-testid="issue-title"], .commit-title, [data-testid="commit-row-item"] h4, [class*="commitMessageContainer"] > span, [data-testid="latest-commit-html"], p[class*="description__"]')]
    .filter((e) => !e.closest('pre, code') && e.textContent.trim().length > 2);
  const rows = blocks.map((e) => {
    const a = arabicOf(e);
    const computed = getComputedStyle(e).direction;
    const majority = a.ratio >= 0.3 || a.words >= 3 ? 'ar' : a.ar === 0 ? 'latin' : 'mixed-low';
    const fs = firstStrong(e.textContent);
    return { tag: e.tagName.toLowerCase(), dir: e.getAttribute('dir'), dirParent: e.closest('[dir]')?.getAttribute('dir') ?? null, computed, majority, firstStrong: fs, ratio: Math.round(a.ratio * 100), text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) };
  });
  const tally = {};
  for (const r of rows) {
    const k = `${r.tag}|dir=${r.dir ?? '∅'}|${r.majority}|${r.computed}`;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  const problems = rows.filter((r) => (r.majority === 'ar' && r.computed === 'ltr') || (r.majority === 'latin' && r.computed === 'rtl'));
  return { url: location.pathname, docDir: document.documentElement.getAttribute('dir'), selectors: sel, titleText, title: describe(titleEl), blocks: rows.length, tally, problems: problems.slice(0, 25), problemCount: problems.length, arabicBlocks: rows.filter((r) => r.majority === 'ar').length };
}

const samples = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/spikes/samples.json'), 'utf8')).samples;
const server = await serveDir(path.join(ROOT, 'fixtures/spikes'));
const results = [];
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const perBrowser = { browser: b.label, version: b.version, samples: [] };
    try {
      for (const s of samples) {
        await b.open(`${server.url}/${path.basename(s.file)}`);
        await sleep(1500);
        const r = await b.evaluate(survey, SELECTORS);
        perBrowser.samples.push({ name: s.name, kind: s.kind, source: s.url, ...r });
        console.error(`${b.label} ${s.name}: blocks ${r.blocks} ar ${r.arabicBlocks} problems ${r.problemCount} title ${r.title ? r.title.tag + '.' + r.title.classes : '—'}`);
      }
    } finally {
      await b.close();
    }
    results.push(perBrowser);
  }
} finally {
  await server.close();
}
const output = { measuredAt: new Date().toISOString(), selectors: SELECTORS, results };
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));
