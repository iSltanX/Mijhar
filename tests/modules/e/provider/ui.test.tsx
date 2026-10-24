// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// واجهات طبقة المزوّد (AC-E9 (١) و(٢) و(٧) و(٨)):
//  - تجربة الموافقة: تبيّن ما يُرسل ولأي مزوّد ومودل قبل «إرسال للتحليل»، والنص كاملًا لمن أراد؛ والزر يقبل التفعيل الحقيقي وحده (click() والحدث
//    المُنشأ لا يُصدران شيئًا، ونقرة موثوقة من jsdom تُصدر طلبًا واحدًا)؛ والتركيز عند الفتح على العنوان لا على الزر؛ وصياغة التنقيح بلا ضمان مطلق.
//  - «لماذا المفتاح؟»: الأماكن الثلاثة بأمثلة موسومة، والوجهة وما يُرسل وما يبقى دونه، بلا أسعار ولا ميزة لم تُدمج؛ وأسماء المزوّدين ومضيفاتهم
//    وسياساتهم من السجل الوصفي (AC-E10 (٧)).
// وبطاقة «مزوّد التحليل» الموحّدة في card.test.tsx.
// والقبول الحقيقي بالفأرة ولوحة المفاتيح يُقاس في المتصفحات (provider-check.mjs).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentSheet, prepareAnalysis } from '../../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../../src/modules/e/provider/descriptors/anthropic';
import { OPENAI } from '../../../../src/modules/e/provider/descriptors/openai';
import { ProviderKeyGuide } from '../../../../src/options/guide/ProviderKeyGuide';
import { OptionsApp } from '../../../../src/options/OptionsApp';
import { trustedClick } from '../../../shared/trusted-click';
import { NOW, SAMPLES, contextOf } from '../context/samples';
import { mockDescriptor } from './fixture-provider-mock';

const NO_MONEY = /سعر|أسعار|تكلف|دولار|\$\s?\d|price|cost|budget|ميزاني|فوترة|إنفاق|مجاني/i;
const SCRUB = 'لا يُرفق رمز GitHub ولا مفتاح أي مزوّد آخر، ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال. راجع ما سيُرسل للتأكد.';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

const flush = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await act(async () => {});
};
const $ = <E extends Element = HTMLElement>(sel: string): E => {
  const el = container.querySelector<E>(sel);
  if (!el) throw new Error(`لا عنصر: ${sel}`);
  return el;
};

