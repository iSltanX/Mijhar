// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/shop/blob/main/src/cart.js"}
// المحرك وحده (TEST-NOTE-03A–03F، وحدة): البصمة بصيغتي DEC-05، وإعادة التثبيت بالنتائج الأربع على أسطر الصفحة، وقراءة الصفحة
// لحالات E وF، والملح المحلي. لا شبكة: الدوال تعمل على DOM وأسطر في الذاكرة.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SelectorsRegistry, Store } from '../../../../src/core';
import {
  ANCHOR_SELECTORS,
  AnchorStore,
  comparableLines,
  isLineAnchor,
  makeFingerprint,
  normalizeLine,
  pageLinesFrom,
  readPageView,
  reanchor,
  saltIdOf,
  visibilityOf,
} from '../../../../src/modules/g/anchor';
import type { Fingerprint, PageLines } from '../../../../src/modules/g/anchor';
import { LINE, LOGIN_HTML, MISSING_IN_REPO_HTML, NOT_FOUND_HTML, V1, V2_SHIFTED, V3_DUPLICATE, V4_CHANGED, V5_DELETED, V6_CONTEXT, codeViewHtml } from './drift';

const SALT = 'a'.repeat(64);

async function match(saved: readonly string[], now: readonly string[], start = LINE, end = start, visibility: 'public' | 'private' = 'public') {
  const fp = await makeFingerprint(pageLinesFrom(saved), start, end, visibility, visibility === 'private' ? SALT : undefined);
  if (!fp.ok) throw new Error(fp.reason);
  const lines = await comparableLines(pageLinesFrom(now), fp.fingerprint.mode, visibility === 'private' ? SALT : undefined);
  return { fingerprint: fp.fingerprint, result: reanchor(lines, fp.fingerprint, start) };
}

describe('إعادة التثبيت بالنتائج الصريحة (AC-G3)', () => {
  for (const visibility of ['public', 'private'] as const) {
    describe(visibility === 'public' ? 'مستودع عام (نص)' : 'مستودع خاص (بصمة مملّحة)', () => {
      it('A مطابق: السطر بنصه وسياقه في موضعه', async () => {
        expect((await match(V1, V1, LINE, LINE, visibility)).result).toEqual({ status: 'matched', start: LINE });
      });
      it('B منزاح بمرشح وحيد: موضع جديد واحد بالنص والسياق، يُعاد مرشحًا لا تطبيقًا', async () => {
        expect((await match(V1, V2_SHIFTED, LINE, LINE, visibility)).result).toEqual({ status: 'shifted', candidate: 55 });
        expect((await match(V1, V2_SHIFTED, LINE, LINE + 4, visibility)).result).toEqual({ status: 'shifted', candidate: 55 });
      });
      it('C ملتبس: النص والسياق في أكثر من موضع، فتُعاد المرشحات كلها', async () => {
        expect((await match(V1, V3_DUPLICATE, LINE, LINE, visibility)).result).toEqual({ status: 'ambiguous', candidates: [43, 56] });
      });
      it('D متغيّر: تعديل السطر أو حذفه، ومرشح «بالنص وحده» حين يبقى السطر في موضع واحد بسياق آخر', async () => {
        expect((await match(V1, V4_CHANGED, LINE, LINE, visibility)).result).toEqual({ status: 'changed', textOnly: null });
        expect((await match(V1, V5_DELETED, LINE, LINE, visibility)).result).toEqual({ status: 'changed', textOnly: null });
        expect((await match(V1, V6_CONTEXT, LINE, LINE, visibility)).result).toEqual({ status: 'changed', textOnly: 55 });
      });
    });
  }

  it('صفحة لم تُظهر الملف كله: A وحده يُحكم به، وغيره «جزئي» لا موضع جديد', async () => {
    const fp = await makeFingerprint(pageLinesFrom(V1), LINE, LINE, 'public');
    if (!fp.ok) throw new Error();
    const partial: PageLines = { lines: new Map([...pageLinesFrom(V2_SHIFTED).lines].filter(([n]) => n >= 30)), max: V2_SHIFTED.length, complete: false };
    expect(reanchor(partial, fp.fingerprint, LINE)).toEqual({ status: 'partial' });
    const window: PageLines = { lines: new Map([...pageLinesFrom(V1).lines].filter(([n]) => n >= 30)), max: V1.length, complete: false };
    expect(reanchor(window, fp.fingerprint, LINE)).toEqual({ status: 'matched', start: LINE });
  });

  it('السطر الأول والأخير: السياق خارج الملف «لا سطر» ويُطابق كذلك', async () => {
    expect((await match(V1, V1, 1)).result).toEqual({ status: 'matched', start: 1 });
    expect((await match(V1, ['// جديد', ...V1], V1.length)).result).toEqual({ status: 'shifted', candidate: V1.length + 1 });
  });
});

