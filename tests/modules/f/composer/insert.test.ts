// @vitest-environment jsdom
// الإدراج الآمن وحماية المسودة (src/modules/f/composer/insert.ts، F-F4/AC-F4): الإدراج عند المؤشر أو بالإلحاق دون مسح حرف من المسودة، ولقطة تراجع قبله، و«التراجع عن آخر إدراج»
// بحالاته الثلاث (عادت المسودة حرفيًا، أو أُزيل المُدرج وبقيت تعديلات لاحقة، أو تعذّر ويُعرض نص المسودة السابقة). jsdom بلا execCommand فمساره البديل (setRangeText + input)؛
// ومسار execCommand يُقاس بمحاكاة له، وفي المتصفحات الأربعة الفعلية بـe2e (tests/modules/f/composer/browser/run.mjs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { insertBlock, plan, undoInsertion } from '../../../../src/modules/f/composer';

let field: HTMLTextAreaElement;
const BLOCK = '## Expected behavior\n\nIt works.\n';

beforeEach(() => {
  document.body.innerHTML = '<form id="f"><textarea id="t"></textarea><button type="submit" id="s">Comment</button></form>';
  field = document.getElementById('t') as HTMLTextAreaElement;
});
afterEach(() => vi.restoreAllMocks());

const draft = (value: string, start = value.length, end = start): void => {
  field.value = value;
  field.setSelectionRange(start, end);
};

describe('plan: الفواصل والموضع', () => {
  it('حقل فارغ: بلا فاصل قبل، وسطر جديد بعد', () => {
    expect(plan('', 0, 'cursor')).toEqual({ position: 0, prefix: '', suffix: '\n' });
  });
  it('وسط سطر: سطر فارغ قبل الكتلة وبعدها', () => {
    expect(plan('abc def', 3, 'cursor')).toEqual({ position: 3, prefix: '\n\n', suffix: '\n\n' });
  });
  it('أول سطر جديد: بلا فاصل قبل، وسطر فارغ بعد النص الذي يليها', () => {
    expect(plan('abc\ndef', 4, 'cursor')).toEqual({ position: 4, prefix: '\n', suffix: '\n\n' });
    expect(plan('abc\n\ndef', 5, 'cursor')).toEqual({ position: 5, prefix: '', suffix: '\n\n' });
    expect(plan('abc\n\n\ndef', 5, 'cursor')).toEqual({ position: 5, prefix: '', suffix: '\n' });
    expect(plan('abc\n\n\n\ndef', 5, 'cursor')).toEqual({ position: 5, prefix: '', suffix: '' });
  });
  it('الإلحاق دائمًا في النهاية بغض النظر عن المؤشر', () => {
    expect(plan('abc', 1, 'append')).toEqual({ position: 3, prefix: '\n\n', suffix: '\n' });
    expect(plan('abc\n', 0, 'append')).toEqual({ position: 4, prefix: '\n', suffix: '\n' });
    expect(plan('abc\n\n', 0, 'append')).toEqual({ position: 5, prefix: '', suffix: '\n' });
  });
  it('موضع خارج المدى أو null يُقيَّد إلى طرف النص', () => {
    expect(plan('abc', null, 'cursor').position).toBe(3);
    expect(plan('abc', 99, 'cursor').position).toBe(3);
    expect(plan('abc', -4, 'cursor').position).toBe(0);
  });
});

