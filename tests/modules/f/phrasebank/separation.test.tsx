// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/7"}
// TEST-WRITE-05 (AC-F5): واجهة المساعد مقسومة بصريًا وبرمجيًا إلى القسم الثابت المحلي (بلا نموذج ولا شبكة، يعمل مع غياب أي محرك ترجمة) والقسم الاختياري «ترجمة مسودتي» الذي يمر عبر
// تقنيع الرموز وفحصها ومراجعة يدوية قبل الإدراج؛ ولا يتغير سلوك القسم الثابت بوجود هذا الخيار أو غيابه.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeTranslationEngine, setTranslationService } from '../../../../src/modules/c/ui';
import { ROOT, click, field, flush, loadHtml, mountComposer, panelRoot, triggerFor } from '../composer/helpers';
import type { Live } from '../composer/helpers';

const FIXTURE = path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html');
const DRAFT = 'Run `npm test` in src/app.js and read https://example.com/docs before you merge.';
const fetchSpy = vi.fn(async () => new Response(''));

let live: Live | null = null;
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
});
afterEach(() => {
  live?.manager.stop();
  live = null;
  setTranslationService(null);
  vi.unstubAllGlobals();
});

const need = <E extends Element = HTMLElement>(selector: string): E => {
  const el = panelRoot().querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر في اللوحة: ${selector}`);
  return el;
};
const maybe = (selector: string): Element | null => panelRoot().querySelector(selector);
const settle = async (ms = 8): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const type = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(4);
  });
};

async function open(draft = DRAFT): Promise<void> {
  loadHtml(FIXTURE);
  window.history.replaceState({}, '', 'https://github.com/octo/demo/pull/7');
  field('new_comment_field').value = draft;
  live = await mountComposer();
  await click(triggerFor('new_comment_field'), 8);
  await settle();
}

const staticHtml = (): string => need('[data-section="static"]').innerHTML;
const close = (): void => {
  live?.manager.stop();
  live = null;
};

describe('الفصل البصري والبرمجي', () => {
  it('قسمان شقيقان داخل اللوحة: الثابت والاختياري، ولا يحتوي أحدهما الآخر', async () => {
    await open();
    const panel = need('section.panel');
    const sections = [...panel.children].map((el) => (el as HTMLElement).dataset.section).filter(Boolean);
    expect(sections).toEqual(['static', 'translate-draft']);
    expect(need('[data-section="static"]').contains(need('[data-section="translate-draft"]'))).toBe(false);
    expect(need('[data-section="translate-draft"]').contains(need('[data-section="static"]'))).toBe(false);
    expect(need('[data-section="translate-draft"] h3').textContent).toContain('ترجمة مسودتي');
  });

  it('القسم الثابت لا يستورد خدمة الترجمة ولا تقنيع الرموز في أي ملف من ملفاته', () => {
    const files = [
      'src/modules/f/composer/template.ts',
      'src/modules/f/composer/insert.ts',
      'src/modules/f/phrasebank/data.ts',
      'src/modules/f/phrasebank/PhrasebankSection.tsx',
      ...fs.readdirSync(path.join(ROOT, 'src/modules/f/template')).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => `src/modules/f/template/${f}`),
    ];
    for (const file of files) {
      const imports = [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const spec of imports) expect(spec, `${file} يستورد ${spec}`).not.toMatch(/\/c\/(masking|ui)|translate-draft/);
    }
    // وبالمقابل: قسم الترجمة وحده هو الذي يستورد الخدمة والتقنيع.
    const translate = fs.readFileSync(path.join(ROOT, 'src/modules/f/phrasebank/translate-draft.tsx'), 'utf8');
    expect(translate).toMatch(/c\/masking/);
    expect(translate).toMatch(/c\/ui\/service/);
  });
});

describe('غياب أي محرك ترجمة', () => {
  it('القسم الاختياري يعرض «المحرك غير متاح» ولا زر ترجمة، والقسم الثابت يعمل كاملًا بلا شبكة', async () => {
    await open('First line of my draft.');
    const status = need('[data-translate-status]');
    expect(status.dataset.translateStatus).toBe('absent');
    expect(status.textContent).toContain('المحرك غير متاح');
    expect(maybe('[data-action="translate-draft"]')).toBeNull();

    // القسم الثابت: تنظيم ومعاينة وإدراج وتراجع وبنك عبارات.
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Nothing happens');
    expect(need('[data-preview]').textContent).toBe('## Behavior before this change\n\nNothing happens\n');
    await click(need('[data-action="insert-append"]'));
    expect(field('new_comment_field').value).toBe('First line of my draft.\n\n## Behavior before this change\n\nNothing happens\n');
    await click(need('[data-action="undo"]'));
    expect(field('new_comment_field').value).toBe('First line of my draft.');
    await click(need('[data-phrase="q-repro"]'));
    await click(need('[data-action="insert-append"]'));
    expect(field('new_comment_field').value).toContain('هل يمكنك مشاركة خطوات إعادة الإنتاج');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('القسم الثابت متطابق حرفيًا (DOM) سواء غاب المحرك أو حضر جاهزًا أو كان غير متاح', async () => {
    const states: Array<{ name: string; prepare: () => void }> = [
      { name: 'غائب', prepare: () => setTranslationService(null) },
      { name: 'جاهز', prepare: () => setTranslationService(new FakeTranslationEngine()) },
      { name: 'غير متاح', prepare: () => setTranslationService(new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'النموذج لم يُنزَّل' } })) },
    ];
    const snapshots: string[] = [];
    for (const state of states) {
      state.prepare();
      await open('Draft text for the comparison');
      await type(need<HTMLTextAreaElement>('#mj-composer-expected'), 'It works');
      await click(need('[data-category="note"]'));
      await click(need('[data-phrase="n-nit"]'));
      snapshots.push(staticHtml());
      close();
    }
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(snapshots[0]).toBe(snapshots[2]);
    expect(snapshots[0]!.length).toBeGreaterThan(500);
  });

  it('ظهور المحرك أو زواله والمساعد مفتوح يغيّر القسم الاختياري وحده', async () => {
    await open();
    const before = staticHtml();
    expect(need('[data-translate-status]').dataset.translateStatus).toBe('absent');
    await act(async () => {
      setTranslationService(new FakeTranslationEngine());
      await flush(10);
    });
    await settle();
    expect(need('[data-section="translate-draft"]').dataset.service).toBe('ready');
    expect(maybe('[data-action="translate-draft"]')).not.toBeNull();
    expect(staticHtml()).toBe(before);
    await act(async () => {
      setTranslationService(null);
      await flush(10);
    });
    await settle();
    expect(need('[data-section="translate-draft"]').dataset.service).toBe('absent');
    expect(staticHtml()).toBe(before);
  });
});

describe('المحرك غير متاح بسبب', () => {
  it('يعرض السبب صراحةً ولا زر ترجمة', async () => {
    setTranslationService(new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'النموذج لم يُنزَّل بعد' } }));
    await open();
    expect(need('[data-translate-status]').dataset.translateStatus).toBe('unavailable');
    expect(need('[data-translate-status]').textContent).toContain('المحرك غير متاح: النموذج لم يُنزَّل بعد');
    expect(maybe('[data-action="translate-draft"]')).toBeNull();
  });
});

describe('محرك جاهز: ترجمة بنقر صريح مع تقنيع ومراجعة يدوية', () => {
  it('لا استدعاء للمحرك قبل النقر، حتى مع استعمال القسم الثابت كله', async () => {
    const engine = new FakeTranslationEngine();
    setTranslationService(engine);
    await open();
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Something');
    await click(need('[data-phrase="q-clarify"]'));
    await click(need('[data-action="insert-append"]'));
    await click(need('[data-action="undo"]'));
    expect(engine.calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('المسودة تُقنَّع قبل المحرك (الكود والمسار والرابط لا يبلغانه)، والإدراج معطَّل حتى تؤكد المراجعة، ثم يُدرج بلا مسح المسودة ويُتراجع عنه', async () => {
    const engine = new FakeTranslationEngine();
    setTranslationService(engine);
    await open();
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(false);
    await click(need('[data-action="translate-draft"]'));
    await settle();
    expect(engine.calls).toBe(1);
    const sent = engine.received[0]!;
    expect(sent).toMatch(/⟦[A-Z]+_\d+⟧/);
    for (const protectedText of ['npm test', 'src/app.js', 'https://example.com/docs']) expect(sent, protectedText).not.toContain(protectedText);
    // نتيجة سليمة: تظهر للمراجعة بالرموز المفكوكة، ولا يُدرج شيء بعد.
    const result = need('[data-translate-result="translated"]');
    expect(result.querySelector('[data-translated-text]')!.textContent).toContain('npm test');
    expect(result.querySelector('[data-translated-text]')!.textContent).toContain('src/app.js');
    expect(field('new_comment_field').value).toBe(DRAFT);
    const insert = need<HTMLButtonElement>('[data-action="translated-insert-append"]');
    expect(insert.disabled).toBe(true);
    expect(need<HTMLButtonElement>('[data-action="translated-insert-cursor"]').disabled).toBe(true);
    await click(insert);
    expect(field('new_comment_field').value).toBe(DRAFT);
    // المراجعة اليدوية ثم الإدراج.
    await act(async () => {
      need<HTMLInputElement>('[data-option="reviewed"]').click();
      await flush(6);
    });
    expect(insert.disabled).toBe(false);
    await click(need('[data-action="translated-insert-append"]'));
    const value = field('new_comment_field').value;
    expect(value.startsWith(DRAFT)).toBe(true);
    expect(value).toContain('ترجمة: Run `npm test` in src/app.js and read https://example.com/docs before you merge.');
    await click(need('[data-action="undo"]'));
    expect(field('new_comment_field').value).toBe(DRAFT);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('محرك يخلّ بالرموز ← يبقى الأصل مع تنبيه ولا يُعرض نص مشوَّه ولا يُدرج شيء', async () => {
    const engine = new FakeTranslationEngine({ mode: 'drop' });
    setTranslationService(engine);
    await open();
    await click(need('[data-action="translate-draft"]'));
    await settle();
    const warning = need('[data-translate-result="original-kept"]');
    expect(warning.textContent).toContain('أُبقي النص الأصلي حفاظًا على دقة الكود');
    expect(maybe('[data-translated-text]')).toBeNull();
    expect(maybe('[data-action="translated-insert-append"]')).toBeNull();
    expect(field('new_comment_field').value).toBe(DRAFT);
  });

  it('تعطل المحرك يُعرض خطأً صريحًا، والإلغاء أثناء الترجمة يوقفها بلا إدراج', async () => {
    setTranslationService(new FakeTranslationEngine({ mode: 'error' }));
    await open();
    await click(need('[data-action="translate-draft"]'));
    await settle();
    expect(need('[data-translate-result="error"]').textContent).toContain('تعذّرت الترجمة');
    expect(field('new_comment_field').value).toBe(DRAFT);
    close();

    const slow = new FakeTranslationEngine({ delayMs: 200 });
    setTranslationService(slow);
    await open();
    await click(need('[data-action="translate-draft"]'));
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(true);
    await click(need('[data-action="translate-cancel"]'));
    await act(async () => void (await flush(260)));
    expect(maybe('[data-translate-result]')).toBeNull();
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(false);
    expect(field('new_comment_field').value).toBe(DRAFT);
  });

  it('مسودة فارغة ← زر الترجمة معطَّل ولا استدعاء', async () => {
    const engine = new FakeTranslationEngine();
    setTranslationService(engine);
    await open('');
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(true);
    await click(need('[data-action="translate-draft"]'));
    expect(engine.calls).toBe(0);
  });
});