describe('صيغة الحفظ بحسب DEC-05 (ز-1)', () => {
  it('العام يحفظ النص المطبَّع للنطاق وسياقه ±2', async () => {
    const { fingerprint } = await match(V1, V1);
    expect(fingerprint).toEqual({ mode: 'text', block: ['function calculateTotal(items) {'], before: ['const limit33 = 231; // limit 33', 'const limit34 = 238; // limit 34'], after: ['  let sum = 0;', '  for (const item of items) sum += item.price * item.qty;'] });
  });

  it('الخاص لا يحفظ نص أي سطر: بصمات SHA-256 بالملح وsaltId فقط', async () => {
    const { fingerprint } = await match(V1, V1, LINE, LINE + 1, 'private');
    expect(fingerprint.mode).toBe('hash');
    const stored = JSON.stringify(fingerprint);
    for (const line of V1.slice(LINE - 3, LINE + 3)) if (line.trim()) expect(stored).not.toContain(line.trim());
    expect(fingerprint.block.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    expect((fingerprint as Extract<Fingerprint, { mode: 'hash' }>).saltId).toBe(await saltIdOf(SALT));
  });

  it('ملح مختلف لا يطابق: بصمة صُنعت بملح آخر لا تُقرأ «مطابقة» ولا «منزاحة»', async () => {
    const fp = await makeFingerprint(pageLinesFrom(V1), LINE, LINE, 'private', SALT);
    if (!fp.ok) throw new Error();
    const other = await comparableLines(pageLinesFrom(V1), 'hash', 'b'.repeat(64));
    expect(reanchor(other, fp.fingerprint, LINE).status).toBe('changed');
  });

  it('التطبيع: \\r والمسافات الختامية فقط، والإزاحة البادئة جزء من السطر', () => {
    expect(normalizeLine('  x = 1;   \r')).toBe('  x = 1;');
  });

  it('لا بصمة لنطاق أطول من 40 سطرًا ولا لأسطر غير ظاهرة', async () => {
    expect(await makeFingerprint(pageLinesFrom(V1), 1, 41, 'public')).toEqual({ ok: false, reason: 'range-too-long' });
    expect(await makeFingerprint(pageLinesFrom(V1), V1.length + 1, V1.length + 1, 'public')).toEqual({ ok: false, reason: 'lines-missing' });
  });
});

describe('قراءة الصفحة (E وF من DOM وحده)', () => {
  const selectors = (): SelectorsRegistry => {
    const registry = new SelectorsRegistry();
    for (const entry of ANCHOR_SELECTORS) registry.define(entry);
    return registry;
  };
  const doc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

  it('أسطر الكود كاملة من LC<n> (ومعرّفات LC<n>-container لا تُعدّ أسطرًا)', () => {
    const view = readPageView(doc(codeViewHtml(V1)), selectors());
    expect(view.state).toBe('code');
    if (view.state !== 'code') return;
    expect(view.lines.max).toBe(V1.length);
    expect(view.lines.complete).toBe(true);
    expect(view.lines.lines.get(LINE)).toBe('function calculateTotal(items) {');
  });

  it('العموم من meta repository_public = true وحدها؛ غيابها أو false خاص', () => {
    expect(visibilityOf(doc(codeViewHtml(V1)))).toBe('public');
    expect(visibilityOf(doc(codeViewHtml(V1, { visibility: 'private' })))).toBe('private');
    expect(visibilityOf(doc('<html><head></head><body></body></html>'))).toBe('private');
  });

  it('عرض بلا أسطر، والملف غائب من مستودع ظاهر، وصفحة «غير موجود»، وصفحة الدخول، وما لم يكتمل', () => {
    expect(readPageView(doc(codeViewHtml(V1, { rendered: true })), selectors()).state).toBe('rendered');
    expect(readPageView(doc(MISSING_IN_REPO_HTML), selectors()).state).toBe('missing');
    expect(readPageView(doc(NOT_FOUND_HTML), selectors()).state).toBe('not-found');
    expect(readPageView(doc(LOGIN_HTML), selectors()).state).toBe('login');
    expect(readPageView(doc('<html><head><meta name="octolytics-dimension-repository_nwo" content="octo/shop"></head><body><main>…</main></body></html>'), selectors()).state).toBe('unknown');
  });
});

describe('مخزن المراسي والملح', () => {
  it('الملح يُنشأ مرة ويبقى، والمرساة تُحفظ وتُزال وتُنظَّف بلا ملاحظتها', async () => {
    const area = new MemoryStorageArea();
    const store = await Store.open({ area, changes: area, locks: null });
    const anchors = await AnchorStore.open(store);
    expect(await anchors.salt()).toBeNull();
    const salt = await anchors.ensureSalt();
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
    expect(await anchors.ensureSalt()).toBe(salt);
    const fp = await makeFingerprint(pageLinesFrom(V1), LINE, LINE, 'public');
    if (!fp.ok) throw new Error();
    const anchor = { noteId: 'n1', version: 1, owner: 'octo', repo: 'shop', path: 'src/cart.js', ref: 'main', refKind: 'ref', commit: null, start: LINE, end: LINE, visibility: 'public', fingerprint: fp.fingerprint, missing: null, capturedAt: '2026-10-23T00:00:00.000Z' } as const;
    expect(isLineAnchor(anchor)).toBe(true);
    await anchors.save(anchor);
    const other = await AnchorStore.open(store);
    expect(other.get('n1')).toEqual(anchor);
    // سجل ملاحظة غير صالح للمخطط الحالي (نسخة أحدث) يُبقي مرساته؛ وغياب السجل يزيلها.
    await store.write('notes.n1', { id: 'n1', version: 99 });
    expect(await anchors.pruneOrphans()).toBe(0);
    expect(anchors.get('n1')).toBeDefined();
    await store.remove('notes.n1');
    expect(await anchors.pruneOrphans()).toBe(1);
    expect(anchors.get('n1')).toBeUndefined();
  });
});
