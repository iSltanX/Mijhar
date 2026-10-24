// AD-27 (G-2): الموافقة في واجهات الصفحة تقبل نقرة المستخدم الموثوقة وحدها. حراسة على الشيفرة كلها:
//  - isTrustedActivation صارمة: true لحدث isTrusted=true فقط، ولا مدخل آخر يجعلها true؛
//  - كل زر «موافق» (data-action="consent-confirm") في src يمر معالجه بها؛
//  - لا يقرأ ملف في src خاصية isTrusted إلا ملف المساعد نفسه، فلا تجاوز ولا استثناء للاختبار في شيفرة الإنتاج.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../setup/paths';
import { isTrustedActivation } from '../../src/shared/ui/user-activation';

const HELPER = 'src/shared/ui/user-activation.ts';

function sources(dir = 'src'): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

describe('isTrustedActivation', () => {
  it('true لحدث موثوق وحده', () => {
    expect(isTrustedActivation({ isTrusted: true } as Event)).toBe(true);
    expect(isTrustedActivation({ isTrusted: false } as Event)).toBe(false);
    expect(isTrustedActivation({} as Event)).toBe(false);
    expect(isTrustedActivation({ isTrusted: 'true' } as unknown as Event)).toBe(false);
    expect(isTrustedActivation(new Event('click'))).toBe(false);
  });
});

describe('حراسة ساكنة على src', () => {
  const files = sources();

  it('كل ملف فيه زر «موافق» (consent-confirm) يمرر معالجه بـisTrustedActivation', () => {
    const withConfirm = files.filter((f) => /data-action="consent-confirm"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(withConfirm.sort()).toEqual(['src/modules/c/model-manager/consent-panel.tsx', 'src/modules/f/phrasebank/translate-draft.tsx']);
    for (const f of withConfirm) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const button = text.slice(text.indexOf('data-action="consent-confirm"'));
      const handler = /onClick=\{([^}]*\}?[^}]*)\}/.exec(button)?.[1] ?? '';
      expect(handler, `${f}: معالج «موافق»`).toMatch(/isTrustedActivation\(/);
    }
  });

  it('لا ملف في src يقرأ isTrusted إلا ملف المساعد (لا تجاوز ولا استثناء اختبار في الإنتاج)', () => {
    const readers = files.filter((f) => /\bisTrusted\b/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(readers).toEqual([HELPER]);
  });
});
