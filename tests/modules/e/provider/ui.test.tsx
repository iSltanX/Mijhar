// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// واجهات طبقة المزوّد (AC-E9 (١) و(٢) و(٧) و(٨)):
//  - تجربة الموافقة: تبيّن ما يُرسل ولأي مزوّد ومودل قبل «إرسال للتحليل»، والنص كاملًا لمن أراد؛ والزر يقبل التفعيل الحقيقي وحده (click() والحدث
//    المُنشأ لا يُصدران شيئًا، ونقرة موثوقة من jsdom تُصدر طلبًا واحدًا)؛ والتركيز عند الفتح على العنوان لا على الزر؛ وصياغة التنقيح بلا ضمان مطلق.
//  - بطاقة المفتاح: طلب التحقق معلن قبل الحفظ، والصيغة تُفحص محليًا، وصلاحية المضيف تُطلب في النقرة نفسها قبل أي await، والمفتاح لا يُعرض بعد حفظه.
//  - «لماذا المفتاح؟»: الأماكن الثلاثة بأمثلة موسومة، والوجهة وما يُرسل وما يبقى دونه، بلا أسعار ولا ميزة لم تُدمج.
// والقبول الحقيقي بالفأرة ولوحة المفاتيح يُقاس في المتصفحات (provider-check.mjs).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ConsentSheet, prepareAnalysis } from '../../../../src/modules/e/provider';
import type { ProviderPort, ProviderStatus } from '../../../../src/modules/e/provider';
import { ProviderHostPermission } from '../../../../src/modules/e/provider/gate';
import { KeySection } from '../../../../src/modules/e/provider/KeySection';
import { ProviderKeyGuide } from '../../../../src/options/guide/ProviderKeyGuide';
import { OptionsApp } from '../../../../src/options/OptionsApp';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { trustedClick } from '../../../shared/trusted-click';
import { memoryArea } from '../../d/token/helpers';
import { NOW, SAMPLES, contextOf } from '../context/samples';
import { fakeKey } from './fixture-provider-mock';

