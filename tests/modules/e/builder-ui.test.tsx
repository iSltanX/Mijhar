// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-02 (AC-E2) على مستوى الوحدة، والجزء التفاعلي من TEST-CTX-01: الوحدة مركَّبة في الصفحة كما تركّبها الإضافة (الكاشف ومدير دورة
// الحياة)، وقائمة الاختيار تتحكم فيما يدخل الحزمة، وقسم «ما تعذّر جمعه أو اقتُطع لطوله» يسرد المطوي وغير المحمّل والمقتطع بعدد أسطره
// في الواجهة وفي الحزمة معًا، والمعاينة تتجدد عند كل تبديل ضمن PB-05 (< 20ms)، والمقتطف من تحديد المستخدم، والنسخ بنقر يدوي.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS, GAPS_HEADING, ITEM, createContextBuilderModule } from '../../../src/modules/e/builder';
import { flush, hostsOf, mountModules } from '../d/helpers';
import { TOKEN_PATTERN, fakeToken, tokenSystem } from '../d/token/helpers';
import { E_FIXTURE, loadFile } from './helpers';

const NOW = Date.UTC(2026, 9, 24, 9, 30);

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

async function mounted() {
  loadFile(E_FIXTURE);
  const copied: string[] = [];
  const copy = vi.fn(async (text: string) => {
    copied.push(text);
    return 'copied' as const;
  });
  const { manager, errors } = await mountModules([createContextBuilderModule({ now: () => NOW, copy })]);
  const root = () => hostsOf('e.builder')[0]?.shadowRoot as ShadowRoot;
  const q = <E extends Element = HTMLElement>(sel: string) => root().querySelector(sel) as E | null;
  const preview = () => q<HTMLTextAreaElement>('[data-preview]')?.value ?? '';
  const click = async (sel: string) => {
    const el = q<HTMLElement>(sel);
    if (!el) throw new Error(`لا عنصر: ${sel}`);
    el.click();
    await flush();
  };
  const item = (id: string) => q<HTMLInputElement>(`input[data-item="${id}"]`);
  return { manager, errors, root, q, preview, click, item, copy, copied };
}

describe('النافذة في الصفحة', () => {
  it('شريط بعد الترويسة، والنافذة تُفتح بنقر وتجمع عندها؛ ولا طلب شبكة', async () => {
    const ui = await mounted();
    expect(hostsOf('e.builder')).toHaveLength(1);
    expect(ui.q('[data-builder-window]')).toBeNull();
    await ui.click('[data-action="builder-toggle"]');
    expect(ui.q('[data-builder-window]')).not.toBeNull();
    expect(ui.q('[data-action="builder-toggle"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(ui.preview()).toContain('# حزمة سياق: feat: refresh the settings UI');
    expect(ui.errors).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    ui.manager.stop();
    expect(hostsOf('e.builder')).toHaveLength(0);
  });
});

describe('TEST-CTX-02: قائمة الاختيار تحكم ما يدخل الحزمة', () => {
  it('الافتراضي كل المتاح؛ وإلغاء كل عنصر يُخرجه من المعاينة وإعادته تعيده', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    const sections: Array<[string, string]> = [
      [ITEM.repo, '- المستودع: `octo/demo`'],
      [ITEM.branch, '- الفرع: `feature/ui-refresh` ← `main`'],
      [ITEM.description, '> Refresh the settings UI'],
      [ITEM.checks, '## نتائج الفحوص'],
      [ITEM.error, '## مقتطف الخطأ'],
    ];
    for (const [id, marker] of sections) {
      expect(ui.item(id)?.checked, id).toBe(true);
      expect(ui.preview(), id).toContain(marker);
      await ui.click(`input[data-item="${id}"]`);
      expect(ui.preview(), id).not.toContain(marker);
      await ui.click(`input[data-item="${id}"]`);
      expect(ui.preview(), id).toContain(marker);
    }
    ui.manager.stop();
  });

  it('التعليقات واحدًا واحدًا، و«لا شيء» و«الكل»', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    const boxes = [...ui.root().querySelectorAll<HTMLInputElement>('input[data-item^="comment:"]')];
    expect(boxes).toHaveLength(2);
    await ui.click(`input[data-item="${boxes[0]?.getAttribute('data-item')}"]`);
    expect(ui.preview()).toContain('## التعليقات المختارة (1 من 2)');
    expect(ui.preview()).not.toContain('### reviewer-a');
    await ui.click('[data-action="comments-none"]');
    expect(ui.preview()).not.toContain('## التعليقات المختارة');
    await ui.click('[data-action="comments-all"]');
    expect(ui.preview()).toContain('## التعليقات المختارة (2 من 2)');
    ui.manager.stop();
  });

  it('«ما تعذّر جمعه أو اقتُطع لطوله» في الواجهة وفي الحزمة: المطوي وغير المحمّل والقائمة المطوية والمقتطع بعدد أسطره', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    const listed = [...ui.root().querySelectorAll('[data-gaps] li')].map((li) => [li.getAttribute('data-gap-kind'), li.textContent ?? '']);
    const kinds = listed.map(([k]) => k);
    expect(kinds).toEqual(expect.arrayContaining(['collapsed', 'not-loaded', 'truncated']));
    const text = (kind: string, needle: string) => listed.find(([k, t]) => k === kind && (t ?? '').includes(needle));
    expect(text('collapsed', 'spam-bot')).toBeTruthy();
    expect(text('not-loaded', '12 عنصرًا')).toBeTruthy();
    expect(text('collapsed', 'قُرئ 9 من 12')).toBeTruthy();
    const truncated = text('truncated', 'تعليق octo-dev');
    expect(truncated).toBeTruthy();
    const cut = /حُذف (\d+) سطرًا من (\d+)/.exec(truncated?.[1] ?? '');
    expect(Number(cut?.[2]) - Number(cut?.[1])).toBe(DEFAULT_LIMITS.comment);

    // والحزمة نفسها تحمل القسم بالبنود نفسها.
    const preview = ui.preview();
    const section = preview.slice(preview.indexOf(`## ${GAPS_HEADING}`));
    expect(section).toContain('spam-bot');
    expect(section).toContain('12 عنصرًا');
    expect(section).toContain('قُرئ 9 من 12');
    expect(section).toContain(`حُذف ${cut?.[1]} سطرًا من ${cut?.[2]}`);
    expect(section.split('\n').filter((l) => l.startsWith('- **'))).toHaveLength(listed.length);

    // إلغاء التعليق الطويل يُسقط اقتطاعه من القسم (لم يدخل الحزمة)، وتبقى فجوات الجمع.
    const long = [...ui.root().querySelectorAll<HTMLInputElement>('input[data-item^="comment:"]')][1];
    await ui.click(`input[data-item="${long?.getAttribute('data-item')}"]`);
    expect(ui.preview()).not.toContain('حُذف ');
    expect(ui.root().querySelector('[data-gaps] li[data-gap-kind="truncated"]')).toBeNull();
    expect(ui.preview()).toContain('spam-bot');
    ui.manager.stop();
  });

  it('PB-05: تحديث المعاينة عند تبديل خيار أقل من 20ms (الوسيط على 30 تبديلًا، كل العناصر مختارة)', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    const times: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const before = ui.preview();
      const t0 = performance.now();
      ui.item(ITEM.checks)?.click();
      // Preact يعيد الرسم في مهمة صغرى بعد النقر: يُنتظر حتى تتغير المعاينة.
      for (let k = 0; k < 50 && ui.preview() === before; k += 1) await Promise.resolve();
      if (ui.preview() === before) await flush();
      times.push(performance.now() - t0);
      expect(ui.preview()).not.toBe(before);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Infinity;
    console.info(`PB-05 (jsdom): median ${median.toFixed(2)}ms · p95 ${p95.toFixed(2)}ms · max ${sorted.at(-1)?.toFixed(2)}ms (n=${times.length})`);
    expect(median).toBeLessThan(20);
    ui.manager.stop();
  });
});

