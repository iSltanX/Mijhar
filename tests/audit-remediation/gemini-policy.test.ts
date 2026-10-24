// COR-AUD-04 (Gemini): ملخص شروط Gemini يقول ما يحدد نوع الخدمة كما تعرّفه الشروط الرسمية (https://ai.google.dev/gemini-api/terms، «Paid
// Services»: واجهة Gemini API مدفوعة حين تُستعمل عبر مشروع Google Cloud مرتبط بحساب فوترة نشط وحده)، والقاعدة الإقليمية (المنطقة الاقتصادية
// الأوروبية وسويسرا والمملكة المتحدة: شروط المدفوعة في استعمال البيانات على الخدمات كلها). وفي الإضافة بلا مفردات مال (AD-31 وفحص static.test.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEMINI } from '../../src/modules/e/provider/descriptors/gemini';

const MONEY = /سعر|أسعار|تكلف|دولار|ميزاني|فوترة|إنفاق|مجاني|تدفع|\bprice|\bpricing|\bcost|\bbudget|\bspend|\bquota|\bbilling|\$\s?\d/i;
const REGION = 'المنطقة الاقتصادية الأوروبية وسويسرا والمملكة المتحدة';

describe('COR-AUD-04: ما يحدد معاملة Gemini للبيانات', () => {
  it('وصف المزوّد في الإضافة: نوع الخدمة من مشروع Google Cloud الذي يتبعه المفتاح لا من مِجهَر، والقاعدة الإقليمية؛ بلا مفردات مال', () => {
    const summary = GEMINI.policy.summary;
    expect(summary).toContain('مشروع Google Cloud الذي يتبعه مفتاحك');
    expect(summary).toContain('لا من مِجهَر');
    expect(summary).toContain(REGION);
    expect(summary).not.toMatch(MONEY);
  });

  it('صفحة الخصوصية: تعريف الخدمة المدفوعة كما في الشروط، والقاعدة الإقليمية', () => {
    const line = readFileSync('Docs/Site/privacy.md', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('- **Google Gemini**'));
    expect(line).toContain('مشروع Google Cloud مرتبط بحساب فوترة نشط');
    expect(line).toContain(REGION);
    expect(line).not.toMatch(/سعر|أسعار|تكلف|دولار|\$\s?\d/);
  });
});
