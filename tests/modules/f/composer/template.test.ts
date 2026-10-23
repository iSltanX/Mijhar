// تنظيم البلاغ أو الطلب (src/modules/f/composer/template.ts، F-F1/AC-F1): حتمي، ولا يغيّر كلمات المستخدم، وقسم لكل حقل غير فارغ، ولغة العناوين بحسب ما كُتب.
import { describe, expect, it } from 'vitest';
import { EMPTY_FIELDS, FIELD_IDS, bulleted, compose, detectLanguage, headingFor, numbered, paragraph } from '../../../../src/modules/f/composer';
import type { ComposerFields } from '../../../../src/modules/f/composer';

const EN: ComposerFields = {
  expected: 'The side panel opens when I press the shortcut.',
  actual: 'Nothing happens.\nThe console shows: TypeError: x is undefined',
  steps: 'Open github.com\n2) Press Alt+G\n- Watch the sidebar',
  environment: 'macOS 15\nFirefox 158.0.1',
  evidence: 'https://example.com/a.png\n* console.log attached',
};

describe('compose: الأقسام الخمسة', () => {
  it('كل حقل غير فارغ قسم بعنوان من المستوى الثاني بالترتيب الثابت، وفراغ واحد بين الأقسام، وسطر أخير', () => {
    const { text, included, omitted, language } = compose(EN, { kind: 'issue', language: 'auto' });
    expect(language).toBe('en');
    expect(included).toEqual([...FIELD_IDS]);
    expect(omitted).toEqual([]);
    expect(text).toBe(
      [
        '## Expected behavior',
        '',
        'The side panel opens when I press the shortcut.',
        '',
        '## Actual behavior',
        '',
        'Nothing happens.',
        'The console shows: TypeError: x is undefined',
        '',
        '## Steps to reproduce',
        '',
        '1. Open github.com',
        '2. Press Alt+G',
        '3. Watch the sidebar',
        '',
        '## Environment',
        '',
        '- macOS 15',
        '- Firefox 158.0.1',
        '',
        '## Evidence',
        '',
        '- https://example.com/a.png',
        '- console.log attached',
        '',
      ].join('\n'),
    );
  });

  it('حقل فارغ أو مسافات فقط لا يُدرج قسمه، وكله فارغ يعطي نصًا فارغًا', () => {
    const some = compose({ ...EMPTY_FIELDS, expected: 'Works.', environment: '   \n  ' }, { kind: 'issue', language: 'en' });
    expect(some.included).toEqual(['expected']);
    expect(some.omitted).toEqual(['actual', 'steps', 'environment', 'evidence']);
    expect(some.text).toBe('## Expected behavior\n\nWorks.\n');
    expect(compose(EMPTY_FIELDS, { kind: 'pr', language: 'auto' })).toEqual({ text: '', language: 'en', included: [], omitted: [...FIELD_IDS] });
  });

  it('لا تُغيَّر كلمات المستخدم: كل سطر كتبه يظهر في النتيجة حرفيًا (عدا علامة القائمة التي استُبدلت)', () => {
    const { text } = compose(EN, { kind: 'issue', language: 'en' });
    for (const line of ['The side panel opens when I press the shortcut.', 'Nothing happens.', 'The console shows: TypeError: x is undefined', 'Open github.com', 'Press Alt+G', 'Watch the sidebar', 'macOS 15', 'Firefox 158.0.1', 'https://example.com/a.png', 'console.log attached']) {
      expect(text, line).toContain(line);
    }
  });

  it('حتمي: المدخل نفسه يعطي المخرج نفسه، وإعادة التركيب من مخرج سابق لا تتكاثر عناوينه', () => {
    const a = compose(EN, { kind: 'pr', language: 'ar' });
    expect(compose(EN, { kind: 'pr', language: 'ar' })).toEqual(a);
  });

  it('نهايات الأسطر CRLF توحَّد، والفراغ الطرفي يُقص ولا يُمس الداخلي', () => {
    const { text } = compose({ ...EMPTY_FIELDS, expected: '\r\n  keep   inner   spaces  \r\n\r\n', actual: 'a\r\nb' }, { kind: 'issue', language: 'en' });
    expect(text).toBe('## Expected behavior\n\n  keep   inner   spaces\n\n## Actual behavior\n\na\nb\n');
    expect(text).not.toContain('\r');
  });
});

describe('اللغة والنوع', () => {
  it('اللغة التلقائية: العربية إن غلبت حروفها وإلا الإنجليزية، ويمكن فرضها', () => {
    const ar: ComposerFields = { ...EMPTY_FIELDS, expected: 'يفتح اللوحة الجانبية عند الضغط على الاختصار', actual: 'لا يحدث شيء مع كلمة Firefox' };
    expect(detectLanguage(ar)).toBe('ar');
    expect(detectLanguage(EN)).toBe('en');
    expect(detectLanguage(EMPTY_FIELDS)).toBe('en');
    expect(compose(ar, { kind: 'issue', language: 'auto' }).text).toContain('## السلوك المتوقع');
    expect(compose(ar, { kind: 'issue', language: 'en' }).text).toContain('## Expected behavior');
    expect(compose(EN, { kind: 'issue', language: 'ar' }).text).toContain('## السلوك الفعلي');
  });

  it('طلب الدمج بعناوينه (المتوقع بعد التغيير، وما كان يحدث قبله، وكيفية التحقق) بالعربية والإنجليزية', () => {
    expect(headingFor('pr', 'en', 'expected')).toBe('Expected after this change');
    expect(headingFor('pr', 'en', 'actual')).toBe('Behavior before this change');
    expect(headingFor('pr', 'en', 'steps')).toBe('How to verify');
    expect(headingFor('pr', 'ar', 'steps')).toBe('كيفية التحقق');
    expect(compose(EN, { kind: 'pr', language: 'en' }).text).toContain('## How to verify\n\n1. Open github.com');
    // العناوين الخمسة مختلفة بين Issue وPR في المتوقع والفعلي والخطوات، ومتفقة في البيئة والأدلة.
    for (const id of ['environment', 'evidence'] as const) expect(headingFor('pr', 'ar', id)).toBe(headingFor('issue', 'ar', id));
    for (const id of ['expected', 'actual', 'steps'] as const) expect(headingFor('pr', 'ar', id)).not.toBe(headingFor('issue', 'ar', id));
  });
});

describe('التنسيق الجزئي', () => {
  it('numbered: خطوة في كل سطر مرقّمة من 1، وعلامات المستخدم (1. و2) و- و* و+ و•) تُستبدل لا تتكرر، وسطر المسافات يُسقط', () => {
    expect(numbered('a\n\n  b  \n3. c\n- d\n• e')).toBe('1. a\n2. b\n3. c\n4. d\n5. e');
    expect(numbered('')).toBe('');
  });

  it('bulleted: بند في كل سطر، وروابط وصور Markdown كما هي', () => {
    expect(bulleted('![shot](https://x.invalid/a.png)\n1. second\n`code` third')).toBe('- ![shot](https://x.invalid/a.png)\n- second\n- `code` third');
  });

  it('paragraph: الأسطر الداخلية تبقى كما كتبها المستخدم', () => {
    expect(paragraph('\n\nline one\nline two\n\n')).toBe('line one\nline two');
  });
});