describe('insertBlock: عند المؤشر', () => {
  it('وسط المسودة: النص قبل المؤشر وبعده كما هما حرفيًا، والكتلة بينهما', () => {
    const original = 'First line.\nSecond line.';
    draft(original, 11);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    expect(field.value).toBe(`First line.\n\n${BLOCK.trimEnd()}\n\nSecond line.`);
    expect(field.value.startsWith('First line.')).toBe(true);
    expect(field.value.endsWith('\nSecond line.')).toBe(true);
    expect(insertion.start).toBe(11);
    expect(insertion.inserted).toBe(`\n\n${BLOCK.trimEnd()}\n`);
    expect(field.value).toBe(original.slice(0, 11) + insertion.inserted + original.slice(11));
  });

  it('تحديد نص: يُطوى إلى طرفه الأخير فلا يُستبدل المحدد، ويبقى كل حرف من المسودة بترتيبه', () => {
    const original = 'keep this selected text here';
    draft(original, 5, 18);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    expect(insertion.start).toBe(18);
    expect(field.value).toBe(original.slice(0, 18) + insertion.inserted + original.slice(18));
    expect(field.value.replace(insertion.inserted, '')).toBe(original);
  });

  it('حقل فارغ: الكتلة وسطر جديد، والمؤشر بعدها', () => {
    draft('');
    insertBlock(field, BLOCK, 'cursor');
    expect(field.value).toBe(`${BLOCK.trimEnd()}\n`);
    expect([field.selectionStart, field.selectionEnd]).toEqual([field.value.length, field.value.length]);
  });

  it('نص فارغ أو مسافات فقط: لا مساس بالحقل ولا لقطة', () => {
    draft('untouched', 3);
    const events: string[] = [];
    field.addEventListener('input', () => events.push('input'));
    expect(insertBlock(field, '  \n', 'cursor')).toBeNull();
    expect(insertBlock(field, '', 'append')).toBeNull();
    expect(field.value).toBe('untouched');
    expect([field.selectionStart, field.selectionEnd]).toEqual([3, 3]);
    expect(events).toEqual([]);
  });
});

describe('insertBlock: الإلحاق', () => {
  it('في نهاية مسودة غير فارغة: بعدها بسطر فارغ، والمسودة سليمة في أولها', () => {
    const original = 'My existing draft.\nWith two lines.';
    draft(original, 4);
    const insertion = insertBlock(field, BLOCK, 'append')!;
    expect(field.value.startsWith(original)).toBe(true);
    expect(field.value).toBe(`${original}\n\n${BLOCK.trimEnd()}\n`);
    expect(insertion.start).toBe(original.length);
  });

  it('الإلحاق مرتين: الكتلتان معًا والمسودة في أولها لم تُمس', () => {
    draft('draft');
    insertBlock(field, BLOCK, 'append');
    insertBlock(field, '## Evidence\n\n- shot\n', 'append');
    expect(field.value).toBe(`draft\n\n${BLOCK.trimEnd()}\n\n## Evidence\n\n- shot\n`);
  });
});

