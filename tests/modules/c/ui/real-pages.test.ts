// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/Watad-Project/Watad/pull/80"}
// وحدة الترجمة على صفحات GitHub حقيقية محفوظة (fixtures/spikes): README ومشكلة React وطلب سحب بالتخطيط القديم. لا ادعاء ببنية مصنوعة: ما يُقاس هنا أن الأشرطة
// تظهر حيث النص، وأن الترجمة (بمحرك وهمي) تعمل على DOM حقيقي كبير، وأن إلغاءها وإيقاف الوحدة يعيدان الصفحة حرفيًا.
import path from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeTranslationEngine, setTranslationService } from '../../../../src/modules/c/ui';
import { ROOT, bars, flush, hosts, loadHtml, mountTranslate, pageHtml, phase, press, translations } from './helpers';
import type { Live } from './helpers';

let live: Live | null = null;
afterEach(() => {
  live?.manager.stop();
  live = null;
  setTranslationService(null);
});

const PAGES = [
  { name: 'PR قديم (Rails)', file: 'fixtures/spikes/gh-pr-watad-80.html', minBars: 4 },
  { name: 'مشكلة (React)', file: 'fixtures/spikes/gh-issue-etos-1.html', minBars: 5 },
  { name: 'README (shakkala)', file: 'fixtures/spikes/gh-readme-shakkala.html', minBars: 1 },
];

describe.each(PAGES)('$name', ({ name, file, minBars }) => {
  it('الأشرطة تظهر فوق النصوص، وعدّاد المحرك صفر، وإيقاف الوحدة يعيد الصفحة حرفيًا', async () => {
    loadHtml(path.join(ROOT, file));
    const pristine = pageHtml();
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    expect(bars().length).toBeGreaterThanOrEqual(minBars);
    // كل شريط يسبق نصًا مرسومًا .markdown-body أو .comment-body مباشرة، ولا شريط داخل نص آخر.
    for (const bar of bars()) {
      const next = bar.nextElementSibling!;
      expect(next.matches('.markdown-body, [data-testid="markdown-body"]'), next.className).toBe(true);
      expect(bar.closest('.markdown-body')).toBeNull();
    }
    console.info(`${name}: ${bars().length} شريطًا فوق نصوص مرسومة`);
    expect(engine.calls).toBe(0);
    live.manager.stop();
    live = null;
    expect(pageHtml()).toBe(pristine);
  });

  it('ترجمة أول نص قابل: تعمل على DOM الحقيقي، وإلغاؤها يعيد الصفحة حرفيًا', async () => {
    loadHtml(path.join(ROOT, file));
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    const withText = bars().find((bar) => {
      const body = bar.nextElementSibling!;
      return /[A-Za-z]{3,}/.test(body.textContent ?? '');
    });
    expect(withText).toBeDefined();
    const before = pageHtml();
    await act(async () => {
      withText!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="translate"]')!.click();
      await flush(150);
    });
    expect(['done', 'empty']).toContain(phase(withText!));
    console.info(`${name}: أول نص بالإنجليزية ← ${phase(withText!)}، ${translations().length} مضيف ترجمة، ${engine.calls} استدعاء للمحرك`);
    if (phase(withText!) === 'done') {
      expect(translations().length).toBeGreaterThan(0);
      expect(engine.calls).toBeGreaterThan(0);
      // لا فقرة مستثناة (شيفرة) نالت ترجمة.
      for (const t of translations()) expect(t.closest('pre, .highlight, .notranslate')).toBeNull();
      await press(withText!, 'remove', 20);
    }
    expect(pageHtml()).toBe(before);
    expect(hosts('c.ui.translation')).toHaveLength(0);
  });
});
