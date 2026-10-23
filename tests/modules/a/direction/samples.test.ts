// مراجعة عتبة الكشف بنتائج T-0.1 (AC-A1 بند أ: «تُراجع بنتائج T-0.1») على عينات T-0.1 الثماني نفسها، ومعالجة كل عينة كاملة:
// قاعدة الخطة الأولية (30% أو ثلاث كلمات) وبدائل تقرير T-0.1 والقاعدة المعتمدة (decide.ts)، وما تكتبه كل منها حيث يعرض GitHub ltr.
// تُكتب النتائج في evidence/T-2.1/threshold.json حين MJ6_EVIDENCE=1 فقط.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIRECTION_OPTIONS, DIR_ATTR, decide, measureBlock, measureContainer, resolveNative } from '../../../../src/modules/a/direction';
import type { BlockMeasure, NativeDirection } from '../../../../src/modules/a/direction';
import { ROOT } from '../../../setup/paths';
import { SPIKE_PAGES, loadSpike, runProcessor } from './helpers';

// مجموعة الكتل نفسها التي قاسها تقرير T-0.1 (scripts/spikes/t01-selectors.mjs).
const T01_BLOCKS = '.markdown-body :is(p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote > p), .markdown-title, [data-testid="issue-title"], .commit-title, [data-testid="commit-row-item"] h4, [class*="commitMessageContainer"] > span, [data-testid="latest-commit-html"], p[class*="description__"]';

interface Row {
  readonly sample: string;
  readonly tag: string;
  readonly text: string;
  readonly m: BlockMeasure;
  readonly native: NativeDirection;
  readonly containerRatio: number | null;
}

type Rule = (row: Row) => boolean;
const mixed = (r: Row): boolean => (r.m.ratio >= 0.3 && r.m.ratio < 0.6) || (r.m.ratio < 0.3 && r.m.arabicRun >= 3);
const RULES: Record<string, { readonly label: string; readonly arabic: Rule }> = {
  plan: { label: 'الخطة الأولية: 30% أو ثلاث كلمات عربية متصلة', arabic: (r) => r.m.ratio >= 0.3 || r.m.arabicRun >= 3 },
  t01Raise: { label: 'اقتراح T-0.1 الأول: رفع العتبة إلى 60%', arabic: (r) => r.m.ratio >= 0.6 },
  t01Sentence: { label: 'اقتراح T-0.1 الثاني: 60%، أو مختلطة لا تبدأ بجملة لاتينية (أقل من 3 كلمات)', arabic: (r) => r.m.ratio >= 0.6 || (mixed(r) && r.m.latinLead < 3) },
  adopted: {
    label: 'المعتمدة: 60%، أو مختلطة في حاوية عربية (≥ 50%)، أو مختلطة مستقلة لا تبدأ بجملة لاتينية',
    arabic: (r) => decide(r.m, { native: { direction: 'ltr', source: 'default' }, containerRatio: r.containerRatio }) === 'flip',
  },
};

function collect(): Row[] {
  const rows: Row[] = [];
  for (const [sample, file, url] of SPIKE_PAGES) {
    const doc = loadSpike(file, url).window.document;
    for (const el of new Set(doc.querySelectorAll(T01_BLOCKS))) {
      const m = measureBlock(el);
      if (!m.letters) continue;
      const container = el.closest('.markdown-body');
      rows.push({ sample, tag: el.localName, text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), m, native: resolveNative(el), containerRatio: container ? measureContainer(container).ratio : null });
    }
  }
  return rows;
}

const writes = (row: Row): boolean => row.native.direction === 'ltr' && row.native.source !== 'explicit';
const round = (value: number): number => Math.round(value * 100) / 100;

