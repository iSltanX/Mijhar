// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-06 (AC-E7) على مستوى الوحدة: الوحدة مركَّبة في الصفحة كما تركّبها الإضافة، والحافظة محقونة نجاحًا وفشلًا. الشق الحي في المتصفحات الأربعة
// في tests/modules/e/browser/copy-prompt-check.mjs. هنا: الحالات (تحميل ← نجاح بعد نجاح الكتابة وحده ← فشل بسببه وبديله اليدوي بلا تأكيد)، ومطابقة المنسوخ
// لبرومبت القالب المختار، وقائمة القوالب، والتنبيه المختصر للمحتوى الخاص، وغياب صندوق النص، وغياب أي طلب شبكة.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SELECTORS, SelectorsRegistry } from '../../../../src/core';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import { createContextBuilderModule } from '../../../../src/modules/e/builder';
import { COPY_PROMPT_MODULE_ID, createCopyPromptModule, promptFileName } from '../../../../src/modules/e/copy-prompt';
import type { CopyFn, CopyOutcome, CopyPromptSettings } from '../../../../src/modules/e/copy-prompt';
import { COLLECTOR_SELECTORS, limitsOf, prepareContext } from '../../../../src/modules/e/context';
import { PROMPTS, PROMPT_IDS, renderPrompt } from '../../../../src/modules/e/prompt-templates';
import type { PromptId } from '../../../../src/modules/e/prompt-templates';
import { pageAt } from '../helpers';
import { fake } from '../context/samples';
import { COPY_HOST, NOW, SAMPLES, expectedContext, flush, hostsOf, mountOn, view } from './helpers';

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

const settings = (template: CopyPromptSettings['template'] = () => 'auto', lineLimit = () => 400): CopyPromptSettings => ({ template, lineLimit });
const ok: CopyFn = async () => ({ ok: true, via: 'clipboard' });

function recorder(outcome: CopyOutcome = { ok: true, via: 'clipboard' }) {
  const copied: string[] = [];
  const copy = vi.fn<CopyFn>(async (text) => {
    copied.push(text);
    return outcome;
  });
  return { copied, copy };
}

const promptOf = (id: PromptId, sample = SAMPLES.pr): string => {
  const structure = expectedContext(sample);
  if (!structure) throw new Error('لا بنية');
  return renderPrompt(id, structure).text;
};

describe('الحالات: تحميل ثم نجاح بعد نجاح الكتابة وحده', () => {
  it('تظهر حالة التحميل أثناء الكتابة، ولا «تم النسخ» قبل أن تُنجز الحافظة، وبعدها نجاح', async () => {
    let release!: (outcome: CopyOutcome) => void;
    const copy = vi.fn<CopyFn>(() => new Promise<CopyOutcome>((resolve) => (release = resolve)));
    const { manager, errors } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy, settings: settings(), now: () => NOW, successMs: 40 })]);
    const ui = view();
    expect(hostsOf(COPY_HOST)).toHaveLength(1);
    expect(ui.state()).toBe('idle');
    expect(ui.label()).toBe('نسخ البرومبت');

    await ui.click('[data-action="copy-prompt"]');
    expect(copy).toHaveBeenCalledTimes(1);
    expect(ui.state()).toBe('loading');
    expect(ui.label()).toBe('يجهّز البرومبت…');
    expect(ui.q('[data-icon="spinner"]')).not.toBeNull();
    expect(ui.root().textContent).not.toContain('تم النسخ');
    // نقرة ثانية أثناء التحميل لا تبدأ نسخًا آخر.
    await ui.click('[data-action="copy-prompt"]');
    expect(copy).toHaveBeenCalledTimes(1);

    release({ ok: true, via: 'clipboard' });
    await flush();
    expect(ui.state()).toBe('success');
    expect(ui.label()).toBe('تم النسخ');
    expect(ui.q('[data-live]')?.textContent).toBe('تم النسخ');
    // وتعود إلى حالتها الأولى بعد مدة.
    await flush(80);
    expect(ui.state()).toBe('idle');
    expect(errors).toEqual([]);
    manager.stop();
    expect(hostsOf(COPY_HOST)).toHaveLength(0);
  });

  it('المنسوخ هو برومبت القالب التلقائي لنوع الصفحة، كما تبنيه الطبقة بحجب الأسرار وبلا أي شبكة', async () => {
    const r = recorder();
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, settings: settings(), now: () => NOW })]);
    await view().click('[data-action="copy-prompt"]');
    expect(r.copied).toHaveLength(1);
    expect(r.copied[0]).toBe(promptOf('next-step'));
    expect(r.copied[0]).toContain('# تحديد الخطوة التالية: feat: refresh the settings UI');
    expect(r.copied[0]).toContain('## المعلومات الناقصة');
    // AD-30: لا قراءة API في البرومبت (لا تمرّر المرحلة قراءة API إلى الطبقة): المصدر الصفحة وحدها ولا ذكر لـGitHub API.
    expect(r.copied[0]).not.toMatch(/GitHub API|api\.github\.com/);
    expect(fetchSpy).not.toHaveBeenCalled();
    manager.stop();
  });

  it('القالب التلقائي لكل نوع صفحة: طلب الدمج الخطوة التالية، والمشكلة الفهم، ومهمة Actions التشخيص', async () => {
    const heading: Record<string, string> = { pr: '# تحديد الخطوة التالية:', issue: '# فهم المشكلة:', checks: '# تشخيص الخطأ:' };
    for (const key of ['pr', 'issue', 'checks'] as const) {
      const r = recorder();
      const { manager } = await mountOn(SAMPLES[key], [createCopyPromptModule({ copy: r.copy, settings: settings(), now: () => NOW })]);
      expect(hostsOf(COPY_HOST), key).toHaveLength(1);
      await view().click('[data-action="copy-prompt"]');
      expect(r.copied[0], key).toContain(heading[key] as string);
      manager.stop();
    }
  });

  it('القالب الافتراضي من الإعدادات يغلب التلقائي، وحد الأسطر من الإعدادات يمرّ إلى الطبقة', async () => {
    const r = recorder();
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, settings: settings(() => 'handoff', () => 20), now: () => NOW })]);
    await view().click('[data-action="copy-prompt"]');
    const structure = prepareContext(document, new SelectorsRegistry([...DEFAULT_SELECTORS, ...COLLECTOR_SELECTORS]), pageAt(SAMPLES.pr.href), { secrets: 'mask', collectedAt: NOW, limits: limitsOf(20) });
    expect(r.copied[0]).toBe(renderPrompt('handoff', structure!).text);
    expect(r.copied[0]).toContain('# تسليم المهمة لجلسة برمجة:');
    manager.stop();
  });
});

