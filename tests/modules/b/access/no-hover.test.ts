// لا شرح في بطاقة الشرح يعتمد على التحويم وحده (AC-B5): فحص ساكن لشيفرة الوحدة (ب) وأنماطها.
//  - لا مستمع تحويم في TS/TSX (mouseenter وmouseover وpointerenter وpointerover وonMouse… وonPointerEnter…).
//  - كل قاعدة :hover في أنماط الطبقة تغيّر مظهرًا (لونًا وحدودًا وخلفية) ولا تُظهر شيئًا ولا تخفيه.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCESS_CSS } from '../../../../src/modules/b/access';
import { CARD_CSS, OVERLAY_HOST_CSS } from '../../../../src/modules/b/card';
import { BASE_CSS } from '../../../../src/shared/ui/tokens';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => path.join(ROOT, dir, f));

const HOVER_LISTENER = /mouseenter|mouseover|pointerenter|pointerover|onMouse(Enter|Over)|onPointer(Enter|Over)|:hover|\bhover\b(?!:\s*none)/i;
const REVEALING = /(^|;|\s)(display|visibility|opacity|pointer-events|content|height|max-height|width|transform|clip|clip-path|position|inset|top|left|right|bottom)\s*:/i;

describe('لا اعتماد على التحويم', () => {
  it('لا مستمع تحويم في شيفرة b/card وb/access', () => {
    const offenders = [...sources('src/modules/b/card'), ...sources('src/modules/b/access')]
      .filter((file) => !file.endsWith('css.ts'))
      .map((file) => ({ file: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }))
      .flatMap(({ file, text }) => text.split('\n').map((line, i) => ({ file, line: i + 1, text: line })))
      .filter(({ text }) => HOVER_LISTENER.test(text.replace(/\/\/.*$/, '')));
    expect(offenders).toEqual([]);
  });

  it('قواعد :hover في أنماط الطبقة تغيّر لونًا أو حدًّا أو خلفية فقط', () => {
    const css = `${OVERLAY_HOST_CSS}\n${CARD_CSS}\n${ACCESS_CSS}\n${BASE_CSS}`;
    const rules = [...css.matchAll(/([^{}]+):hover([^{}]*)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, , body] of rules) expect(body, `${selector}:hover`).not.toMatch(REVEALING);
  });

  it('ACCESS_CSS لا تحوي :hover أصلًا', () => {
    expect(ACCESS_CSS).not.toMatch(/:hover/);
  });
});