describe('مراجعة العتبة على عينات T-0.1 الثماني', () => {
  const rows = collect();

  it('القاعدة المعتمدة: لا تكتب على كتلة بلا حرف عربي، وتكتب كل كتلة عربية بوضوح يعرضها GitHub ltr، وتُبقي الثنائية التي تبدأ بجملة إنجليزية في سياق إنجليزي', () => {
    const adopted = RULES.adopted as (typeof RULES)[string];
    expect(rows.filter((r) => writes(r) && adopted.arabic(r) && r.m.arabic === 0)).toEqual([]);
    for (const r of rows) if (writes(r) && r.m.ratio >= DEFAULT_DIRECTION_OPTIONS.strong) expect(adopted.arabic(r)).toBe(true);
    const englishLead = rows.filter((r) => r.m.arabic > 0 && /^(Deep learning for AR text|Largest list of Arabic stop words|Shakkala Project)/.test(r.text));
    expect(englishLead.length).toBe(5);
    for (const r of englishLead) {
      expect((RULES.plan as (typeof RULES)[string]).arabic(r)).toBe(true); // الخطة الأولية كانت تقلبها
      expect(adopted.arabic(r)).toBe(false);
    }
  });

  it('مقارنة القواعد تُكتب دليلًا', () => {
    const comparison = Object.fromEntries(
      Object.entries(RULES).map(([id, rule]) => {
        const arabic = rows.filter(rule.arabic);
        return [id, { label: rule.label, arabicBlocks: arabic.length, writesWhereGithubLtr: arabic.filter(writes).length, writesOnBlocksWithoutArabic: arabic.filter((r) => writes(r) && r.m.arabic === 0).length }];
      }),
    );
    const mixedRows = rows
      .filter((r) => mixed(r) || (r.m.ratio >= 0.6 && r.m.latinLead >= 3))
      .map((r) => ({
        sample: r.sample,
        tag: r.tag,
        text: r.text,
        ratio: round(r.m.ratio),
        latinLead: r.m.latinLead,
        containerRatio: r.containerRatio === null ? null : round(r.containerRatio),
        native: r.native.direction,
        ...Object.fromEntries(Object.entries(RULES).map(([id, rule]) => [id, writes(r) && rule.arabic(r) ? 'rtl' : 'يبقى'])),
      }));
    expect(Object.keys(comparison)).toHaveLength(4);
    if (process.env.MJ6_EVIDENCE === '1') {
      const file = path.join(ROOT, 'evidence/T-2.1/threshold.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ blocksWithLetters: rows.length, options: DEFAULT_DIRECTION_OPTIONS, comparison, mixedBlocks: mixedRows }, null, 2)}\n`);
    }
  });
});

describe('المعالج كاملًا على كل عينة حقيقية', () => {
  const perSample: Record<string, unknown> = {};

  it.each(SPIKE_PAGES)('%s: لا يقلب كتلة بلا حرف عربي ولا خارج الحاويات والكتل المستقلة، والاستعادة تعيد المستند حرفيًا', (sample, file, url) => {
    const doc = loadSpike(file, url).window.document;
    const before = doc.documentElement.outerHTML;
    const { stats, recorder } = runProcessor(doc);
    const flipped = [...doc.querySelectorAll(`[${DIR_ATTR}]`)];
    for (const el of flipped) {
      if (el.localName === 'ul' || el.localName === 'ol') continue;
      expect(measureBlock(el).arabic).toBeGreaterThan(0);
    }
    expect(doc.querySelector(`[aria-labelledby="folders-and-files"] [${DIR_ATTR}]`)).toBeNull();
    perSample[sample] = { flipped: stats.flipped, lists: stats.lists, scanned: stats.scanned, verdicts: stats.verdicts };
    const report = recorder.restore();
    expect(report.skipped).toEqual([]);
    expect(doc.documentElement.outerHTML).toBe(before);
    if (process.env.MJ6_EVIDENCE === '1' && Object.keys(perSample).length === SPIKE_PAGES.length) {
      const file = path.join(ROOT, 'evidence/T-2.1/samples.json');
      fs.writeFileSync(file, `${JSON.stringify(perSample, null, 2)}\n`);
    }
  });
});