describe('الفشل: يُعلن بسببه ويُعرض البديل اليدوي ولا يظهر التأكيد', () => {
  it('رفض الحافظة: حالة فشل بسببها، بلا «تم النسخ»، وبديل التنزيل ملفًا محليًا بنقر', async () => {
    const r = recorder({ ok: false, reason: 'رفض المتصفح الكتابة إلى الحافظة (اختبار)' });
    const downloaded: Array<{ text: string; name: string }> = [];
    const download = vi.fn(async (text: string, name: string) => {
      downloaded.push({ text, name });
      return 'downloaded' as const;
    });
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, download, settings: settings(), now: () => NOW })]);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('failed');
    expect(ui.label()).toBe('تعذّر النسخ');
    expect(ui.root().textContent).not.toContain('تم النسخ');
    expect(ui.q('[data-reason]')?.textContent).toContain('رفض المتصفح الكتابة إلى الحافظة (اختبار)');
    expect(ui.q('[data-note="failed"]')?.getAttribute('role')).toBe('alert');
    expect(ui.q('[data-live]')?.textContent).toContain('تعذّر النسخ: رفض المتصفح');
    // لا صندوق نص ولا معاينة: البديل زر تنزيل وحده.
    expect(ui.root().querySelector('textarea, input')).toBeNull();
    expect(downloaded).toHaveLength(0);

    await ui.click('[data-action="download-prompt"]');
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0]?.text).toBe(promptOf('next-step'));
    expect(downloaded[0]?.name).toBe('mijhar-prompt-next-step-octo-demo-4242.md');
    expect(ui.q('[data-download="downloaded"]')).not.toBeNull();
    expect(ui.state()).toBe('failed');
    manager.stop();
  });

  it('وعد الحافظة يُرفض بخطأ: فشل بسببه لا تأكيد، ثم نقرة جديدة تنجح', async () => {
    const calls: number[] = [];
    const copy: CopyFn = async () => {
      calls.push(1);
      if (calls.length === 1) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
      return { ok: true, via: 'clipboard' };
    };
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy, settings: settings(), now: () => NOW })]);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('failed');
    expect(ui.q('[data-reason]')?.textContent).toContain('NotAllowedError');
    expect(ui.root().textContent).not.toContain('تم النسخ');
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    expect(ui.q('[data-note="failed"]')).toBeNull();
    manager.stop();
  });

  it('فشل التجهيز نفسه يُعلن بسببه ولا يستدعي الحافظة ولا يعرض بديل تنزيل (لا شيء مجهّز)', async () => {
    const r = recorder();
    const broken: CopyPromptSettings = {
      template: () => 'auto',
      lineLimit: () => {
        throw new Error('عطل مفتعل');
      },
    };
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, settings: broken, now: () => NOW })]);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(r.copy).not.toHaveBeenCalled();
    expect(ui.state()).toBe('failed');
    expect(ui.q('[data-reason]')?.textContent).toContain('تعذّر تجهيز البرومبت (عطل مفتعل)');
    expect(ui.q('[data-action="download-prompt"]')).toBeNull();
    expect(ui.root().textContent).not.toContain('تم النسخ');
    manager.stop();
  });
});