describe('الإدراج كما لو كتبه المستخدم', () => {
  it('يطلق حدث input واحدًا بنوع insertText وفقاعة، فيراه GitHub (React) وإكمال الصفحة', () => {
    draft('abc', 3);
    const seen: Array<{ type: string; inputType: string; bubbles: boolean }> = [];
    field.addEventListener('input', (event) => seen.push({ type: event.type, inputType: (event as InputEvent).inputType, bubbles: event.bubbles }));
    insertBlock(field, BLOCK, 'cursor');
    expect(seen).toEqual([{ type: 'input', inputType: 'insertText', bubbles: true }]);
  });

  it('مسار execCommand (إن توفر): يُستعمل أمر التحرير insertText ولا يُدرج النص مرتين', () => {
    draft('abc', 3);
    const calls: Array<[string, string | undefined]> = [];
    (document as unknown as { execCommand: unknown }).execCommand = (command: string, _ui: boolean, value?: string): boolean => {
      calls.push([command, value]);
      if (command === 'insertText') field.setRangeText(value ?? '', field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end');
      return true;
    };
    try {
      const insertion = insertBlock(field, BLOCK, 'cursor')!;
      expect(insertion.method).toBe('execCommand');
      expect(calls.map((c) => c[0])).toEqual(['insertText']);
      expect(field.value.match(/Expected behavior/g)).toHaveLength(1);
    } finally {
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    }
  });

  it('لا يلمس النموذج: لا submit ولا نقر على زر الإرسال ولا حدث change', () => {
    draft('abc', 3);
    const seen: string[] = [];
    const form = document.getElementById('f')!;
    form.addEventListener('submit', () => seen.push('submit'));
    document.getElementById('s')!.addEventListener('click', () => seen.push('click-submit'));
    field.addEventListener('change', () => seen.push('change'));
    insertBlock(field, BLOCK, 'cursor');
    undoInsertion(insertBlock(field, BLOCK, 'append')!);
    expect(seen).toEqual([]);
  });
});

describe('التراجع عن آخر إدراج', () => {
  it('لقطة قبل الإدراج: التراجع يعيد المسودة والتحديد حرفيًا (عند المؤشر)', () => {
    const original = 'First line.\nSecond line.\nThird line.';
    draft(original, 12, 24);
    field.scrollTop = 0;
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    expect(field.value).not.toBe(original);
    expect(insertion.snapshot.value).toBe(original);
    expect(undoInsertion(insertion)).toEqual({ status: 'restored' });
    expect(field.value).toBe(original);
    expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([12, 24, 'none']);
  });

  it('بعد الإلحاق: تعود المسودة حرفيًا', () => {
    draft('draft one\n\ndraft two', 3);
    const insertion = insertBlock(field, BLOCK, 'append')!;
    expect(undoInsertion(insertion).status).toBe('restored');
    expect(field.value).toBe('draft one\n\ndraft two');
  });

  it('تعديل لاحق خارج الكتلة: تُزال الكتلة وحدها وتبقى التعديلات (removed)', () => {
    draft('Intro.\n\nTail.', 6);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    field.setRangeText(' EDITED', field.value.length, field.value.length, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const result = undoInsertion(insertion);
    expect(result.status).toBe('removed');
    expect(field.value).toContain('Intro.');
    expect(field.value).toContain('Tail. EDITED');
    expect(field.value).not.toContain('Expected behavior');
  });

  it('تعديل لاحق قبل الكتلة يزيح موضعها: تُوجد بنصها وتُزال', () => {
    draft('Tail.', 5);
    const insertion = insertBlock(field, BLOCK, 'append')!;
    field.setRangeText('PREFIX ', 0, 0, 'end');
    const result = undoInsertion(insertion);
    expect(result.status).toBe('removed');
    expect(field.value.startsWith('PREFIX Tail.')).toBe(true);
    expect(field.value).not.toContain('Expected behavior');
  });

  it('تغيّر نص الكتلة نفسه: تعذّر ولا تُمس المسودة، ويُعاد نص المسودة السابقة لتُنسخ', () => {
    draft('Before.', 7);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    field.value = field.value.replace('It works.', 'It changed.');
    const after = field.value;
    expect(undoInsertion(insertion)).toEqual({ status: 'modified', previous: 'Before.' });
    expect(field.value).toBe(after);
  });

  it('المستخدم تراجع عنه بنفسه (Ctrl/⌘+Z الأصلي) قبل ضغط زر التراجع: تُعدّ المسودة مستعادة بلا حذف ولا تحذير', () => {
    draft('Mine.', 5);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    field.value = 'Mine.';
    field.setSelectionRange(5, 5);
    expect(undoInsertion(insertion)).toEqual({ status: 'restored' });
    expect(field.value).toBe('Mine.');
  });

  it('الحقل أُزيل من الصفحة: تعذّر مع نص المسودة السابقة', () => {
    draft('Gone.', 5);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    field.remove();
    expect(undoInsertion(insertion)).toEqual({ status: 'modified', previous: 'Gone.' });
  });

  it('التراجع يطلق input واحدًا بنوع deleteContentBackward (فيراه GitHub)', () => {
    draft('x', 1);
    const insertion = insertBlock(field, BLOCK, 'cursor')!;
    const seen: string[] = [];
    field.addEventListener('input', (event) => seen.push((event as InputEvent).inputType));
    undoInsertion(insertion);
    expect(seen).toEqual(['deleteContentBackward']);
  });
});
