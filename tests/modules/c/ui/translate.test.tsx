// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/mijhar-demo/issues/7"}
// TEST-TR-01 (AC-C1) وTEST-TR-03 (AC-C3) على محرك الاختبار الوهمي خلف TranslationService، على العينة الإنجليزية (fixture-translate-en.html):
//  - تنجح الترجمة عند الطلب لفقرة README وتعليق ووصف مشكلة ونص محدد؛ وعدّاد استدعاءات المحرك صفر بعد التحميل وقبل أي فعل من المستخدم؛
//  - عرض الأصل مع الترجمة أو التبديل بينهما، والرجوع إلى الأصل بفعل واحد، وإلغاء الترجمة يعيد الصفحة حرفيًا إلى حالتها السابقة؛
//  - الفشل الآمن (الرموز المختلّة تُبقي الأصل مع التنبيه)، وغياب المحرك (ساكنة)، وعدم توفره (سبب صريح بلا استدعاء)، والإلغاء أثناء الترجمة.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INTEGRITY_WARNING } from '../../../../src/modules/c/masking';
import { FakeTranslationEngine, setTranslationService } from '../../../../src/modules/c/ui';
import type { FakeMode } from '../../../../src/modules/c/ui';
import { FIXTURE, barBefore, bars, bodyOf, displayOf, flush, hiddenImportant, hosts, loadHtml, mountTranslate, pageHtml, phase, press, pressMode, protectedIn, translationFor, translations } from './helpers';
import type { Live } from './helpers';
import { barNote } from './helpers';

let live: Live | null = null;
beforeEach(() => loadHtml(FIXTURE));
afterEach(() => {
  live?.manager.stop();
  live = null;
  setTranslationService(null);
});

const README = '[data-case="readme"]';
const ISSUE = '[data-case="issue-description"]';
const COMMENT1 = '[data-case="comment-body-1"]';
const COMMENT2 = '[data-case="comment-body-2"]';
const LEGACY = '[data-case="comment-body-legacy"]';
const README_BLOCKS = 17;

async function mountWith(engine: FakeTranslationEngine | null): Promise<Live> {
  live = await mountTranslate({ service: engine });
  return live;
}
const textOf = (host: HTMLElement | null): string => bodyOf(host!).textContent!.replace(/\s+/g, ' ').trim();

describe('قبل أي فعل من المستخدم (AC-C1)', () => {
  it('أزرار الترجمة فوق كل نص مرسوم، وعدّاد المحرك صفر، والصفحة لا تتغير إلا بالأشرطة', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    // خمسة نصوص: README ووصف المشكلة وتعليقان (React) وتعليق قديم؛ لا شريط لمعاينة المحرر ولا للمتداخل.
    expect(bars()).toHaveLength(5);
    for (const selector of [README, ISSUE, COMMENT1, COMMENT2, LEGACY]) expect(barBefore(selector).localName, selector).toBe('mijhar-host');
    expect(barBefore('[data-case="editor-preview"]')?.localName).not.toBe('mijhar-host');
    expect(engine.calls).toBe(0);
    expect(translations()).toHaveLength(0);
    for (const bar of bars()) {
      expect(phase(bar)).toBe('idle');
      expect(bar.shadowRoot!.querySelector('[data-action="translate"]')).not.toBeNull();
    }
    await flush(40);
    expect(engine.calls).toBe(0);
  });

  it('إضافات عناصر جديدة في الصفحة (تحميل تعليقات) تُعطى أشرطة، ولا استدعاء للمحرك', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const fresh = document.createElement('div');
    fresh.innerHTML = '<div class="comment-body markdown-body" data-case="late"><p>A late comment loaded after the page.</p></div>';
    document.querySelector('#legacy-comment')!.append(fresh);
    await flush(40);
    expect(bars()).toHaveLength(6);
    expect(engine.calls).toBe(0);
  });

  it('شريط README بنص «ترجمة README إلى العربية» وغيره «ترجمة إلى العربية»', async () => {
    await mountWith(new FakeTranslationEngine());
    expect(barBefore(README).shadowRoot!.querySelector('[data-action="translate"]')!.textContent).toBe('ترجمة README إلى العربية');
    expect(barBefore(COMMENT1).shadowRoot!.querySelector('[data-action="translate"]')!.textContent).toBe('ترجمة إلى العربية');
    expect(barBefore(ISSUE).getAttribute('data-mijhar-host')).toBe('c.ui.bar');
  });
});