describe('قائمة القوالب', () => {
  it('خمسة قوالب بأوصافها، والحالي معلَّم، والاختيار يغيّر ما يُنسخ لتلك الصفحة وحدها', async () => {
    const r = recorder();
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, settings: settings(), now: () => NOW })]);
    const ui = view();
    expect(ui.q('[data-template-menu]')).toBeNull();
    const more = ui.q('[data-action="template-menu"]');
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    await ui.click('[data-action="template-menu"]');
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    const items = [...ui.root().querySelectorAll<HTMLElement>('[data-template-id]')];
    expect(items.map((el) => el.getAttribute('data-template-id'))).toEqual([...PROMPT_IDS]);
    expect(items.map((el) => el.querySelector('.cp-item-label')?.textContent)).toEqual(PROMPTS.map((p) => p.label));
    expect(items.filter((el) => el.getAttribute('aria-checked') === 'true').map((el) => el.getAttribute('data-template-id'))).toEqual(['next-step']);
    expect(ui.q('[data-template-menu]')?.textContent).toContain('بلا مفتاح ولا إرسال');
    // التركيز على القالب الحالي.
    expect(ui.root().activeElement?.getAttribute('data-template-id')).toBe('next-step');

    await ui.click('[data-template-id="diagnose"]');
    expect(ui.q('[data-template-menu]')).toBeNull();
    expect(ui.q('[data-section="copy-prompt"]')?.getAttribute('data-template')).toBe('diagnose');
    await ui.click('[data-action="copy-prompt"]');
    expect(r.copied[0]).toBe(promptOf('diagnose'));
    expect(r.copied[0]).toContain('# تشخيص الخطأ:');
    manager.stop();
  });

  it('لوحة المفاتيح: الأسهم تنقل التركيز، وEscape تغلق وتعيده إلى السهم، وTab تغلق', async () => {
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW })]);
    const ui = view();
    await ui.click('[data-action="template-menu"]');
    const press = async (key: string) => {
      ui.root().activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await flush();
    };
    const active = () => ui.root().activeElement?.getAttribute('data-template-id');
    expect(active()).toBe('next-step');
    await press('ArrowDown');
    expect(active()).toBe('handoff');
    await press('ArrowDown');
    expect(active()).toBe('understand');
    await press('ArrowUp');
    expect(active()).toBe('handoff');
    await press('Home');
    expect(active()).toBe('understand');
    await press('End');
    expect(active()).toBe('handoff');
    await press('Escape');
    expect(ui.q('[data-template-menu]')).toBeNull();
    expect(ui.root().activeElement?.getAttribute('data-action')).toBe('template-menu');
    await ui.click('[data-action="template-menu"]');
    await press('Tab');
    expect(ui.q('[data-template-menu]')).toBeNull();
    manager.stop();
  });

  it('النقر خارج الزر يغلق القائمة، وتبديل القالب يمحو تأكيد النسخ السابق', async () => {
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW, successMs: 60_000 })]);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    await ui.click('[data-action="template-menu"]');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await flush();
    expect(ui.q('[data-template-menu]')).toBeNull();
    await ui.click('[data-action="template-menu"]');
    await ui.click('[data-template-id="review"]');
    expect(ui.state()).toBe('idle');
    manager.stop();
  });
});

