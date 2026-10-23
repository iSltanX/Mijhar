// بديل «نسخ النص المقنَّع» (AC-C4): ما يُنسخ رموز العناصر المحمية لا قيمها، بفهارس فريدة في النص كله، ونتيجة النسخ تُعلَن.
import { describe, expect, it } from 'vitest';
import { copyMaskedText, maskedCopyText } from '../../../../src/modules/c/engines';

describe('maskedCopyText', () => {
  it('يقنّع الفقرات في تمريرة واحدة بفهارس فريدة، والعناصر المحمية لا تظهر قيمها', () => {
    const copy = maskedCopyText([
      ['Run ', { type: 'CODE', value: 'npm install' }, ' first.'],
      ['Then edit src/config/settings.json and ping @octocat.'],
      [{ type: 'LINK', value: 'the guide' }, ' explains it.'],
    ]);
    expect(copy.paragraphs).toBe(3);
    expect(copy.text.split('\n\n')).toHaveLength(3);
    expect(copy.text).not.toContain('npm install');
    expect(copy.text).not.toContain('src/config/settings.json');
    expect(copy.text).not.toContain('@octocat');
    expect(copy.text).not.toContain('the guide');
    const tokens = copy.text.match(/⟦[A-Z]+_\d+⟧/g) ?? [];
    expect(tokens.length).toBe(copy.tokens);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(copy.text.startsWith('Run ⟦CODE_0⟧ first.')).toBe(true);
  });
});

describe('copyMaskedText', () => {
  it('ينسخ ويعلن عدد الفقرات والعناصر المحمية', async () => {
    const written: string[] = [];
    const note = await copyMaskedText([['Run ', { type: 'CODE', value: 'npm test' }, ' now.']], async (text) => void written.push(text));
    expect(written).toEqual(['Run ⟦CODE_0⟧ now.']);
    expect(note).toContain('نُسخ النص المقنَّع (1 فقرة)');
    expect(note).toContain('1 عنصرًا محميًا');
  });

  it('لا فقرات ← لا نسخ؛ وتعذّر الحافظة يُعلَن ولا يُرمى', async () => {
    let calls = 0;
    expect(await copyMaskedText([], async () => void (calls += 1))).toBe('لا نص إنجليزي لنسخه هنا.');
    expect(calls).toBe(0);
    expect(await copyMaskedText([['Hello world.']], async () => Promise.reject(new Error('Document is not focused')))).toBe('تعذّر النسخ إلى الحافظة: Document is not focused');
  });
});
