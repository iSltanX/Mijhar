// COR-AUD-05 (Gemini): عبارة الخصوصية في الترحيب لا تنفي كل اتصال تلقائي. وحدة حالة الطلب (المفعّلة افتراضًا) تطلب من github.com نفسه جزء الفحوص
// حين لا تعرضه الصفحة، بلا نقر (Docs/Site/privacy.md، «github.com — الموقع الذي تفتحه»)؛ وكل وجهة غيره لا يُتصل بها إلا بطلب المستخدم.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WELCOME_PRIVACY } from '../../src/shared/onboarding/content';

describe('COR-AUD-05: عبارة الخصوصية في الترحيب', () => {
  it('الطلب التلقائي إلى github.com نفسه قائم في وحدة حالة الطلب (سبب التقييد)', () => {
    const source = readFileSync('src/modules/d/pr-status/module.tsx', 'utf8');
    expect(source).toMatch(/fetch\(target\.href, \{ credentials: 'same-origin'/);
  });

  it('تسمّي github.com ولا تنفي كل اتصال', () => {
    expect(WELCOME_PRIVACY).toContain('github.com');
    expect(WELCOME_PRIVACY).not.toContain('لا يتصل بأي خدمة إلا');
    expect(WELCOME_PRIVACY).toContain('إلا حين تطلب ذلك بنفسك');
  });
});