describe('المحتوى الخاص: تنبيه مختصر لا صندوق نص', () => {
  const withSecrets = () => {
    for (const el of document.querySelectorAll('p')) if (el.textContent?.includes('Refresh the settings UI and move')) el.textContent = `Refresh the UI. token ${fake.ghp} and key ${fake.aws}`;
  };

  it('أنماط سرّية في الوصف: تُحجب في المنسوخ ويظهر تنبيه بعددها وأنماطها ولا يظهر أي نص منها', async () => {
    const r = recorder();
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, settings: settings(), now: () => NOW })], withSecrets);
    const ui = view();
    expect(ui.q('[data-note="private"]')).toBeNull();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    const text = r.copied[0] as string;
    expect(text).toContain('[محجوب:');
    for (const secret of [fake.ghp, fake.aws]) expect(text).not.toContain(secret);
    const note = ui.q('[data-note="private"]');
    expect(note).not.toBeNull();
    expect(note?.getAttribute('data-tone')).toBe('warning');
    expect(note?.textContent).toMatch(/حُجب 2 من الأنماط السرّية المحتملة/);
    expect(note?.textContent).toContain('لا يزيل كل سرّ');
    // أسماء الأنماط مختصرة بلا قوسها التفصيلي والعدد قبل كل اسم، وكل بند معزول اتجاهًا.
    expect([...(note?.querySelectorAll('[data-private-item]') ?? [])].map((el) => el.textContent)).toEqual(['1× رمز GitHub', '1× معرّف مفتاح AWS']);
    for (const secret of [fake.ghp, fake.aws]) expect(ui.root().textContent).not.toContain(secret);
    expect(ui.root().querySelector('textarea, input, pre')).toBeNull();
    manager.stop();
  });

  it('بلا أنماط سرّية: لا تنبيه', async () => {
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW })]);
    const ui = view();
    await ui.click('[data-action="copy-prompt"]');
    expect(ui.state()).toBe('success');
    expect(ui.q('[data-note="private"]')).toBeNull();
    manager.stop();
  });
});

describe('الموضع وغياب الشبكة وإعدادات الوحدة', () => {
  it('في صفحة الطلب يوضع بعد بطاقة ملخص الحالة مباشرة (والارتفاعات تُقاس في المتصفحات الحقيقية)', async () => {
    const { manager, errors } = await mountOn(SAMPLES.pr, [
      createPrStatusModule({ debounceMs: 5, fetchDetails: async () => null as never, api: null, staleMs: () => 300_000 }),
      createContextBuilderModule({ now: () => NOW }),
      createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW }),
    ]);
    const hosts = [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host'));
    const card = hosts.indexOf('d.pr-status');
    expect(card).toBeGreaterThanOrEqual(0);
    expect(hosts[card + 1]).toBe(COPY_HOST);
    expect(hosts.filter((h) => h === COPY_HOST)).toHaveLength(1);
    expect(errors).toEqual([]);
    manager.stop();
    expect(document.querySelectorAll('mijhar-host')).toHaveLength(0);
  });

  it('في صفحة المشكلة بعد شريط حزمة السياق', async () => {
    const { manager } = await mountOn(SAMPLES.issue, [createContextBuilderModule({ now: () => NOW }), createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW })]);
    const hosts = [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host'));
    expect(hosts).toEqual(['e.builder', COPY_HOST]);
    manager.stop();
  });

  it('لا تُركَّب في صفحة لا سياق لها (مقارنة وصفحة الصفحة الرئيسية للمستودع)', async () => {
    for (const href of ['https://github.com/octocat/Hello-World/compare/master...octocat-patch-1', 'https://github.com/octo/demo']) {
      const sample = { ...SAMPLES.pr, href };
      const { manager } = await mountOn(sample, [createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW })]);
      expect(hostsOf(COPY_HOST), href).toHaveLength(0);
      manager.stop();
    }
  });

  it('يعمل بالإعدادات الافتراضية بلا تخزين ولا مفاتيح ولا رمز: لا شبكة في الجمع والنسخ', async () => {
    const r = recorder();
    // بلا settings: الوحدة تفتح التخزين كسولًا وتفشل بصمت إلى القيم الافتراضية (لا storage للإضافة في jsdom).
    const { manager, errors } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: r.copy, now: () => NOW })]);
    await view().click('[data-action="copy-prompt"]');
    expect(view().state()).toBe('success');
    expect(r.copied[0]).toBe(promptOf('next-step'));
    expect(errors).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    manager.stop();
  });

  it('إعادة إدراج المضيف إن أزالته الصفحة', async () => {
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: ok, settings: settings(), now: () => NOW })]);
    const host = hostsOf(COPY_HOST)[0] as HTMLElement;
    host.remove();
    await flush(20);
    expect(hostsOf(COPY_HOST)).toHaveLength(1);
    manager.stop();
  });
});

describe('اسم ملف البديل', () => {
  it('القالب والمستودع والرقم بحروف آمنة', () => {
    expect(promptFileName('diagnose', { owner: 'octo', repo: 'de/mo', number: 12 })).toBe('mijhar-prompt-diagnose-octo-de-mo-12.md');
    expect(promptFileName('understand', { owner: null, repo: null, number: null })).toBe('mijhar-prompt-understand.md');
  });

  it('معرّف الوحدة تحت الوحدة (هـ)', () => {
    expect(COPY_PROMPT_MODULE_ID).toBe('e.copy-prompt');
  });
});
