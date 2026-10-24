// AD-27 (G-2): الموافقة في واجهات الصفحة تقبل نقرة المستخدم الموثوقة وحدها. حراسة على الشيفرة كلها:
//  - isTrustedActivation صارمة: true لحدث isTrusted=true فقط، ولا مدخل آخر يجعلها true؛
//  - كل زر «موافق» (data-action="consent-confirm") في src يمر معالجه بها؛
//  - لا يقرأ ملف في src خاصية isTrusted إلا ملف المساعد نفسه، فلا تجاوز ولا استثناء للاختبار في شيفرة الإنتاج.
// MJ22 (AC-F7 (٤)، AD-33، I-1): وتشمل الحراسة كل موافقة جديدة في مسار الإنجاز (data-consent) وكل زر يبدأ تنزيلًا:
//  - كل عنصر يحمل data-consent يمر معالج نقره بها (مباشرة أو في دالة محلية يستدعيها)، والقائمة كاملة معروفة فلا تفرغ الحراسة؛
//  - كل زر data-action فيه «download» يمر معالجه بها: download-prompt («نسخ البرومبت»، MJ20) وbuilder-download (حزمة السياق، MJ15)؛
//  - ما يبدأ تنزيلًا فعلًا (‎.download =‎) ثلاثة مواضع: downloadMarkdown لا يستدعيه إلا معالجا الزرين أعلاه، وأداتا التصدير (الملاحظات والموارد)
//    في صفحات الإضافة وحدها (اللوحة الأصلية والإعدادات) لا في الدرج المحقون في الصفحة، فلا تبلغها سكربتات الصفحة.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../setup/paths';
import { isTrustedActivation } from '../../src/shared/ui/user-activation';
import { PANEL_VIEWS } from '../../src/sidepanel/views';
import { SETTINGS_SECTIONS } from '../../src/options/sections';

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
    expect(withConfirm.sort()).toEqual(['src/modules/c/model-manager/consent-panel.tsx', 'src/modules/e/provider/ui/ConsentSheet.tsx', 'src/modules/f/phrasebank/translate-draft.tsx']);
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

/** نص الوسم الذي يحمل الموضع at: من «<» قبله إلى «>» الذي يغلقه (بأقواس متوازنة داخل {…}). */
function tagAt(text: string, at: number): string {
  const start = text.lastIndexOf('<', at);
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** تعبير onClick={…} في الوسم بأقواسه المتوازنة، أو ''. */
function onClickOf(tag: string): string {
  const at = tag.indexOf('onClick={');
  if (at === -1) return '';
  let depth = 0;
  for (let i = at + 'onClick='.length; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(at + 'onClick={'.length, i);
    }
  }
  return '';
}

/** جسم دالة محلية بالاسم (const name = (…) => {…} أو function name(…) {…})، أو ''. */
function localBody(text: string, name: string): string {
  const m = new RegExp(`(?:const ${name} = \\([^)]*\\)(?:: [^=]+)? => \\{|function ${name}\\([^)]*\\)[^{]*\\{)`).exec(text);
  if (!m) return '';
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(m.index, i + 1);
    }
  }
  return '';
}

/** هل يمر المعالج بـisTrustedActivation: في تعبيره، أو في أول دالة محلية يستدعيها. */
function handlerIsTrusted(text: string, handler: string): boolean {
  if (/isTrustedActivation\(/.test(handler)) return true;
  const called = /^\s*(?:\(\s*event\s*\)\s*=>\s*)?(\w+)(?:\(event\))?\s*$/.exec(handler)?.[1];
  return called ? /isTrustedActivation\(event\)/.test(localBody(text, called)) : false;
}

describe('MJ22 (AC-F7 (٤)، AD-33): الحراسة تشمل كل موافقة وكل زر يبدأ تنزيلًا', () => {
  const files = sources();

  it('كل عنصر data-consent يمر معالج نقره بـisTrustedActivation، والقائمة كاملة', () => {
    const found: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/data-consent="([^"]+)"/g)) {
        const tag = tagAt(text, m.index ?? 0);
        found.push(`${f}#${m[1]}`);
        expect(handlerIsTrusted(text, onClickOf(tag)), `${f}#${m[1]}: معالج الموافقة`).toBe(true);
      }
    }
    expect(found.sort()).toEqual(
      [
        'src/modules/f/execution/ExecutionPath.tsx#exec-request-write',
        'src/modules/f/execution/ExecutionPath.tsx#exec-run',
        'src/modules/f/execution/ExecutionPath.tsx#exec-scope',
        'src/modules/f/execution/WriteTokenSection.tsx#write-token-save',
      ].sort(),
    );
  });

  it('كل زر يبدأ تنزيلًا (data-action فيه download) يمر معالجه بـisTrustedActivation: زرّا «نسخ البرومبت» وحزمة السياق', () => {
    const found: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/data-action="([^"]*download[^"]*)"/g)) {
        found.push(`${f}#${m[1]}`);
        expect(handlerIsTrusted(text, onClickOf(tagAt(text, m.index ?? 0))), `${f}#${m[1]}: معالج التنزيل`).toBe(true);
      }
    }
    expect(found.sort()).toEqual(['src/modules/e/builder/view.tsx#builder-download', 'src/modules/e/copy-prompt/view.tsx#download-prompt']);
  });

  it('ما يبدأ تنزيلًا فعلًا: downloadMarkdown من معالجي الزرين وحدهما، وأداتا التصدير في صفحات الإضافة وحدها', () => {
    // خاصية download لعنصر رابط (لا حالة this.download في وحدة «نسخ البرومبت»).
    const starters = files.filter((f) => /(?<!this)\.download\s*=(?!=)/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(starters.sort()).toEqual(['src/modules/e/builder/module.tsx', 'src/modules/g/export/ui/DataTools.tsx', 'src/modules/h/resources/ResourcesView.tsx']);
    const callers = files.filter((f) => /downloadMarkdown\)?\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/export async function downloadMarkdown\(/, '')));
    expect(callers.sort()).toEqual(['src/modules/e/builder/module.tsx', 'src/modules/e/copy-prompt/module.tsx']);
    // أداتا التصدير لا تُرسمان في الدرج المحقون في صفحة GitHub.
    const importers = (name: string) => files.filter((f) => new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from`).test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(importers('DataTools').sort()).toEqual(['src/modules/g/export/section.tsx', 'src/modules/g/export/view.tsx']);
    expect(importers('ResourcesView').sort()).toEqual(['src/modules/h/views.tsx']);
    for (const id of ['g-export', 'h-resources']) expect(PANEL_VIEWS.find((v) => v.id === id)?.surfaces, id).toEqual(['native']);
    const exportSection = SETTINGS_SECTIONS.find((s) => s.id === 'g-export' || s.title.includes('التصدير'));
    expect(exportSection?.surfaces ?? ['options', 'native']).not.toContain('drawer');
  });
});
