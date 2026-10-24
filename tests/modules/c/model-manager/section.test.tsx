// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// قسم «نموذج الترجمة» في الإعدادات (T-4.4، AC-C5 في ج-2): مسجَّل في أقسام الوحدة (ج)، ويعرض الحجم «غير معلن» والوجهة والحذف والإلغاء والأخطاء، بلا رقم حجم
// ولا ادعاء لحالة اللحظة (صفحة الإعدادات لا تسأل المتصفح عن الحزمة).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_SECTION } from '../../../../src/modules/c/model-manager';
import { SETTINGS_SECTIONS } from '../../../../src/options/sections';
import type { SettingsSectionProps } from '../../../../src/options/sections';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = null;
});

async function show(): Promise<string> {
  container = document.createElement('div');
  document.body.append(container);
  const props = { settings: {} as SettingsSectionProps['settings'], surface: 'options', unitEnabled: true } satisfies SettingsSectionProps;
  const Component = MODEL_SECTION.component;
  await act(async () => void render(<Component {...props} />, container!));
  return container.textContent!.replace(/\s+/g, ' ');
}

describe('MODEL_SECTION', () => {
  it('مسجَّل مرة واحدة في أقسام الوحدة (ج) ويظهر في صفحة الإعدادات لا في الدرج المحقون', () => {
    const found = SETTINGS_SECTIONS.filter((s) => s.id === 'c-model');
    expect(found).toEqual([MODEL_SECTION]);
    expect(MODEL_SECTION.unit).toBe('c');
    expect(MODEL_SECTION.surfaces).toBeUndefined();
  });

  it('يعرض الحجم «غير معلن» والوجهة والحذف والاتصال، وأن الإضافة لا تنزّل نموذجًا', async () => {
    const text = await show();
    expect(text).toContain('لا تنزّل الإضافة أي نموذج');
    expect(text).toContain('غير معلن من المتصفح. المتصفح لا يعلن حجم الحزمة');
    expect(text).toContain('يخزّنها المتصفح في ملفاته');
    expect(text).toContain('لا تملك الإضافة حذف الحزمة');
    expect(text).toContain('يلزم اتصال بالإنترنت');
    expect(text).toContain('لا ترسل الإضافة نص الصفحة إلى أي جهة');
    expect(text).toContain('بطاقة تطلب موافقتك قبل أن يبدأ المتصفح التنزيل');
  });

  it('يعدّد حالات الحزمة التي يعلنها المتصفح، ولا يذكر رقم حجم', async () => {
    const text = await show();
    for (const state of ['حزمة اللغة غير منزّلة بعد', 'المتصفح ينزّل حزمة اللغة الآن', 'حزمة اللغة جاهزة على هذا الجهاز', 'غير مدعومة في هذا المتصفح', 'لا يوفر هذا المتصفح مترجمًا محليًا']) expect(text, state).toContain(state);
    expect(text).not.toMatch(/\d+\s*(MB|GB|ميغا|جيجا)/i);
  });
});