describe('ترجمة README', () => {
  it('الضغط يترجم كل الفقرات الإنجليزية (وحدها) ويترك العربية والشيفرة', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const bar = barBefore(README);
    await press(bar, 'translate', 80);
    expect(phase(bar)).toBe('done');
    expect(engine.calls).toBe(README_BLOCKS);
    // مضيف ترجمة لكل فقرة، والعربية وكتلة الشيفرة بلا ترجمة.
    expect(document.querySelectorAll(`${README} mijhar-host[data-mijhar-host="c.ui.translation"]`)).toHaveLength(README_BLOCKS);
    expect(translationFor('[data-case="p-arabic"]')).toBeNull();
    expect(translationFor('[data-case="pre"] pre')).toBeNull();
    expect(barNote(bar)).toBe(`تُرجمت ${README_BLOCKS} من ${README_BLOCKS} فقرة.`);
    expect(textOf(translationFor('[data-case="h1"]'))).toBe('ترجمة: Mijhar Demo Project');
  });

  it('العناصر المحمية تعود كما كانت: code وkbd وروابط بعناوينها (نسبية مُحلَّلة) ومسار، وكلها dir=ltr', async () => {
    await mountWith(new FakeTranslationEngine());
    await press(barBefore(README), 'translate', 80);
    expect(protectedIn(translationFor('[data-case="p-code-link"]')!)).toEqual([
      { tag: 'code', type: 'CODE', text: 'npm install', href: null, dir: 'ltr' },
      { tag: 'a', type: 'LINK', text: 'installation guide', href: 'https://github.com/octo/mijhar-demo/blob/main/INSTALL.md', dir: 'ltr' },
    ]);
    const mention = protectedIn(translationFor('[data-case="p-mention-ref-path"]')!);
    expect(mention.map((m) => [m.type, m.text, m.href])).toEqual([
      ['USER', '@octocat', 'https://github.com/octocat'],
      ['REF', '#123', 'https://github.com/octo/mijhar-demo/issues/123'],
      ['PATH', 'src/components/common/Explain.tsx', null],
    ]);
    expect(protectedIn(translationFor('[data-case="p-kbd"]')!).map((m) => [m.tag, m.text])).toEqual([['kbd', 'Alt'], ['kbd', 'H']]);
    expect(protectedIn(translationFor('[data-case="p-time"]')!).map((m) => m.text)).toEqual(['Oct 22, 2026']);
    // الروابط المنسوخة آمنة: rel وبلا أي سمة من صفحة GitHub.
    const link = bodyOf(translationFor('[data-case="p-code-link"]')!).querySelector('a')!;
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect([...link.attributes].map((a) => a.name).sort()).toEqual(['class', 'data-mijhar-protected', 'data-type', 'dir', 'href', 'rel']);
  });

  it('عكس ترتيب الكلمات: كل رمز يصل إلى عنصره، وكلمة «here» برابطين تحتفظ بعنوانيهما', async () => {
    await mountWith(new FakeTranslationEngine({ mode: 'reorder' }));
    await press(barBefore(README), 'translate', 80);
    const here = protectedIn(translationFor('[data-case="p-two-here"]')!);
    expect(here.map((h) => [h.text, h.href])).toEqual([['here', 'https://b.example/two'], ['here', 'https://a.example/one']]);
    expect(textOf(translationFor('[data-case="p-code-link"]'))).toMatch(/^details\. for installation guide the see then first, npm install Run/);
  });

  it('فقرة بصورة: الوسائط لا تُترجم، والأصل يبقى ظاهرًا حتى في «الترجمة فقط»', async () => {
    await mountWith(new FakeTranslationEngine());
    const bar = barBefore(README);
    await press(bar, 'translate', 80);
    await pressMode(bar, 'translation');
    const p = document.querySelector('[data-case="p-badge"]')!;
    expect(hiddenImportant(p)).toBe(false);
    expect(textOf(translationFor('[data-case="p-badge"]'))).toBe('ترجمة: The build badge shows the current state of the main branch.');
  });

  it('فقرة بجمل متعددة تمر بالفحص مرة، ومحرك لا يخل بالرموز لا يُستدعى أكثر من مرة لكل فقرة', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    await press(barBefore(README), 'translate', 80);
    expect(engine.received.filter((t) => t.includes('side panel opens')).length).toBe(1);
  });
});

