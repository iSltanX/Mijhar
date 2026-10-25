// AD-40: تاريخ سريان الخصوصية من مصدر واحد — سطر «تاريخ السريان» في Docs/Site/privacy.md — يُثبَّت يوم النشر بتوقيت السعودية
// (scripts/privacy-effective.mjs، والدوالّ في scripts/privacy-date.mjs)، ومنه يُكتب في PRIVACY.md وتولّد صفحة الموقع سطرها. ولا عبارة مؤقتة تُكتب مكانه قبل تثبيته.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_PLACEHOLDER,
  effectiveDateOf,
  formatArabicDate,
  isValidISODate,
  riyadhDate,
  setEffectiveDate,
} from '../../scripts/privacy-date.mjs';
import { generate as privacy } from '../../scripts/privacy.mjs';
import { ROOT } from '../setup/paths';

const source = fs.readFileSync(path.join(ROOT, 'Docs/Site/privacy.md'), 'utf8');

describe('تاريخ سريان الخصوصية', () => {
  it('المصدر يحمل سطر «تاريخ السريان»: تاريخًا صالحًا أو العلامة حتى يوم النشر', () => {
    const value = effectiveDateOf(source);
    expect(value === null || isValidISODate(value)).toBe(true);
    if (value === null) expect(source).toContain(`- **تاريخ السريان:** ${EFFECTIVE_PLACEHOLDER}`);
  });

  it('اليوم بتوقيت السعودية (UTC+3) لا بتوقيت الجهاز', () => {
    expect(riyadhDate(new Date('2026-11-01T20:59:59Z'))).toBe('2026-11-01');
    expect(riyadhDate(new Date('2026-11-01T21:00:00Z'))).toBe('2026-11-02');
    expect(riyadhDate(new Date('2026-12-31T21:30:00Z'))).toBe('2027-01-01');
  });

  it('يرفض تاريخًا غير صالح ولا يمس المصدر', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '02-11-2026', '2026/11/02', '']) {
      expect(isValidISODate(bad), bad).toBe(false);
      expect(() => setEffectiveDate(source, bad), bad).toThrow();
    }
    expect(() => effectiveDateOf(source.replace(/- \*\*تاريخ السريان:\*\* .+/, '- **تاريخ السريان:** قريبًا'))).toThrow();
  });

  it('التثبيت يستبدل السطر وحده، ويكتب PRIVACY.md «تسري من …» بالصيغة العربية', () => {
    const set = setEffectiveDate(source, '2026-11-02');
    expect(effectiveDateOf(set)).toBe('2026-11-02');
    expect(set.split('\n').length).toBe(source.split('\n').length);
    expect(setEffectiveDate(set, '2026-11-03')).toContain('- **تاريخ السريان:** 2026-11-03');
    expect(formatArabicDate('2026-11-02')).toBe('2 نوفمبر 2026');
    const text = privacy(set);
    expect(text).toContain('تسري من 2 نوفمبر 2026.');
    expect(text).not.toMatch(/⟨/);
  });

  it('قبل التثبيت لا يكتب PRIVACY.md سطر سريان ولا عبارة مؤقتة', () => {
    const text = privacy(source.replace(/- \*\*تاريخ السريان:\*\* .+/, `- **تاريخ السريان:** ${EFFECTIVE_PLACEHOLDER}`));
    expect(text).not.toContain('تسري من');
    expect(text).not.toMatch(/⟨|تاريخ النشر/);
  });
});
