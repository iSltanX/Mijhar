// TEST-NOTE-02: البحث الفوري والتصفية بالنوع والمستودع والمستوى والوسم والحالة والتاريخ، والفرز، على مجموعة PB-04 (500 عنصر)؛
// وقياس PB-04 للاستعلام نفسه (تصفية وفرز) < 15ms بالوسيط والمئين 90. يُكتب القياس في evidence/T-8.2/ حين يُطلب (MIJHAR_EVIDENCE=1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildIndex, centerFacets, normalizeForSearch, presetFrom, queryCenter } from '../../../../src/modules/g/bookmarks';
import type { CenterQuery } from '../../../../src/modules/g/bookmarks';
import { notesSet } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const set = notesSet();
const index = buildIndex(set.notes, set.bookmarks);

describe('البحث (TEST-NOTE-02)', () => {
  it('الفهرس يضم العناصر الخمسمئة بنوعيها', () => {
    expect(index).toHaveLength(500);
    expect(index.filter((e) => e.kind === 'note')).toHaveLength(250);
  });

  it('كل كلمات البحث يجب أن ترد، بأي ترتيب، في النص أو العنوان أو الوسوم أو المستودع أو الملاحظة السريعة', () => {
    const results = queryCenter(index, { text: 'cache الأداء' });
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) expect(entry.haystack.includes('cache') && entry.haystack.includes('الاداء')).toBe(true);
    const brute = index.filter((e) => e.haystack.includes('cache') && e.haystack.includes('الاداء'));
    expect(results.map((e) => e.id).sort()).toEqual(brute.map((e) => e.id).sort());
  });

  it('التطبيع: حالة الأحرف والتشكيل وصور الألف لا تمنع المطابقة', () => {
    expect(normalizeForSearch('الأداءُ  Cache')).toBe('الاداء cache');
    expect(queryCenter(index, { text: 'الإصلاح' }).length).toBe(queryCenter(index, { text: 'الاصلاح' }).length);
    expect(queryCenter(index, { text: 'CACHE' }).length).toBe(queryCenter(index, { text: 'cache' }).length);
  });

  it('بحث لا يطابق شيئًا يعيد قائمة فارغة، والبحث الفارغ يعيد الكل', () => {
    expect(queryCenter(index, { text: 'لا-شيء-هنا-قطعًا' })).toEqual([]);
    expect(queryCenter(index, { text: '   ' })).toHaveLength(500);
  });
});

describe('التصفية (TEST-NOTE-02)', () => {
  it('بالنوع والمستودع (بلا حساسية لحالة الأحرف) والمستوى', () => {
    const notes = queryCenter(index, { kind: 'note' });
    expect(notes.every((e) => e.kind === 'note')).toBe(true);
    const repo = queryCenter(index, { repo: 'EXPRESSJS/express' });
    expect(repo.length).toBeGreaterThan(0);
    expect(repo.every((e) => e.repoKey === 'expressjs/express')).toBe(true);
    const lines = queryCenter(index, { level: 'line', kind: 'bookmark' });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((e) => e.level === 'line' && e.kind === 'bookmark')).toBe(true);
  });

  it('بالوسم والحالة (للروابط وحدها؛ الملاحظات بلا وسم ولا حالة)', () => {
    const tagged = queryCenter(index, { tag: 'أداء' });
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((e) => e.kind === 'bookmark' && e.tags.includes('أداء'))).toBe(true);
    const awaiting = queryCenter(index, { status: 'awaiting' });
    expect(awaiting.every((e) => e.bookmark?.status === 'awaiting')).toBe(true);
    expect(awaiting.length).toBe(set.bookmarks.filter((b) => b.status === 'awaiting').length);
  });

  it('بالتاريخ: حدّان شاملان بصيغة yyyy-mm-dd، وفترة من الآن', () => {
    const range = queryCenter(index, { from: '2025-06-01', to: '2025-06-30' });
    expect(range.length).toBeGreaterThan(0);
    expect(range.every((e) => e.date >= '2025-06-01T00:00:00.000Z' && e.date <= '2025-06-30T23:59:59.999Z')).toBe(true);
    const now = new Date('2026-10-23T12:00:00Z');
    expect(presetFrom('all', now)).toBeNull();
    expect(presetFrom('week', now)).toBe('2026-10-16T12:00:00.000Z');
    const lastYear = queryCenter(index, { from: presetFrom('year', now) });
    expect(lastYear.every((e) => e.date >= '2025-10-23T12:00:00.000Z')).toBe(true);
  });

  it('المعايير مجتمعة تتقاطع', () => {
    const q: CenterQuery = { text: 'test', kind: 'bookmark', status: 'done', repo: 'octo/demo' };
    for (const e of queryCenter(index, q)) {
      expect(e.kind).toBe('bookmark');
      expect(e.status).toBe('done');
      expect(e.repoKey).toBe('octo/demo');
      expect(e.haystack).toContain('test');
    }
  });

  it('قيم التصفية المتاحة بعددها من الفهرس', () => {
    const facets = centerFacets(index);
    expect(facets.repos.reduce((n, r) => n + r.count, 0)).toBe(500);
    expect(facets.tags.length).toBeGreaterThan(0);
    for (const t of facets.tags) expect(queryCenter(index, { tag: t.tag })).toHaveLength(t.count);
  });
});