describe('الأنماط وإلغاء الترجمة (AC-C3)', () => {
  const setup = async (): Promise<{ bar: HTMLElement; pristine: string; engine: FakeTranslationEngine }> => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const bar = barBefore(README);
    const pristine = pageHtml();
    await press(bar, 'translate', 80);
    return { bar, pristine, engine };
  };

  it('الافتراضي «الأصل والترجمة»: الأصل ظاهر والترجمة تحته', async () => {
    const { bar } = await setup();
    expect(bar.shadowRoot!.querySelector('[data-mode="both"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(hiddenImportant(document.querySelector('[data-case="p-code-link"]')!)).toBe(false);
    expect(translationFor('[data-case="p-code-link"]')!.hasAttribute('data-hidden')).toBe(false);
    // الترجمة بعد الفقرة مباشرة، والعنوان بعد غلافه.
    expect(document.querySelector('[data-case="p-code-link"]')!.nextElementSibling).toBe(translationFor('[data-case="p-code-link"]'));
    expect(document.querySelector('[data-case="h1"]')!.parentElement!.nextElementSibling).toBe(translationFor('[data-case="h1"]'));
  });

  it('«الترجمة فقط»: تُخفى الفقرات والعناوين بـdisplay:none !important، والعناصر النصية (li وtd وth) بغلاف مؤقت، وتبقى الترجمة', async () => {
    const { bar } = await setup();
    await pressMode(bar, 'translation');
    expect(bar.shadowRoot!.querySelector('[data-mode="translation"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(hiddenImportant(document.querySelector('[data-case="p-code-link"]')!)).toBe(true);
    expect(hiddenImportant(document.querySelector('[data-case="h1"]')!.parentElement!)).toBe(true);
    for (const name of ['li-simple', 'td-text', 'th']) {
      const el = document.querySelector(`[data-case="${name}"]`)!;
      const wrapper = el.querySelector(':scope > mijhar-original') as HTMLElement;
      expect(wrapper, name).not.toBeNull();
      expect(wrapper.style.getPropertyValue('display'), name).toBe('none');
      expect(translationFor(`[data-case="${name}"]`)!.hasAttribute('data-hidden'), name).toBe(false);
    }
    // العنصر المتداخل: نصه المباشر وحده يُغلَّف، وقائمته الفرعية تبقى كما هي.
    const nested = document.querySelector('[data-case="li-nested"]')!;
    expect(nested.querySelector(':scope > ul')).not.toBeNull();
    expect(nested.querySelector(':scope > mijhar-original')!.textContent).toContain('Configure the build target');
  });

  it('«إظهار الأصل» بنقرة واحدة: الأصل كله ظاهر والترجمة مخفية ومحفوظة، والعودة إلى الترجمة بنقرة بلا استدعاء جديد', async () => {
    const { bar, engine } = await setup();
    const calls = engine.calls;
    await pressMode(bar, 'translation');
    await pressMode(bar, 'original');
    expect(bar.shadowRoot!.querySelector('[data-mode="original"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('mijhar-original')).toHaveLength(0);
    expect([...document.querySelectorAll(`${README} [style]`)].filter((el) => displayOf(el) === 'none')).toEqual([]);
    expect(translations().every((h) => h.hasAttribute('data-hidden'))).toBe(true);
    await pressMode(bar, 'both');
    expect(translations().some((h) => h.hasAttribute('data-hidden'))).toBe(false);
    expect(engine.calls).toBe(calls);
  });

  it('التبديل المتكرر بين الأنماط لا يترك أغلفة ولا أنماطًا زائدة، وكل نمط يعود حرفيًا', async () => {
    const { bar } = await setup();
    const both = pageHtml();
    for (let i = 0; i < 3; i += 1) {
      await pressMode(bar, 'translation');
      await pressMode(bar, 'original');
      await pressMode(bar, 'both');
    }
    expect(pageHtml()).toBe(both);
  });

  it('«إلغاء الترجمة»: تعود الصفحة حرفيًا إلى حالتها قبل الترجمة والشريط إلى زره الأول، من أي نمط', async () => {
    const { bar, pristine } = await setup();
    await pressMode(bar, 'translation');
    await press(bar, 'remove');
    expect(pageHtml()).toBe(pristine);
    expect(translations()).toHaveLength(0);
    expect(phase(bar)).toBe('idle');
    expect(bar.shadowRoot!.querySelector('[data-action="translate"]')).not.toBeNull();
  });

  it('بعد الإلغاء يمكن الترجمة من جديد', async () => {
    const { bar, pristine, engine } = await setup();
    await press(bar, 'remove');
    expect(pageHtml()).toBe(pristine);
    const before = engine.calls;
    await press(bar, 'translate', 80);
    expect(phase(bar)).toBe('done');
    expect(engine.calls).toBe(before + README_BLOCKS);
    expect(translations()).toHaveLength(README_BLOCKS);
  });

  it('إيقاف الوحدة بعد الترجمة (وفي «الترجمة فقط») يعيد الصفحة حرفيًا إلى ما قبل تركيب الوحدة', async () => {
    const pristine = pageHtml();
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const bar = barBefore(README);
    await press(bar, 'translate', 80);
    await pressMode(bar, 'translation');
    live!.manager.stop();
    live = null;
    expect(pageHtml()).toBe(pristine);
    expect(hosts('c.ui.bar')).toHaveLength(0);
    expect(hosts('c.ui.translation')).toHaveLength(0);
  });
});

describe('ترجمة التعليق ووصف المشكلة (AC-C1)', () => {
  it('تعليق: تُترجم فقراته وحدها، وREADME والتعليقات الأخرى لا تُمس', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    await press(barBefore(COMMENT1), 'translate', 60);
    expect(engine.calls).toBe(2);
    expect(textOf(translationFor('[data-case="c1-p1"]'))).toContain('I can reproduce this with v2.0.1-rc.3 on macOS');
    expect(protectedIn(translationFor('[data-case="c1-p2"]')!).map((m) => [m.type, m.text])).toEqual([['REF', '#42']]);
    expect(document.querySelectorAll(`${README} mijhar-host[data-mijhar-host="c.ui.translation"]`)).toHaveLength(0);
    expect(phase(barBefore(COMMENT2))).toBe('idle');
    expect(barNote(barBefore(COMMENT1))).toBe('تُرجمت 2 من 2 فقرة.');
  });

  it('وصف المشكلة (تخطيط React): فقراته تُترجم، وكتلة الشيفرة تبقى', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    await press(barBefore(ISSUE), 'translate', 60);
    expect(engine.calls).toBe(2);
    // macOS من قائمة «لا تُترجم» يكتشفها المقنِّع في النص فتُحمى أيضًا.
    expect(protectedIn(translationFor('[data-case="issue-p1"]')!).map((m) => m.text)).toEqual(['Alt', 'G', 'macOS']);
    expect(protectedIn(translationFor('[data-case="issue-p2"]')!).map((m) => [m.text, m.href])).toEqual([['this repository', 'https://github.com/octo/mijhar-demo']]);
    expect(document.querySelector(`${ISSUE} pre`)!.parentElement!.nextElementSibling).toBeNull();
  });

  it('تعليق بالتخطيط القديم (.comment-body.markdown-body) يُترجم أيضًا', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    await press(barBefore(LEGACY), 'translate', 60);
    expect(engine.calls).toBe(1);
    expect(protectedIn(translationFor('[data-case="legacy-p1"]')!).map((m) => m.text)).toEqual(['main']);
  });

  it('تعليق عربي: لا فقرات قابلة للترجمة، ولا استدعاء للمحرك، وتُعلَن الحال', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const bar = barBefore(COMMENT2);
    await press(bar, 'translate', 40);
    expect(engine.calls).toBe(0);
    expect(phase(bar)).toBe('empty');
    expect(barNote(bar)).toContain('لا نص إنجليزي للترجمة هنا');
    expect(bar.shadowRoot!.querySelector('[data-action="translate"]')).not.toBeNull();
  });
});

describe('الفشل الآمن (AC-C2 عبر الواجهة)', () => {
  const run = async (mode: FakeMode) => {
    const engine = new FakeTranslationEngine({ mode });
    await mountWith(engine);
    const bar = barBefore(README);
    await press(bar, 'translate', 100);
    return { engine, bar };
  };

  it.each(['drop', 'duplicate', 'invent', 'garble'] as const)('محرك %s: فقرات الرموز تبقى بأصلها مع التنبيه الحرفي، وغيرها تُترجم، ولا نص مشوَّه يُعرض', async (mode) => {
    const { bar } = await run(mode);
    const warnings = hosts('c.ui.translation').filter((h) => h.getAttribute('data-kind') === 'warning');
    const translated = hosts('c.ui.translation').filter((h) => h.getAttribute('data-kind') === 'translation');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length + translated.length).toBe(README_BLOCKS);
    for (const w of warnings) expect(w.shadowRoot!.querySelector('[role="note"]')!.textContent).toBe(INTEGRITY_WARNING);
    // لا نص مترجم يحوي رمزًا مقنَّعًا أو اسم رمز معرَّبًا.
    for (const t of translated) expect(textOf(t)).not.toMatch(/⟦|⟧|\[كود_/);
    expect(barNote(bar)).toContain(`وأُبقي الأصل في ${warnings.length} لسلامة الرموز المحمية`);
    // الأصل الذي أُبقي لا يُخفى حتى في «الترجمة فقط».
    await pressMode(bar, 'translation');
    expect(hiddenImportant(document.querySelector('[data-case="p-code-link"]')!)).toBe(false);
    // محرك invent يختلق رمزًا في كل فقرة فتُبقى كلها؛ وغيره يُبقي فقرات الرموز وحدها فتُخفى الأصول المترجمة (العنوان) في «الترجمة فقط».
    expect(hiddenImportant(document.querySelector('[data-case="h1"]')!.parentElement!)).toBe(mode !== 'invent');
    if (mode === 'invent') expect(translated).toHaveLength(0);
  });

  it('محرك يخل بالرموز على الفقرة كاملة وينجح جملةً جملةً: تُعرض الترجمة بعد إعادة واحدة', async () => {
    const { engine } = await run('flaky-whole');
    const multi = textOf(translationFor('[data-case="p-sentences"]'));
    expect(multi).toContain('ترجمة: The side panel opens from the toolbar.');
    // فقرة «p-sentences» أرسلت كاملة ثم جملةً جملةً (3)، فتزيد الاستدعاءات على عدد الفقرات.
    expect(engine.calls).toBeGreaterThan(README_BLOCKS);
  });

  it('تعطل المحرك: رسالة الخطأ في الشريط وتبقى الصفحة كما هي ويمكن إعادة المحاولة', async () => {
    const { bar } = await run('error');
    expect(phase(bar)).toBe('error');
    expect(barNote(bar)).toBe('تعذّرت الترجمة: تعطل محرك الاختبار الوهمي.');
    expect(translations()).toHaveLength(0);
    expect(bar.shadowRoot!.querySelector('[data-action="translate"]')).not.toBeNull();
  });
});

describe('الإلغاء أثناء الترجمة', () => {
  it('زر «إلغاء» يوقف الطلب ويزيل ما بُني ويعيد الصفحة حرفيًا، ويمكن البدء من جديد', async () => {
    const engine = new FakeTranslationEngine({ delayMs: 30 });
    await mountWith(engine);
    const bar = barBefore(README);
    const pristine = pageHtml();
    await act(async () => {
      bar.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="translate"]')!.click();
      await flush(75);
    });
    expect(phase(bar)).toBe('working');
    expect(barNote(bar)).toMatch(/^جارٍ الترجمة… \d+ من 17$/);
    expect(bar.shadowRoot!.querySelector('progress')).not.toBeNull();
    const callsAtCancel = engine.calls;
    await press(bar, 'cancel', 5);
    await flush(120);
    expect(phase(bar)).toBe('idle');
    expect(translations()).toHaveLength(0);
    expect(pageHtml()).toBe(pristine);
    // لا استدعاءات بعد الإلغاء (ما كان معلّقًا أُلغي).
    expect(engine.calls).toBeLessThanOrEqual(callsAtCancel + 1);
    engine.delayMs = 0;
    await press(bar, 'translate', 80);
    expect(phase(bar)).toBe('done');
  });

  it('إيقاف الوحدة أثناء الترجمة يوقف المحرك ويعيد الصفحة حرفيًا', async () => {
    const pristine = pageHtml();
    const engine = new FakeTranslationEngine({ delayMs: 30 });
    await mountWith(engine);
    await act(async () => {
      barBefore(README).shadowRoot!.querySelector<HTMLButtonElement>('[data-action="translate"]')!.click();
      await flush(75);
    });
    const calls = engine.calls;
    live!.manager.stop();
    live = null;
    await flush(150);
    expect(pageHtml()).toBe(pristine);
    expect(engine.calls).toBeLessThanOrEqual(calls + 1);
  });
});