const NO_MONEY = /سعر|أسعار|تكلف|دولار|\$\s?\d|price|cost|budget|ميزاني|فوترة|إنفاق|مجاني/i;
const SCRUB = 'لا يُرفق رمز GitHub، ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال. راجع ما سيُرسل للتأكد.';

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
  const destination = { provider: 'Anthropic', host: 'api.anthropic.com', model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' }, permission: true };
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

describe('بطاقة مفتاح المزوّد (AC-E9 (١) و(٤))', () => {
  const KEY = fakeKey('K');
  const status: ProviderStatus = {
    provider: { id: 'anthropic', title: 'Anthropic', host: 'api.anthropic.com', origin: 'https://api.anthropic.com/*', keyPrefix: 'sk-ant-', verifyRequest: 'طلب واحد GET https://api.anthropic.com/v1/models يقرأ قائمة المودلات المتاحة لمفتاحك، ولا يحمل شيئًا من صفحاتك.' },
    permission: false,
    key: null,
    model: null,
    choice: '',
    models: null,
    retryAt: null,
  };
  function setup(answer = true, { firefox = false, granted = [] as string[] } = {}) {
    const store = new SecretStore({ session: memoryArea(), disk: memoryArea() });
    const perms = fakePermissions(granted);
    perms.answer = answer;
    const permission = new ProviderHostPermission(perms, 'https://api.anthropic.com/*', firefox ? ['websiteContent'] : []);
    const order: string[] = [];
    const save = vi.spyOn(store, 'save').mockImplementation(async (...args) => {
      order.push('save');
      return SecretStore.prototype.save.apply(store, args);
    });
    perms.request.mockImplementation(async (set) => {
      order.push('request');
      if (!perms.answer) return false;
      for (const o of set.origins ?? []) perms.granted.add(o);
      for (const d of set.data_collection ?? []) perms.collected.add(d);
      return true;
    });
    const port: ProviderPort = {
      status: vi.fn(async () => status),
      verify: vi.fn(async () => {
        order.push('verify');
        return { ok: true as const, status: 200, data: { provider: 'anthropic', models: [], readAt: NOW, source: 'https://api.anthropic.com/v1/models', partial: false } };
      }),
      analyze: vi.fn(),
      cancel: vi.fn(),
    };
    act(() => render(<KeySection store={store} port={port} permission={permission} target={firefox ? 'firefox' : 'chromium'} />, container));
    return { store, perms, port, order, save };
  }
  const submit = async (value: string) => {
    $<HTMLInputElement>('#mj-key-input').value = value;
    act(() => void $<HTMLFormElement>('[data-key-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  };

  it('طلب التحقق معلن قبل الحفظ، و«لماذا المفتاح؟» في البطاقة، ولا تكلفة', async () => {
    setup();
    await flush();
    expect($('[data-verify-request]').textContent).toContain('GET https://api.anthropic.com/v1/models');
    expect($('[data-verify-request]').textContent).toContain('لا تبدأ أي تحليل');
    expect($('[data-action="provider-key-guide"]').getAttribute('href')).toBe('#guide/provider-key');
    expect(container.textContent).not.toMatch(NO_MONEY);
  });

  it('صيغة خاطئة تُرفض محليًا: لا حفظ ولا صلاحية ولا طلب', async () => {
    const s = setup();
    await flush();
    await submit('github_pat_notAProviderKey000000000000');
    await flush();
    expect(s.order).toEqual([]);
    expect($('[data-key-message]').textContent).toContain('sk-ant-api');
  });

  it('مفتاح صالح: الصلاحية تُطلب في النقرة نفسها قبل أي حفظ، ثم الحفظ، ثم التحقق المعلن وحده؛ والحقل يُفرَّغ ولا يُعرض المفتاح', async () => {
    const s = setup();
    await flush();
    await submit(KEY);
    // متزامن: طُلبت الصلاحية في معالج الإرسال نفسه، ولم يُحفظ شيء بعد.
    expect(s.order).toEqual(['request']);
    await flush();
    expect(s.order).toEqual(['request', 'save', 'verify']);
    expect(s.port.verify).toHaveBeenCalledTimes(1);
    expect(s.port.analyze).not.toHaveBeenCalled();
    expect($<HTMLInputElement>('#mj-key-input').value).toBe('');
    expect(container.innerHTML).not.toContain(KEY);
    expect((await s.store.read())?.token).toBe(KEY);
  });

  it('رفض الصلاحية: يُحفظ «غير متحقق منه» ولا يُرسل شيء', async () => {
    const s = setup(false);
    await flush();
    await submit(KEY);
    await flush();
    expect(s.order).toEqual(['request', 'save']);
    expect(s.port.verify).not.toHaveBeenCalled();
    expect($('[data-key-message]').textContent).toContain('لم يُتحقق منه');
  });

  it('عائلة Chromium: الطلب صلاحية المضيف وحدها، ولا ذكر لموافقة محتوى المواقع', async () => {
    const s = setup();
    await flush();
    expect(container.querySelector('[data-content-consent]')).toBeNull();
    expect($('[data-provider-permission]').textContent).not.toContain('محتوى المواقع');
    await submit(KEY);
    expect(s.perms.request).toHaveBeenCalledWith({ origins: ['https://api.anthropic.com/*'] });
  });

  it('Firefox (AD-15): الإعلان يذكر موافقة «مشاركة محتوى المواقع» قبل الحفظ، والنقرة نفسها تطلبها مع صلاحية المضيف قبل أي حفظ، ثم الحفظ ثم التحقق', async () => {
    const s = setup(true, { firefox: true });
    await flush();
    const notice = $('[data-content-consent]').textContent ?? '';
    expect(notice).toContain('websiteContent');
    expect(notice).toContain('فلا يُرسل تحليل دونها');
    expect($('[data-provider-permission]').textContent).toContain('غير ممنوحتين');
    await submit(KEY);
    expect(s.order).toEqual(['request']);
    expect(s.perms.request).toHaveBeenCalledTimes(1);
    expect(s.perms.request).toHaveBeenCalledWith({ origins: ['https://api.anthropic.com/*'], data_collection: ['websiteContent'] });
    await flush();
    expect(s.order).toEqual(['request', 'save', 'verify']);
    expect($('[data-provider-permission]').getAttribute('data-provider-permission')).toBe('granted');
    expect($('[data-provider-permission]').textContent).toContain('ممنوحتان');
    expect(s.port.analyze).not.toHaveBeenCalled();
  });

  it('Firefox: صلاحية المضيف وحدها لا تكفي، فتُطلب الموافقتان في نقرة الحفظ؛ ورفضهما يحفظ المفتاح «غير متحقق منه» بلا طلب', async () => {
    const s = setup(false, { firefox: true, granted: ['https://api.anthropic.com/*'] });
    await flush();
    expect($('[data-provider-permission]').getAttribute('data-provider-permission')).toBe('denied');
    await submit(KEY);
    await flush();
    expect(s.order).toEqual(['request', 'save']);
    expect(s.port.verify).not.toHaveBeenCalled();
    expect($('[data-key-message]').textContent).toContain('موافقة مشاركة محتوى المواقع');
  });

  it('Firefox: السحب يسحب صلاحية المضيف وموافقة محتوى المواقع معًا', async () => {
    const s = setup(true, { firefox: true });
    await flush();
    await submit(KEY);
    await flush();
    const revoke = $('[data-action="key-revoke"]');
    expect(revoke.textContent).toContain('محتوى المواقع');
    act(() => revoke.click());
    await flush();
    expect(s.perms.remove).toHaveBeenCalledWith({ origins: ['https://api.anthropic.com/*'], data_collection: ['websiteContent'] });
    expect(s.perms.collected.size).toBe(0);
    expect($('[data-provider-permission]').getAttribute('data-provider-permission')).toBe('denied');
  });

  it('المسح يسرد ما يتعطل وحده: التحليل في أقسامه الثلاثة', async () => {
    setup();
    await flush();
    act(() => $('[data-action="key-clear"]').click());
    expect([...container.querySelectorAll('[data-disables] li')].map((li) => li.textContent)).toEqual(['حلّل الفشل واقترح الإصلاح', 'راجع تغييرات الطلب', 'افهم المشكلة والخطوة التالية']);
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
    expect(text).toContain('api.anthropic.com وحدها');
    expect(text).toContain('لا يُرفق رمز GitHub بالطلب');
    expect(text).toContain('تُنقَّح لاكتشاف الأسرار');
    expect(text).toContain('دون مفتاح');
    expect(text).not.toMatch(NO_MONEY);
    expect(text).not.toContain('نسخ البرومبت');
    const links = [...container.querySelectorAll('a[href^="http"]')].map((a) => a.getAttribute('href') ?? '');
    expect(links.every((href) => href.startsWith('https://privacy.claude.com/'))).toBe(true);
    expect(container.querySelector('[data-retention]')?.textContent).toContain('2026-10-24');
    expect(fetchSpy).not.toHaveBeenCalled();
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
