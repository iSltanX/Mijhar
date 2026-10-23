// توزيع نتائج إعادة التثبيت على تواريخ ملفات حقيقية (فحوص MJ12): محرك T-8.3 نفسه على مراسي T-0.4 نفسها (كل سطر غير فارغ في كل
// مراجعة قديمة، مقابل التالية والخامسة بعدها ورأس الملف)، فتُقارن أعداده بما سجّله T-0.4 في evidence/T-0.4/raw. تاريخ flask/README.md
// مضمَّن فيجري دائمًا؛ والتواريخ التسعة كلها حين يشير MIJHAR_HISTORIES إلى ملف extract.mjs، ويُكتب الناتج كما هو في
// evidence/T-8.3/ حين MIJHAR_EVIDENCE=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { comparableLines, makeFingerprint, normalizeLine, pageLinesFrom, reanchor } from '../../../../src/modules/g/anchor';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MAX_REVS = 40;
const SALT = 'c'.repeat(64);

interface HistoryFile {
  readonly repo: string;
  readonly path: string;
  readonly head: string;
  readonly table: readonly string[];
  readonly revisions: ReadonlyArray<{ readonly sha: string; readonly lines: readonly number[] | null }>;
}

type Counts = { A: number; B: number; C: number; D: number; D_textUnique: number };
type Gap = '1' | '5' | 'head';

async function measure(file: HistoryFile, mode: 'text' | 'hash', gaps: readonly Gap[] = ['1', '5', 'head']): Promise<Record<string, { pairs: number; counts: Counts }>> {
  const content = file.revisions.map((r) => (r.lines ? r.lines.map((i) => normalizeLine(file.table[i] as string)) : null));
  const out: Record<string, { pairs: number; counts: Counts }> = {};
  for (const gap of gaps) {
    const acc = { pairs: 0, counts: { A: 0, B: 0, C: 0, D: 0, D_textUnique: 0 } };
    for (let i = 1; i < Math.min(content.length, MAX_REVS); i += 1) {
      const newer = gap === 'head' ? 0 : i - Number(gap);
      if (newer < 0 || file.revisions[newer]?.sha === file.revisions[i]?.sha) continue;
      const oldLines = content[i];
      const newLines = content[newer];
      if (!oldLines || !newLines) continue;
      acc.pairs += 1;
      const before = pageLinesFrom(oldLines);
      const after = await comparableLines(pageLinesFrom(newLines), mode, mode === 'hash' ? SALT : undefined);
      for (let n = 1; n <= oldLines.length; n += 1) {
        if ((oldLines[n - 1] as string).trim() === '') continue;
        const fp = await makeFingerprint(before, n, n, mode === 'text' ? 'public' : 'private', mode === 'hash' ? SALT : undefined);
        if (!fp.ok) throw new Error(`لا بصمة: ${fp.reason}`);
        const result = reanchor(after, fp.fingerprint, n);
        if (result.status === 'matched') acc.counts.A += 1;
        else if (result.status === 'shifted') acc.counts.B += 1;
        else if (result.status === 'ambiguous') acc.counts.C += 1;
        else if (result.status === 'changed') {
          acc.counts.D += 1;
          if (result.textOnly !== null) acc.counts.D_textUnique += 1;
        } else throw new Error('نتيجة جزئية على ملف كامل');
      }
    }
    out[gap] = acc;
  }
  return out;
}

function spikeCounts(repo: string, file: string): Record<string, { pairs: number; counts: Counts }> {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, `evidence/T-0.4/raw/reanchor-${repo}.json`), 'utf8')) as { results: Array<{ path: string; gaps: Record<string, { pairs: number; counts: Counts }> }> };
  const found = raw.results.find((r) => r.path === file);
  if (!found) throw new Error(`لا قياس في T-0.4 لـ${repo}/${file}`);
  return Object.fromEntries(Object.entries(found.gaps).map(([g, v]) => [g, { pairs: v.pairs, counts: { A: v.counts.A, B: v.counts.B, C: v.counts.C, D: v.counts.D, D_textUnique: v.counts.D_textUnique } }]));
}

const load = (file: string): HistoryFile[] => (JSON.parse(fs.readFileSync(file, 'utf8')) as { files: HistoryFile[] }).files;

describe('توزيع إعادة التثبيت على تاريخ حقيقي (flask/README.md، مضمَّن)', () => {
  const [flask] = load(path.join(ROOT, 'fixtures/anchor-histories/flask-readme.json'));
  it('محرك T-8.3 يعيد أعداد T-0.4 نفسها (A وB وC وD والنص وحده)', async () => {
    expect(flask?.revisions).toHaveLength(10);
    expect(await measure(flask as HistoryFile, 'text')).toEqual(spikeCounts('flask', 'README.md'));
  });
  it('صيغة الخاص (بصمة مملّحة) تعطي التوزيع نفسه: التجزئة لا تغيّر الحكم', async () => {
    expect(await measure(flask as HistoryFile, 'hash')).toEqual(await measure(flask as HistoryFile, 'text'));
  });
});

const full = process.env.MIJHAR_HISTORIES;
describe.runIf(Boolean(full))('التواريخ التسعة كلها (MIJHAR_HISTORIES)', () => {
  it('أعداد المحرك على كل ملف ومسافة تطابق T-0.4، والتجزئة لا تغيّرها في المراجعة التالية', { timeout: 600_000 }, async () => {
    const files = load(full as string);
    const rows: Array<{ repo: string; path: string; text: Record<string, { pairs: number; counts: Counts }>; hashNext: Counts; spike: Record<string, { pairs: number; counts: Counts }> }> = [];
    for (const file of files) {
      const text = await measure(file, 'text');
      const hash = await measure(file, 'hash', ['1']);
      rows.push({ repo: file.repo, path: file.path, text, hashNext: (hash['1'] as { counts: Counts }).counts, spike: spikeCounts(file.repo, file.path) });
    }
    if (process.env.MIJHAR_EVIDENCE === '1') {
      fs.mkdirSync(path.join(ROOT, 'evidence/T-8.3'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'evidence/T-8.3/reanchor-distribution.json'), JSON.stringify({ engine: 'src/modules/g/anchor (T-8.3)', method: 'مراسي T-0.4 نفسها: كل سطر غير فارغ، سياق ±2، مقابل التالية والخامسة بعدها ورأس الملف', node: process.version, files: rows }, null, 1) + '\n');
    }
    for (const row of rows) {
      expect(row.text, `${row.repo}/${row.path}`).toEqual(row.spike);
      expect(row.hashNext, `${row.repo}/${row.path} (بصمة)`).toEqual((row.text['1'] as { counts: Counts }).counts);
    }
  });
});