describe('غياب المحرك أو عدم توفره', () => {
  it('لا محرك مسجَّل: الوحدة ساكنة تمامًا — لا شريط ولا مضيف ولا تغيير في الصفحة', async () => {
    const before = pageHtml();
    await mountWith(null);
    await flush(50);
    expect(hosts('c.ui.bar')).toHaveLength(0);
    expect(document.querySelectorAll('mijhar-host')).toHaveLength(0);
    expect(pageHtml()).toBe(before);
    expect(live!.errors).toEqual([]);
  });

  it('تسجيل المحرك لاحقًا (بـsetTranslationService) يُظهر الأشرطة، وإزالته تُزيلها وتعيد الصفحة', async () => {
    const before = pageHtml();
    live = await mountTranslate();
    expect(bars()).toHaveLength(0);
    const engine = new FakeTranslationEngine();
    await act(async () => {
      setTranslationService(engine);
      await flush(40);
    });
    expect(bars()).toHaveLength(5);
    await press(barBefore(COMMENT1), 'translate', 60);
    expect(translations().length).toBe(2);
    await act(async () => {
      setTranslationService(null);
      await flush(40);
    });
    expect(bars()).toHaveLength(0);
    expect(translations()).toHaveLength(0);
    expect(pageHtml()).toBe(before);
  });

  it('محرك غير متاح: الأشرطة تظهر، والضغط يعرض السبب صراحةً بلا أي استدعاء ولا ترجمة', async () => {
    const reason = 'Translator API غير مدعومة في هذا المتصفح';
    const engine = new FakeTranslationEngine({ availability: { state: 'unavailable', reason } });
    await mountWith(engine);
    expect(bars()).toHaveLength(5);
    expect(barNote(barBefore(README))).toBe(`المحرك غير متاح: ${reason}`);
    await press(barBefore(README), 'translate', 40);
    expect(barNote(barBefore(README))).toBe(`المحرك غير متاح: ${reason}`);
    expect(engine.calls).toBe(0);
    expect(translations()).toHaveLength(0);
  });

  it('محرك يصير جاهزًا بعد أن كان غير متاح: عند الضغط يُعاد فحص التوفر ويعمل', async () => {
    const engine = new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'يحمّل النموذج' } });
    await mountWith(engine);
    engine.availabilityState = { state: 'ready' };
    await press(barBefore(COMMENT1), 'translate', 60);
    expect(translations().length).toBe(2);
    expect(barNote(barBefore(COMMENT1))).toBe('تُرجمت 2 من 2 فقرة.');
  });
});