describe('مقتطفات الأدلة والنسخ', () => {
  it('النص المحدد في تعليق يُضاف مقتطفًا بمصدره، ويدخل الحزمة ويُحذف', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    expect(ui.q<HTMLButtonElement>('[data-action="snippet-add"]')?.disabled).toBe(true);
    const body = document.querySelector('#issuecomment-1001 .js-comment-body') as Element;
    const range = document.createRange();
    range.selectNodeContents(body);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await flush();
    expect(ui.q('[data-pending-selection]')?.textContent).toContain('تعليق reviewer-a');
    await ui.click('[data-action="snippet-add"]');
    expect(ui.item(ITEM.snippet('1'))?.checked).toBe(true);
    expect(ui.preview()).toContain('## مقتطفات الأدلة (1)');
    expect(ui.preview()).toContain('### 1. من تعليق reviewer-a');
    expect(ui.preview()).toContain('unused import useMemo');
    await ui.click('[data-action="snippet-remove"]');
    expect(ui.preview()).not.toContain('## مقتطفات الأدلة');
    ui.manager.stop();
  });

  it('«انسخ الحزمة» ينسخ نص المعاينة كما هو بنقر، ويعلن النجاح؛ ولا طلب شبكة', async () => {
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    await ui.click('[data-action="builder-copy"]');
    expect(ui.copy).toHaveBeenCalledTimes(1);
    expect(ui.copied[0]).toBe(ui.preview());
    expect(ui.q('[data-copy-state]')?.getAttribute('data-copy-state')).toBe('copied');
    expect(fetchSpy).not.toHaveBeenCalled();
    ui.manager.stop();
  });

  it('TEST-SEC-02 (حزمة السياق): رمز محفوظ في الخلفية لا يظهر في الحزمة ولا في واجهتها', async () => {
    const token = fakeToken('K');
    const s = await tokenSystem(() => ({ status: 200, body: {} }));
    await s.store.save(token, 'session');
    await s.port.status();
    const ui = await mounted();
    await ui.click('[data-action="builder-toggle"]');
    expect(ui.preview()).not.toMatch(TOKEN_PATTERN);
    expect(ui.root().innerHTML).not.toMatch(TOKEN_PATTERN);
    ui.manager.stop();
  });
});

describe('الموضع في الصفحة', () => {
  it('صفحة المهمة: الشريط قبل قسم التنبيهات، فلا يفصل بطاقة شرح السجل عن #logs', async () => {
    const { createLogModule } = await import('../../../src/modules/d/log-parser/module');
    const path = await import('node:path');
    const { ROOT } = await import('./helpers');
    window.history.replaceState(null, '', '/microsoft/vscode/actions/runs/39905618450/job/120256773911');
    loadFile(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'));
    const { manager } = await mountModules([createLogModule(), createContextBuilderModule()]);
    const logs = document.getElementById('logs');
    expect(logs?.previousElementSibling?.getAttribute('data-mijhar-host')).toBe('d.log');
    const bar = hostsOf('e.builder')[0];
    expect(bar?.nextElementSibling?.tagName.toLowerCase()).toBe('job-annotations');
    manager.stop();
    window.history.replaceState(null, '', '/octo/demo/pull/4242');
  });
});