describe('تجربة الموافقة (AC-E9 (٢) و(٧))', () => {
  const prepared = prepareAnalysis(contextOf(SAMPLES.pr, {}, { collectedAt: NOW }), { template: 'review', task: 'راجع التغييرات.' });
  const destination = { provider: 'Anthropic', host: 'api.anthropic.com', policy: { url: ANTHROPIC.policy.url, label: ANTHROPIC.policy.label }, model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' }, permission: true };
  const show = (over: Partial<Parameters<typeof ConsentSheet>[0]> = {}) => {
    const onConfirm = vi.fn();
    act(() => render(<ConsentSheet prepared={prepared} destination={destination} onConfirm={onConfirm} onCancel={() => {}} onSettings={() => {}} {...over} />, container));
    return onConfirm;
  };

  it('تبيّن قبل الزر ما سيُرسل ولأي مزوّد ومودل ووجهة، والزر «إرسال للتحليل» مربوط بها لتقنيات الإتاحة؛ والتركيز على العنوان', () => {
    show();
    expect($('#mj-consent-title').textContent).toBe('إرسال هذا إلى Anthropic للتحليل؟');
    const lead = $('[data-consent-lead]').textContent ?? '';
    for (const part of ['Anthropic', 'api.anthropic.com', 'Mock Sonnet 2', 'لا يُرسل شيء قبل أن تختار «إرسال للتحليل»']) expect(lead).toContain(part);
    const button = $<HTMLButtonElement>('[data-action="consent-confirm"]');
    expect(button.textContent?.trim()).toBe('إرسال للتحليل');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-describedby')).toBe('mj-consent-lead');
    expect(document.activeElement?.id).toBe('mj-consent-title');
    expect($('[data-consent-row="content"]').textContent).toContain(prepared.consent.parts[0] ?? '');
    expect($('[data-consent-row="size"]').textContent).toMatch(/نحو [\d,]+ حرف في [\d,]+ سطرًا/);
    expect($('[data-consent-row="destination"]').textContent).toContain('api.anthropic.com');
    // سياسة المزوّد الرسمية في الموافقة (O-26)، تُفتح بنقر ولا تُجلب.
    expect($<HTMLAnchorElement>('[data-consent-policy]').getAttribute('href')).toBe(ANTHROPIC.policy.url);
    expect($('[data-consent-policy]').getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('AC-E10 (٥): الوجهة كما ستُرسل فعلًا لمزوّد غير Anthropic، وسبب إعادة العرض حين تغيّر شيء بعده', () => {
    const b = mockDescriptor('mock-b', 'Mock B', false);
    show({ destination: { provider: b.title, host: b.host, model: { id: 'b-model-2', displayName: 'B Model 2' }, permission: true }, changed: 'تغيّر المزوّد المختار أو المودل منذ عُرضت الموافقة؛ هذه الوجهة الآن. لم يُرسل شيء.' });
    expect($('#mj-consent-title').textContent).toBe('إرسال هذا إلى Mock B للتحليل؟');
    expect($('[data-consent-lead]').textContent).toContain('api.mock-b.test');
    expect($('[data-consent-row="destination"]').textContent).toContain('Mock B · B Model 2');
    expect($('[data-consent-changed]').textContent).toContain('لم يُرسل شيء');
    expect(container.textContent).not.toMatch(/Anthropic|anthropic/);
    expect($('[data-consent-note]').textContent).toContain('إن تغيّر أيهما أو تغيّر المحتوى بعد عرض البطاقة لا يُرسل شيء');
  });

  it('صياغة التنقيح بلا ضمان مطلق، ولا سعر ولا تكلفة ولا تنبيه مالي', () => {
    show();
    const text = container.textContent ?? '';
    expect(text).toContain(SCRUB);
    expect(text).not.toContain('أي سرّ آخر');
    expect(text).not.toMatch(NO_MONEY);
  });

  it('«اعرض ما سيُرسل» يعرض النص كما يُرسل حرفيًا', () => {
    show();
    act(() => $('[data-action="consent-preview"]').click());
    const pres = [...container.querySelectorAll('[data-consent-preview] pre')].map((p) => p.textContent);
    expect(pres).toEqual([prepared.system, prepared.prompt]);
  });

  it('التفعيل البرمجي لا يُصدر شيئًا: click() وحدث مُنشأ ولو بنقرة فأرة مزيفة؛ والنقرة الموثوقة وحدها تُصدر طلبًا واحدًا', () => {
    const onConfirm = show();
    const button = $<HTMLButtonElement>('[data-action="consent-confirm"]');
    act(() => button.click());
    act(() => void button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
    act(() => void button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => trustedClick(button));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('معطّل بلا مودل أو بلا صلاحية المضيف أو بموعد إعادة معلن، ويقول السبب', () => {
    show({ destination: { ...destination, model: null } });
    expect($<HTMLButtonElement>('[data-action="consent-confirm"]').disabled).toBe(true);
    render(null, container);
    show({ destination: { ...destination, permission: false } });
    expect($<HTMLButtonElement>('[data-action="consent-confirm"]').disabled).toBe(true);
    expect($('[data-consent-blocked="permission"]').textContent).toContain('api.anthropic.com');
    render(null, container);
    show({ blocked: 'أعلن المزوّد موعدًا لإعادة المحاولة' });
    expect($<HTMLButtonElement>('[data-action="consent-confirm"]').disabled).toBe(true);
  });
});

describe('«لماذا مفتاح مزوّد التحليل؟» (AC-E9 (٨))', () => {
  it('الأماكن الثلاثة بمثال موسوم لكل منها، والوجهة وما يُرسل وما يبقى دونه؛ بلا أسعار ولا روابطها ولا ميزة لم تُدمج', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    act(() => render(<ProviderKeyGuide onBack={() => {}} onAdd={() => {}} />, container));
    const places = [...container.querySelectorAll('[data-place]')];
    expect(places.map((p) => p.getAttribute('data-place'))).toEqual(['d.analysis.checks', 'd.analysis.pr', 'd.analysis.issue']);
    for (const place of places) {
      expect(place.textContent).toContain('احتمال يحتاج تحققًا');
      expect(place.querySelector('.example')?.textContent).toMatch(/^مثال: /);
    }
    const text = container.textContent ?? '';
    expect(text).toContain('مضيف المزوّد الذي اخترته وحده (api.anthropic.com أو api.openai.com)');
    expect(text).toContain('من المزوّد الذي تختاره (Anthropic أو OpenAI)');
    expect(text).toContain('ولا يُرسل مفتاح مزوّد إلى غيره');
    expect(text).toContain('لا يُرفق رمز GitHub بالطلب');
    expect(text).toContain('تُنقَّح لاكتشاف الأسرار');
    expect(text).toContain('دون مفتاح');
    expect(text).not.toMatch(NO_MONEY);
    expect(text).not.toContain('نسخ البرومبت');
    const links = [...container.querySelectorAll('a[href^="http"]')].map((a) => a.getAttribute('href') ?? '');
    expect(links).toEqual([ANTHROPIC.policy.url, OPENAI.policy.url]);
    expect(container.querySelector('[data-retention]')?.textContent).toContain('2026-10-24');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC-E10 (٧): الأسماء والمضيفات والسياسات تُبنى من السجل، فلا تذكر مزوّدًا لم يُدمج ولا تحصر الخدمة في واحد', () => {
    const b = mockDescriptor('mock-b', 'Mock B', false);
    act(() => render(<ProviderKeyGuide onBack={() => {}} onAdd={() => {}} descriptors={[ANTHROPIC, b]} />, container));
    const text = container.textContent ?? '';
    expect(text).toContain('(Anthropic أو Mock B)');
    expect(text).toContain('(api.anthropic.com أو api.mock-b.test)');
    expect([...container.querySelectorAll('[data-retention-provider]')].map((li) => li.getAttribute('data-retention-provider'))).toEqual(['anthropic', 'mock-b']);
    render(null, container);
    act(() => render(<ProviderKeyGuide onBack={() => {}} onAdd={() => {}} />, container));
    expect(container.textContent).not.toMatch(/Gemini|Google/);
  });

  it('يُفتح من #guide/provider-key داخل الإعدادات، و«أضف مفتاحًا» يعود إلى بطاقة المفتاح', async () => {
    history.replaceState(null, '', '#guide/provider-key');
    act(() => render(<OptionsApp settings={() => <section data-section="provider-key"><a data-action="provider-key-guide" href="#guide/provider-key">لماذا المفتاح؟</a></section>} />, container));
    expect(container.querySelector('[data-guide="provider-key"]')).not.toBeNull();
    expect(document.title).toBe('لماذا مفتاح مزوّد التحليل؟ — مِجهَر');
    act(() => $('[data-action="provider-key-add"]').click());
    await flush();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    expect(location.hash).toBe('#provider-key');
    expect(container.querySelector('[data-guide]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-action')).toBe('provider-key-guide');
  });
});