describe('إمكانية الوصول والأمان', () => {
  it('الأزرار أزرار أصلية بأسماء، والحالة تُعلَن، ولا innerHTML من نص الصفحة أو المحرك', async () => {
    const engine = new FakeTranslationEngine();
    await mountWith(engine);
    const bar = barBefore(COMMENT1);
    expect(bar.shadowRoot!.querySelector('.bar')!.getAttribute('role')).toBe('group');
    expect(bar.shadowRoot!.querySelector('.bar')!.getAttribute('aria-label')).toBe('ترجمة تقنية إلى العربية');
    await press(bar, 'translate', 60);
    for (const button of bar.shadowRoot!.querySelectorAll('button')) {
      expect(button.getAttribute('type')).toBe('button');
      expect((button.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
    expect(bar.shadowRoot!.querySelector('[data-note]')!.getAttribute('role')).toBe('status');
    expect(bar.shadowRoot!.querySelectorAll('[aria-pressed]')).toHaveLength(3);
    // مخرج المحرك نص فقط: مخرج يحوي وسومًا لا يصير عناصر.
    engine.translate = async (masked) => `<img src=x onerror=alert(1)> ${masked}`;
    await press(bar, 'remove', 20);
    await press(bar, 'translate', 60);
    for (const host of translations()) expect(host.shadowRoot!.querySelector('img')).toBeNull();
    expect(textOf(translationFor('[data-case="c1-p1"]'))).toContain('<img src=x onerror=alert(1)>');
  });

  it('لا يُرسَل شيء من الصفحة إلا إلى المحرك المحقون: لا fetch ولا XMLHttpRequest ولا sendBeacon أثناء الترجمة', async () => {
    const calls: string[] = [];
    const w = window as unknown as Record<string, unknown>;
    const saved = { fetch: w.fetch, xhr: w.XMLHttpRequest, beacon: navigator.sendBeacon };
    w.fetch = (() => (calls.push('fetch'), Promise.reject(new Error('blocked')))) as never;
    w.XMLHttpRequest = function () {
      calls.push('xhr');
    } as never;
    (navigator as unknown as Record<string, unknown>).sendBeacon = () => (calls.push('beacon'), false);
    try {
      await mountWith(new FakeTranslationEngine());
      await press(barBefore(README), 'translate', 80);
      expect(translations()).toHaveLength(README_BLOCKS);
      expect(calls).toEqual([]);
    } finally {
      w.fetch = saved.fetch;
      w.XMLHttpRequest = saved.xhr;
      (navigator as unknown as Record<string, unknown>).sendBeacon = saved.beacon;
    }
  });
});