describe('الفرز (TEST-NOTE-02)', () => {
  it('الأحدث والأقدم حفظًا وآخر تعديل والمستودع والحالة', () => {
    const newest = queryCenter(index, { sort: 'newest' });
    for (let i = 1; i < newest.length; i += 1) expect(newest[i - 1]!.date >= newest[i]!.date).toBe(true);
    const oldest = queryCenter(index, { sort: 'oldest' });
    for (let i = 1; i < oldest.length; i += 1) expect(oldest[i - 1]!.date <= oldest[i]!.date).toBe(true);
    const updated = queryCenter(index, { sort: 'updated' });
    for (let i = 1; i < updated.length; i += 1) expect(updated[i - 1]!.updatedAt >= updated[i]!.updatedAt).toBe(true);
    const byRepo = queryCenter(index, { sort: 'repo' }).map((e) => e.repoKey as string);
    expect(byRepo.every(Boolean)).toBe(true);
    expect([...byRepo]).toEqual([...byRepo].sort((a, b) => a.localeCompare(b)));
    const withPage = buildIndex([], [{ ...set.bookmarks[0]!, id: 'page', owner: null, repo: null, level: 'page' }, set.bookmarks[1]!]);
    expect(queryCenter(withPage, { sort: 'repo' }).map((e) => e.id)).toEqual([set.bookmarks[1]!.id, 'page']);
    const byStatus = queryCenter(index, { kind: 'bookmark', sort: 'status' }).map((e) => e.status);
    const order = ['reading', 'review', 'awaiting', 'done'];
    for (let i = 1; i < byStatus.length; i += 1) expect(order.indexOf(byStatus[i - 1]!) <= order.indexOf(byStatus[i]!)).toBe(true);
  });
});

describe('PB-04: البحث والتصفية < 15ms على 500 عنصر', () => {
  it('الاستعلامات النموذجية بالوسيط والأقصى بعد التسخين', () => {
    const queries: CenterQuery[] = [
      { text: 'ا' },
      { text: 'cache' },
      { text: 'الاداء مراجعة' },
      { text: 'refactor router timeout' },
      { repo: 'nodejs/node', sort: 'oldest' },
      { kind: 'bookmark', tag: 'أداء', status: 'review' },
      { level: 'line', from: '2025-03-01', to: '2026-01-01', sort: 'repo' },
      { text: 'test', kind: 'note', sort: 'updated' },
    ];
    for (const q of queries) queryCenter(index, q);
    const timings: Array<{ query: CenterQuery; medianMs: number; p90Ms: number; maxMs: number; results: number }> = [];
    for (const q of queries) {
      const runs: number[] = [];
      let results = 0;
      for (let i = 0; i < 30; i += 1) {
        const t0 = performance.now();
        results = queryCenter(index, q).length;
        runs.push(performance.now() - t0);
      }
      runs.sort((a, b) => a - b);
      timings.push({ query: q, medianMs: Number(runs[15]!.toFixed(3)), p90Ms: Number(runs[26]!.toFixed(3)), maxMs: Number(runs[29]!.toFixed(3)), results });
    }
    // بناء الفهرس يجري عند تغيّر البيانات لا عند كل حرف؛ ويُقاس منفصلًا.
    const b0 = performance.now();
    buildIndex(set.notes, set.bookmarks);
    const buildMs = Number((performance.now() - b0).toFixed(3));
    if (process.env.MIJHAR_EVIDENCE === '1') {
      fs.mkdirSync(path.join(ROOT, 'evidence/T-8.2'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'evidence/T-8.2/pb04-timing.json'), JSON.stringify({ budget: 'PB-04 < 15ms', items: index.length, node: process.version, buildIndexMs: buildMs, timings }, null, 2) + '\n');
    }
    // الوسيط والمئين 90 لكل استعلام؛ والأقصى يُسجَّل ولا يُفحص: تكرار منفرد يتأثر بجمع الذاكرة وتزاحم عمّال الاختبار المتوازية.
    for (const t of timings) {
      expect(t.medianMs).toBeLessThan(15);
      expect(t.p90Ms).toBeLessThan(15);
    }
  });
});
