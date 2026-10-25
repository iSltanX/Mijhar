// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// BLK-AUD-01: قسم «الخصوصية» في تبويب «الإعدادات والخصوصية» يظهر في الأسطح الثلاثة، وفي اللوحة والدرج لا تظهر بطاقات
// الأسرار، فهو بيان الخصوصية الوحيد هناك. لا يجزم بأن كل شيء محلي، ويذكر الاتصالين الاختياريين (api.github.com ومزوّد
// التحليل) وأنهما بطلب المستخدم وحده، كما في Docs/Site/privacy.md (#summary).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsTab } from '../../src/options/SettingsTab';
import { memorySettings } from '../core/ui-host/helpers';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const privacyText = async (surface: 'options' | 'native' | 'drawer'): Promise<string> => {
  const { settings } = await memorySettings();
  act(() => render(<SettingsTab settings={settings} surface={surface} />, container));
  return (container.querySelector('[data-section="privacy"]')?.textContent ?? '').replace(/\s+/g, ' ');
};

describe('BLK-AUD-01: بيان الخصوصية داخل الإضافة', () => {
  for (const surface of ['options', 'native', 'drawer'] as const) {
    it(`${surface}: يذكر api.github.com ومزوّد التحليل وأنهما بطلبك، ولا يجزم بأن كل شيء محلي`, async () => {
      const text = await privacyText(surface);
      expect(text).toContain('github.com');
      expect(text).toContain('api.github.com');
      expect(text).toContain('مزوّد التحليل');
      expect(text).toContain('ليس كل شيء محليًا');
      expect(text).toMatch(/إلا بطلبك/);
      // ما يُحفظ (الإعدادات والملاحظات) لا يُرسل: يبقى صحيحًا ومذكورًا.
      expect(text).toMatch(/إعداداتك وملاحظاتك محفوظة في هذا المتصفح، ولا تُرسل إلى أي خدمة/);
      // الأسرار الاختيارية: مكانها الافتراضي ووجهتها ومكان مسحها، وأن المسح لا يُبطلها في المصدر.
      expect(text).toContain('تُحفظ في ذاكرة الجلسة افتراضًا');
      expect(text).toContain('لا يُرسل أيٌّ منها إلا إلى خدمته');
      expect(text).toContain('لا يُبطلها عند GitHub أو المزوّد');
    });
  }
});
