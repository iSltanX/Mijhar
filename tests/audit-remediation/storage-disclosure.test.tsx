// @vitest-environment jsdom
// COR-AUD-01 (Gemini): بيان «الحفظ والعزل» أعلى بطاقات الاتصالات الثلاث يشملها كلها: رمزا القراءة والكتابة إلى api.github.com وحده،
// ومفتاح كل مزوّد تحليل إلى مضيف مزوّده وحده (من السجل نفسه، فلا يتخلّف البيان عن مزوّد يُضاف)، ومن الخلفية وحدها؛ ورمز الكتابة في ذاكرة
// الجلسة وحدها. والقرص «غير مشفَّر» صريحًا كما كان (توصية التدقيق بوصفه «مشفّرًا» لا تطابق المصدر، فلم تُتبع).
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageDisclosure } from '../../src/core/connections/ui/ConnectionsSection';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const item = (selector: string): string => (container.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ');

describe('COR-AUD-01: بيان الحفظ والعزل يشمل الأسرار الثلاثة', () => {
  it('وجهة كل سرّ: رمزا القراءة والكتابة إلى api.github.com، ومفتاح كل مزوّد إلى مضيفه وحده، ومن الخلفية وحدها', () => {
    render(<StorageDisclosure />, container);
    const send = item('[data-storage="send"]');
    expect(send).toContain('رمزا القراءة والكتابة إلى api.github.com وحده');
    expect(send).toContain('مفتاح كل مزوّد تحليل إلى مضيف مزوّده وحده');
    expect(send).toContain('من خلفية الإضافة وحدها');
    for (const { descriptor } of createProviderRegistry().list) expect(send, descriptor.id).toContain(descriptor.host);
  });

  it('مكان الحفظ: رمز الكتابة في ذاكرة الجلسة وحدها، والقرص لرمز القراءة ومفتاح المزوّد وحدهما وغير مشفَّر', () => {
    render(<StorageDisclosure />, container);
    const where = item('[data-storage="disk"]');
    expect(where).toContain('رمز الكتابة في ذاكرة الجلسة وحدها');
    expect(where).toContain('لرمز القراءة ومفتاح المزوّد');
    expect(where).toContain('غير مشفَّر');
    expect(item('[data-storage-disclosure]')).not.toMatch(/(?<!لا يدّعي مِجهَر )تشفيرًا|مُشفَّر(?!\S)|المشفّر/);
  });

  it('ما يُشتق من السرّ (COR-AUD-02): القائمة والاختبار يُحذفان عند القراءة التالية، وسجل التحقق يُحذف بعد المسح ويبقى مهملًا بعد الاستبدال', () => {
    render(<StorageDisclosure />, container);
    const derived = item('[data-storage="derived"]');
    for (const part of ['ذاكرة الجلسة وحدها', 'لا يُعرض ولا يُستعمل لغير السرّ الذي صدر عنه', 'قائمة النماذج ونتيجة اختبار النموذج عند قراءة الحالة التالية']) expect(derived).toContain(part);
    // سجل الصحة: يحذفه status() إن لم يعد السرّ محفوظًا، ويتجاهله resolveStatus لسرّ بوقت حفظ آخر حتى يكتب فوقه أول حكم على البديل.
    expect(derived).toContain('فتُحذف كذلك بعد المسح');
    expect(derived).toContain('وبعد الاستبدال تبقى مهملة حتى يحل محلها أول تحقق من البديل أو تُمحى ذاكرة الجلسة');
    expect(derived).not.toMatch(/فورًا|مباشرة/);
  });
});
