// @vitest-environment jsdom
// بطاقة «مزوّد التحليل» الموحّدة (TEST-AI-05 في الواجهة، وجزء الصلاحيات من TEST-AI-06؛ AC-E10 (٢) و(٣) و(٤) و(٦) و(٧)) — محاكاة: Anthropic ومحوّلان وهميان
// في السجل الوصفي، ومخزن مستقل لكل مزوّد، ومنفذ خلفية وهمي يحتفظ بحالة كل مزوّد. والقبول الحقيقي في المتصفحات في provider-check.mjs وFirefox بنافذته
// الأصلية في evidence/T-11.10.
//  - بطاقة واحدة فيها قائمة المزوّد ومفتاح المختار وحالته وموضع حفظه وأزراره ومودله وقواعده، ولا قسم «إعدادات التحليل» منفصل.
//  - تغيير المزوّد يعرض مفتاحه ومودلاته وحالته هو، ولا يقرأ مخزن غيره ولا يكتبه؛ والحفظ في مخزن المختار وحده بصلاحية مضيفه في النقرة نفسها.
//  - DEC-13 ن-5 (Model field، O-28): حقل النموذج اليدوي هو الأساس ويُحفظ لمزوّده وإن لم يكن في القائمة؛ وزر + بنقرة موثوقة يعرض القائمة أو يجلبها
//    بطلب التحقق نفسه، والاختيار يملأ الحقل ويغلقها، وتعذّر الجلب لا يعطّل الحقل؛ و«اختبر النموذج» اختياري للنموذج المكتوب حيث يدعمه المحوّل،
//    ونتيجته (قبول أو رفض أو لم يُحسم) للنموذج المكتوب وحده؛ والحقل الفارغ وحده BLK-MODEL-COMPAT.
//  - Firefox: الموافقة الواحدة تُطلب مع مضيف المختار، وسحب المضيف يخصه وسحب الموافقة يخص الكل؛ والبطاقة تذكر تسمية Firefox «مطوِّر الامتداد».
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { SecretStore } from '../../../../src/core/connections/secrets';
import type { ConnectionStatus } from '../../../../src/core/connections/health';
import { PROVIDER_ID_KEY, defineProviderSettings, modelSettingKey, providerInfo } from '../../../../src/modules/e/provider';
import type { ModelTest, ModelsList, ProviderDescriptor, ProviderModel, ProviderPort, ProviderStatus } from '../../../../src/modules/e/provider';
import { ANTHROPIC } from '../../../../src/modules/e/provider/descriptors/anthropic';
import { ProviderCard } from '../../../../src/modules/e/provider/ProviderCard';
import { SETTINGS_SECTIONS } from '../../../../src/options/sections';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { trustedClick } from '../../../shared/trusted-click';
import { memoryArea } from '../../d/token/helpers';
import { fakeKey, fakeMockKey, mockDescriptor } from './fixture-provider-mock';

const NO_MONEY = /سعر|أسعار|تكلف|دولار|\$\s?\d|price|cost|budget|ميزاني|فوترة|إنفاق|مجاني/i;
const NOW = 1_800_000_000_000;
const B = mockDescriptor('mock-b', 'Mock B', false);
const C = mockDescriptor('mock-c', 'Mock C', true);
const DESCRIPTORS: readonly ProviderDescriptor[] = [ANTHROPIC, B, C];

const model = (id: string, compatibility: ProviderModel['compatibility']): ProviderModel => ({ id, displayName: id.toUpperCase(), createdAt: null, line: null, maxTokens: null, maxInputTokens: null, lifecycle: 'active', compatibility });
const LISTS: Readonly<Record<string, readonly ProviderModel[]>> = {
  anthropic: [model('a-model-1', 'declared'), model('a-model-2', 'declared')],
  'mock-b': [model('b-model-1', 'declared'), model('b-model-2', 'unknown')],
  'mock-c': [model('c-model-x', 'unknown'), model('c-model-y', 'unknown')],
};

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
  vi.restoreAllMocks();
});

const flush = async (n = 25) => {
  for (let i = 0; i < n; i += 1) await act(async () => {});
};
const $ = <E extends Element = HTMLElement>(sel: string): E => {
  const el = container.querySelector<E>(sel);
  if (!el) throw new Error(`لا عنصر: ${sel}`);
  return el;
};

/** ما يردّ به المزوّد الوهمي على «اختبر النموذج» لكل معرّف (والباقي يُقبل). */
const TEST_REPLIES: Readonly<Record<string, Pick<ModelTest, 'verdict' | 'status' | 'message'>>> = {
  'c-gone': { verdict: 'rejected', status: 404, message: 'غير متاح لمفتاحك.' },
  'c-busy': { verdict: 'inconclusive', status: 429, message: 'تجاوز المفتاح حد الطلبات' },
};

async function setup({ firefox = false, granted = [] as string[], answer = true, collected = [] as string[], listFails = false } = {}) {
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, DESCRIPTORS)));
  // كل حفظ بوقته (بالملّي ثانية)، فيُعرف استبدال المفتاح.
  let tick = 0;
  const stores = new Map(DESCRIPTORS.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: memoryArea(), now: () => NOW + (tick += 1) })]));
  const touched: string[] = [];
  // ما تقرؤه الخلفية الوهمية (حالة كل مزوّد في الملخص) لا يُحسب: المقيس ما تمسه البطاقة نفسها.
  const backgroundInfo = new Map(DESCRIPTORS.map((d) => [d.id, SecretStore.prototype.info.bind(stores.get(d.id) as SecretStore)]));
  for (const [id, store] of stores) {
    for (const op of ['info', 'save', 'clear'] as const) {
      const original = store[op].bind(store) as (...a: unknown[]) => Promise<unknown>;
      (vi.spyOn(store, op) as unknown as { mockImplementation(f: (...a: unknown[]) => Promise<unknown>): void }).mockImplementation(async (...args: unknown[]) => {
        touched.push(`${op}:${id}`);
        return original(...args);
      });
    }
  }
  const perms = fakePermissions(granted);
  perms.answer = answer;
  for (const d of collected) perms.collected.add(d);
  const order: string[] = [];
  perms.request.mockImplementation(async (set) => {
    order.push(`request:${(set.origins ?? []).join(',')}${set.data_collection ? `+${set.data_collection.join(',')}` : ''}`);
    if (!perms.answer) return false;
    for (const o of set.origins ?? []) perms.granted.add(o);
    for (const d of set.data_collection ?? []) perms.collected.add(d);
    return true;
  });
  const lists = new Map<string, ModelsList>();
  const tests = new Map<string, ModelTest>();
  const health = new Map<string, ConnectionStatus['health']>();
  const fail = { list: listFails };
  const statusOf = async (id: string): Promise<ProviderStatus> => {
    const d = DESCRIPTORS.find((x) => x.id === id) as ProviderDescriptor;
    const info = await backgroundInfo.get(id)?.();
    const key: ConnectionStatus = { id: 'provider-key', provider: id, place: info?.place ?? null, savedAt: info?.savedAt ?? null, health: info ? (health.get(id) ?? 'unverified') : 'none', checkedAt: null, detail: {} };
    const models = lists.get(id) ?? null;
    const choice = settings.get<string>(modelSettingKey(id));
    // كالخلفية (DEC-13 ن-5): ما في الحقل كما هو، ونتيجة الاختبار للنموذج المكتوب وبالمفتاح الحالي وحدهما.
    const test = tests.get(id);
    return {
      provider: providerInfo(d),
      selected: settings.get(PROVIDER_ID_KEY) === id,
      permission: perms.granted.has(d.origin) && (!firefox || perms.collected.has('websiteContent')),
      hostPermission: perms.granted.has(d.origin),
      contentPermission: firefox ? perms.collected.has('websiteContent') : null,
      key,
      model: choice ? { id: choice, displayName: models?.models.find((m) => m.id === choice)?.displayName ?? choice } : null,
      choice,
      models,
      test: test && test.model === choice && test.keySavedAt === info?.savedAt ? test : null,
      retryAt: null,
      providers: await Promise.all(DESCRIPTORS.map(async (x) => ({ id: x.id, title: x.title, host: x.host, health: (await backgroundInfo.get(x.id)?.()) ? (health.get(x.id) ?? 'unverified') : ('none' as const) }))),
    };
  };
  const port: ProviderPort = {
    status: vi.fn(async (id?: string) => statusOf(id ?? settings.get<string>(PROVIDER_ID_KEY))),
    verify: vi.fn(async (id: string, options?: { suggest?: boolean }) => {
      order.push(`verify:${id}${options?.suggest === false ? ':list' : ''}`);
      if (fail.list) return { ok: false as const, failure: 'network' as const, status: null, message: 'لا اتصال', retryAt: null };
      const list: ModelsList = { provider: id, models: LISTS[id] ?? [], readAt: NOW, source: `https://${DESCRIPTORS.find((d) => d.id === id)?.host}/models`, partial: false };
      lists.set(id, list);
      health.set(id, 'healthy');
      // اقتراح الخلفية في الحقل الفارغ: أول نموذج معلن التوافق، ولا اقتراح لزر +.
      const first = list.models.find((m) => m.compatibility === 'declared');
      if (options?.suggest !== false && !settings.get<string>(modelSettingKey(id)) && first) await settings.set(modelSettingKey(id), first.id);
      return { ok: true as const, status: 200, data: list };
    }),
    probe: vi.fn(async (id: string, m: string) => {
      order.push(`probe:${id}:${m}`);
      const info = await backgroundInfo.get(id)?.();
      const reply = TEST_REPLIES[m] ?? { verdict: 'accepted' as const, status: 200, message: '' };
      const test: ModelTest = { provider: id, model: m, keySavedAt: info?.savedAt ?? 0, ...reply, at: NOW };
      tests.set(id, test);
      return { ok: true as const, data: test };
    }),
    analyze: vi.fn(),
    cancel: vi.fn(),
  };
  act(() => render(<ProviderCard settings={settings} port={port} stores={(id) => stores.get(id) as SecretStore} permissions={perms} target={firefox ? 'firefox' : 'chromium'} descriptors={DESCRIPTORS} now={() => NOW} />, container));
  await flush();
  const choose = async (id: string) => {
    const select = $<HTMLSelectElement>('[data-provider-select]');
    select.value = id;
    act(() => void select.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
  };
  const submit = async (value: string) => {
    $<HTMLInputElement>('#mj-key-input').value = value;
    act(() => void $<HTMLFormElement>('[data-key-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  };
  /** يكتب في حقل النموذج ثم يغادره (فيُحفظ كما عند مغادرة الحقل). */
  const type = async (value: string) => {
    const field = $<HTMLInputElement>('[data-model-input]');
    field.value = value;
    act(() => void field.dispatchEvent(new Event('input', { bubbles: true })));
    // كالمتصفح: blur ثم focusout (preact/compat يربط onBlur بالثاني).
    act(() => {
      field.dispatchEvent(new FocusEvent('blur'));
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();
  };
  return { settings, stores, perms, port, order, touched, choose, submit, type, lists, tests, fail };
}

describe('AC-E10 (٣): بطاقة واحدة لا بطاقة لكل مزوّد', () => {
  it('قائمة المزوّد بحالة مفتاح كلٍّ منهم، ومفتاح المختار وحالته وموضع حفظه وأزراره وحقل النموذج وزر + والقواعد في بطاقة واحدة؛ ولا قسم «إعدادات التحليل» منفصل', async () => {
    const s = await setup();
    await s.stores.get('mock-b')?.save(fakeMockKey('mock-b'), 'session');
    await s.choose('mock-c');
    await s.choose('anthropic');
    expect(container.querySelectorAll('[data-provider-card]')).toHaveLength(1);
    expect([...$<HTMLSelectElement>('[data-provider-select]').options].map((o) => [o.value, o.textContent])).toEqual([
      ['anthropic', 'Anthropic — المفتاح: لم يُضف'],
      ['mock-b', 'Mock B — المفتاح: غير متحقق منه'],
      ['mock-c', 'Mock C — المفتاح: لم يُضف'],
    ]);
    for (const sel of ['[data-provider-key]', '[data-key-state]', '[data-key-form] input[name="mj-key-place"]', '[data-action="key-save"]', '[data-model-input]', '[data-action="model-list"]', '[data-provider-rules]']) {
      expect(container.querySelector(sel), sel).not.toBeNull();
    }
    expect($('h3').textContent).toBe('مزوّد التحليل');
    expect($('[data-provider-key] h4').textContent).toBe('مفتاح Anthropic');
    expect($('[data-provider-policy]').getAttribute('href')).toBe(ANTHROPIC.policy.url);
    expect(SETTINGS_SECTIONS.map((section) => section.id)).not.toContain('e-provider');
    expect(container.textContent).not.toMatch(NO_MONEY);
  });

  it('المزوّدون الآخرون في القائمة بحالة مفاتيحهم، وحذف مفتاح أو سحب صلاحية يخص مزوّده وحده', async () => {
    const s = await setup();
    await s.stores.get('mock-b')?.save(fakeMockKey('mock-b'), 'session');
    await s.choose('mock-c');
    await s.choose('anthropic');
    const note = $('[data-other-providers]').textContent ?? '';
    expect(note).toContain('Mock B — مفتاح غير متحقق منه');
    expect(note).toContain('Mock C — لا مفتاح');
    expect(note).toContain('يخص مزوّده وحده');
  });
});

describe('AC-E10 (٢) و(٣): تغيير المزوّد يعرض ما يخصه ولا يمس غيره', () => {
  it('التبديل إلى مزوّد بلا مفتاح: مفتاحه وحالته ومضيفه وقائمة مودله غير المقروءة، دون قراءة مخزن غيره أو كتابته (O-24)', async () => {
    const s = await setup();
    await s.stores.get('anthropic')?.save(fakeKey('Z'), 'session');
    s.touched.length = 0;
    await s.choose('mock-b');
    expect(s.settings.get(PROVIDER_ID_KEY)).toBe('mock-b');
    expect($('[data-provider-key] h4').textContent).toBe('مفتاح Mock B');
    expect($('[data-provider-key]').getAttribute('data-health')).toBe('none');
    expect($('[data-key-state]').textContent).toBe('لا مفتاح محفوظ لـMock B');
    expect($('[data-provider-meta]').textContent).toContain('api.mock-b.test');
    expect($('[data-verify-request]').textContent).toContain('https://api.mock-b.test/models');
    // O-24: الحقل يعمل بلا مفتاح، وزر + معطّل بسببه في النص المساعد، ولا اختبار لمزوّد لا يدعمه محوّله.
    const field = $<HTMLInputElement>('[data-model-input]');
    expect(field.disabled).toBe(false);
    expect(field.value).toBe('');
    expect(field.getAttribute('data-setting')).toBe('e.provider.model.mock-b');
    expect($('[data-action="model-list"]').getAttribute('aria-disabled')).toBe('true');
    expect($('[data-action="model-list"]').getAttribute('aria-label')).toBe('اعرض نماذج Mock B للاختيار');
    expect($('[data-model-help]').textContent).toBe('يمكنك كتابة المعرّف الآن؛ وتظهر قائمة Mock B بعد إضافة مفتاحه والتحقق منه.');
    expect($('[data-model-blocked]').textContent).toContain('حقل النموذج فارغ: لا تحليل عند Mock B');
    expect(container.querySelector('[data-action="model-test"]')).toBeNull();
    expect(s.touched.filter((t) => !t.endsWith(':mock-b'))).toEqual([]);
    expect((await s.stores.get('anthropic')?.read())?.token).toBeDefined();
  });

  it('الحفظ لمزوّد: صيغته هو، وصلاحية مضيفه وحده في النقرة نفسها قبل أي حفظ، ثم مخزنه وحده ثم تحققه؛ والمفتاح لا يُعرض', async () => {
    const s = await setup();
    await s.choose('mock-b');
    await s.submit(fakeKey('X'));
    await flush();
    expect(s.order).toEqual([]);
    expect($('[data-key-message]').textContent).toBe('لا يطابق صيغة مفتاح Mock B.');
    const key = fakeMockKey('mock-b', 'q');
    await s.submit(key);
    expect(s.order).toEqual(['request:https://api.mock-b.test/*']);
    await flush();
    expect(s.order).toEqual(['request:https://api.mock-b.test/*', 'verify:mock-b']);
    expect(s.touched.filter((t) => t.startsWith('save:'))).toEqual(['save:mock-b']);
    expect((await s.stores.get('mock-b')?.read())?.token).toBe(key);
    expect(await s.stores.get('anthropic')?.read()).toBeNull();
    expect($<HTMLInputElement>('#mj-key-input').value).toBe('');
    expect(container.innerHTML).not.toContain(key);
    expect($('[data-key-message]').textContent).toContain('قبِل Mock B المفتاح');
  });

  it('حقل النموذج لكل مزوّد في مفتاحه، والاقتراح بعد التحقق من المعلن توافقه وحده؛ والتبديل يعرض حقل المختار', async () => {
    const s = await setup({ granted: [ANTHROPIC.origin, B.origin, C.origin] });
    await s.submit(fakeKey('A'));
    await flush();
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('a-model-1');
    await s.choose('mock-b');
    await s.submit(fakeMockKey('mock-b'));
    await flush();
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('b-model-1');
    await s.type('my-new-model-2027');
    expect(s.settings.get(modelSettingKey('mock-b'))).toBe('my-new-model-2027');
    expect(s.settings.get(modelSettingKey('anthropic'))).toBe('a-model-1');
    // C لا تعلن واجهته توافقًا: لا اقتراح، والحقل فارغ معلَّلًا ولا يُخمَّن نموذج.
    await s.choose('mock-c');
    await s.submit(fakeMockKey('mock-c'));
    await flush();
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('');
    expect($('[data-model-blocked]').textContent).toContain('ولا يُخمَّن نموذج');
    await s.choose('anthropic');
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('a-model-1');
    await s.choose('mock-b');
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('my-new-model-2027');
  });

  it('مسح مفتاح المختار يخصه: مخزنه وحده، والتأكيد يسرد ما يتعطل وما يبقى ومنه مفاتيح المزوّدين الآخرين', async () => {
    const s = await setup();
    await s.stores.get('anthropic')?.save(fakeKey('K'), 'session');
    await s.stores.get('mock-b')?.save(fakeMockKey('mock-b'), 'session');
    await s.choose('mock-b');
    act(() => $('[data-action="key-clear"]').click());
    expect([...container.querySelectorAll('[data-disables] li')].map((li) => li.textContent)).toEqual(['حلّل الفشل واقترح الإصلاح', 'راجع تغييرات الطلب', 'افهم المشكلة والخطوة التالية']);
    expect($('[data-keeps]').textContent).toContain('مفاتيح المزوّدين الآخرين');
    act(() => $('[data-action="key-clear-confirm"]').click());
    await flush();
    expect(s.touched.filter((t) => t.startsWith('clear:'))).toEqual(['clear:mock-b']);
    expect(await s.stores.get('mock-b')?.read()).toBeNull();
    expect((await s.stores.get('anthropic')?.read())?.token).toBe(fakeKey('K'));
  });
});

describe('AC-E10 (٤) وDEC-13 ن-5: حقل النموذج اليدوي وزر + والاختبار الاختياري (Model field، O-28)', () => {
  it('معرّف يُكتب يدويًا وليس في القائمة يُحفظ ويصير النموذج المرسل إليه بلا طلب عند الكتابة؛ والمعرّف غير الصالح لا يُحفظ', async () => {
    const s = await setup({ granted: [C.origin] });
    await s.choose('mock-c');
    await s.submit(fakeMockKey('mock-c'));
    await flush();
    const before = s.order.length;
    await s.type('c-model-from-tomorrow');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-model-from-tomorrow');
    expect((await s.port.status('mock-c'))?.model?.id).toBe('c-model-from-tomorrow');
    expect(container.querySelector('[data-model-blocked]')).toBeNull();
    await s.type('not a model/id');
    expect($('[data-model-help]').getAttribute('data-model-help')).toBe('invalid');
    expect($<HTMLInputElement>('[data-model-input]').getAttribute('aria-invalid')).toBe('true');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-model-from-tomorrow');
    await s.type('');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('');
    expect($('[data-model-blocked]')).not.toBeNull();
    // لا طلب عند الكتابة.
    expect(s.order.slice(before)).toEqual([]);
  });

  it('زر + بنقرة موثوقة يعرض القائمة المقروءة بوقتها، والاختيار يملأ الحقل ويغلقها ويعيد التركيز؛ وEsc والنقر خارجها يغلقانها؛ والنقرة البرمجية لا تفعل شيئًا', async () => {
    const s = await setup({ granted: [B.origin] });
    await s.choose('mock-b');
    await s.submit(fakeMockKey('mock-b'));
    await flush();
    const plus = $<HTMLButtonElement>('[data-action="model-list"]');
    act(() => plus.click());
    await flush();
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    const sent = s.order.length;
    act(() => trustedClick(plus));
    await flush();
    // القائمة مقروءة في الجلسة: لا طلب جديد.
    expect(s.order.length).toBe(sent);
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    expect($('[data-model-list]').getAttribute('data-model-list')).toBe('list');
    expect($('[data-list-source]').textContent).toContain('من قائمة Mock B · قُرئت');
    const listbox = $('[role="listbox"]');
    expect(plus.getAttribute('aria-controls')).toBe(listbox.id);
    expect([...listbox.querySelectorAll('[role="option"]')].map((o) => o.getAttribute('data-model'))).toEqual(['b-model-1', 'b-model-2']);
    act(() => ($('[role="option"][data-model="b-model-2"]') as HTMLElement).click());
    await flush();
    expect(s.settings.get(modelSettingKey('mock-b'))).toBe('b-model-2');
    expect($<HTMLInputElement>('[data-model-input]').value).toBe('b-model-2');
    expect(container.querySelector('[data-model-list]')).toBeNull();
    expect(document.activeElement).toBe($('[data-model-input]'));
    // Esc يغلقها، والأسهم وEnter تختار.
    act(() => trustedClick(plus));
    await flush();
    const field = $<HTMLInputElement>('[data-model-input]');
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await flush();
    expect(field.getAttribute('aria-activedescendant')).toBe($('[role="option"][data-model="b-model-1"]').id);
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await flush();
    expect(s.settings.get(modelSettingKey('mock-b'))).toBe('b-model-1');
    expect(container.querySelector('[data-model-list]')).toBeNull();
    act(() => trustedClick(plus));
    await flush();
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    await flush();
    expect(container.querySelector('[data-model-list]')).toBeNull();
    act(() => trustedClick(plus));
    await flush();
    act(() => void document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
    await flush();
    expect(container.querySelector('[data-model-list]')).toBeNull();
  });

  it('زر + بلا قائمة مقروءة يرسل طلب التحقق المعلن نفسه بلا اقتراح؛ وتعذّر الجلب معلن بإعادة المحاولة والحقل يعمل ويُحفظ', async () => {
    const s = await setup({ granted: [C.origin], listFails: true });
    await s.stores.get('mock-c')?.save(fakeMockKey('mock-c'), 'session');
    await s.choose('mock-c');
    const plus = $<HTMLButtonElement>('[data-action="model-list"]');
    expect(plus.getAttribute('aria-disabled')).toBeNull();
    act(() => trustedClick(plus));
    expect($('[data-model-list]').getAttribute('data-model-list')).toBe('loading');
    expect($('[data-list-state="loading"]').textContent).toContain('يجلب قائمة النماذج من Mock C…');
    await flush();
    expect(s.order).toEqual(['verify:mock-c:list']);
    expect($('[data-list-state="failed"]').textContent).toContain('تعذّر جلب القائمة (لا اتصال). الحقل يعمل كما هو.');
    expect($('[data-list-state="failed"]').closest('[aria-live="polite"]')).not.toBeNull();
    await s.type('c-model-typed');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-model-typed');
    s.fail.list = false;
    act(() => trustedClick($('[data-action="model-list-retry"]')));
    await flush();
    expect(s.order.filter((o) => o.startsWith('verify'))).toEqual(['verify:mock-c:list', 'verify:mock-c:list']);
    expect($('[data-model-list]').getAttribute('data-model-list')).toBe('list');
    // جلب القائمة بزر + لا يقترح نموذجًا ولا يغيّر الحقل.
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-model-typed');
  });

  it('قائمة خالية: «لم يُعِد المزوّد نماذج لمفتاحك»، والحقل يعمل', async () => {
    const s = await setup({ granted: [C.origin] });
    await s.stores.get('mock-c')?.save(fakeMockKey('mock-c'), 'session');
    await s.choose('mock-c');
    s.lists.set('mock-c', { provider: 'mock-c', models: [], readAt: NOW, source: 'https://api.mock-c.test/models', partial: false });
    await s.choose('mock-b');
    await s.choose('mock-c');
    act(() => trustedClick($('[data-action="model-list"]')));
    await flush();
    expect($('[data-list-state="empty"]').textContent).toBe('لم يُعِد Mock C نماذج لمفتاحك. اكتب المعرّف بنفسك.');
    expect($<HTMLInputElement>('[data-model-input]').disabled).toBe(false);
  });

  it('«اختبر النموذج» واحد للنموذج المكتوب حيث يدعمه المحوّل، بنقرة موثوقة؛ ونتيجته قبول أو رفض أو لم يُحسم للنموذج المكتوب وحده، ولا تمنع شيئًا', async () => {
    const s = await setup({ granted: [C.origin] });
    await s.choose('mock-c');
    await s.submit(fakeMockKey('mock-c'));
    await flush();
    expect(container.querySelectorAll('[data-action="model-test"]')).toHaveLength(1);
    const test = $<HTMLButtonElement>('[data-action="model-test"]');
    expect(test.disabled).toBe(true);
    expect(test.getAttribute('title')).toContain('https://api.mock-c.test/probe');
    await s.type('c-model-from-tomorrow');
    expect(test.disabled).toBe(false);
    act(() => test.click());
    await flush();
    expect(s.order.filter((o) => o.startsWith('probe'))).toEqual([]);
    act(() => trustedClick(test));
    await flush();
    expect(s.order.filter((o) => o.startsWith('probe'))).toEqual(['probe:mock-c:c-model-from-tomorrow']);
    expect($('[data-model-test]').getAttribute('data-model-test')).toBe('accepted');
    expect($('[data-model-test]').textContent).toContain('قبِل Mock C النموذج في الاختبار');
    await s.type('c-gone');
    expect(container.querySelector('[data-model-test]')).toBeNull();
    act(() => trustedClick($('[data-action="model-test"]')));
    await flush();
    expect($('[data-model-test]').getAttribute('data-model-test')).toBe('rejected');
    expect($('[data-model-test]').textContent).toBe('رفض Mock C النموذج: غير متاح لمفتاحك. لا يمنع ذلك الحفظ ولا التحليل.');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-gone');
    await s.type('c-busy');
    act(() => trustedClick($('[data-action="model-test"]')));
    await flush();
    expect($('[data-model-test]').getAttribute('data-model-test')).toBe('inconclusive');
    expect($('[data-model-test]').textContent).toContain('لم يُحسم الاختبار: تجاوز المفتاح حد الطلبات. ليس حكمًا على النموذج');
    // نتيجة مزوّد لا تُعرض لغيره، ولا بعد استبدال مفتاحه.
    await s.choose('mock-b');
    expect(container.querySelector('[data-model-test]')).toBeNull();
    await s.choose('mock-c');
    expect($('[data-model-test]').getAttribute('data-model-test')).toBe('inconclusive');
    await s.stores.get('mock-c')?.save(fakeMockKey('mock-c', 'z'), 'session');
    await s.choose('mock-b');
    await s.choose('mock-c');
    expect(container.querySelector('[data-model-test]')).toBeNull();
  });

  it('Firefox: زر + و«اختبر النموذج» يطلبان صلاحية المضيف وحدها (لا يحملان محتوى)، ولا تُطلب معهما موافقة محتوى المواقع', async () => {
    const s = await setup({ firefox: true });
    await s.stores.get('mock-c')?.save(fakeMockKey('mock-c'), 'session');
    await s.choose('mock-c');
    act(() => trustedClick($('[data-action="model-list"]')));
    await flush();
    expect(s.order).toEqual(['request:https://api.mock-c.test/*', 'verify:mock-c:list']);
    expect(s.perms.collected.has('websiteContent')).toBe(false);
    await s.type('c-model-typed');
    act(() => trustedClick($('[data-action="model-test"]')));
    await flush();
    // المضيف ممنوح الآن: لا نافذة ثانية، ولا موافقة محتوى.
    expect(s.order).toEqual(['request:https://api.mock-c.test/*', 'verify:mock-c:list', 'probe:mock-c:c-model-typed']);
    expect(s.perms.collected.has('websiteContent')).toBe(false);
  });

  it('رفض صلاحية المضيف لزر +: لا يُرسل شيء، والسبب معلن والحقل يعمل', async () => {
    const s = await setup({ answer: false });
    await s.stores.get('mock-c')?.save(fakeMockKey('mock-c'), 'session');
    await s.choose('mock-c');
    act(() => trustedClick($('[data-action="model-list"]')));
    await flush();
    expect(s.order).toEqual(['request:https://api.mock-c.test/*']);
    expect($('[data-list-state="failed"]').textContent).toContain('لم تُمنح صلاحية api.mock-c.test، فلم يُرسل شيء');
    await s.type('c-still-works');
    expect(s.settings.get(modelSettingKey('mock-c'))).toBe('c-still-works');
  });

  it('لا اختبار لمزوّد لا يدعمه محوّله، ولا زر لكل نموذج في القائمة', async () => {
    const s = await setup({ granted: [B.origin] });
    await s.choose('mock-b');
    await s.submit(fakeMockKey('mock-b'));
    await flush();
    expect(container.querySelector('[data-action="model-test"]')).toBeNull();
    act(() => trustedClick($('[data-action="model-list"]')));
    await flush();
    expect(container.querySelectorAll('[role="option"] button')).toHaveLength(0);
  });
});

describe('AC-E10 (٦): الصلاحيات، وFirefox بموافقة واحدة لكل المزوّدين', () => {
  it('عائلة Chromium: صلاحية مضيف المختار وحده، بلا ذكر لموافقة محتوى المواقع', async () => {
    const s = await setup();
    await s.choose('mock-c');
    expect(container.querySelector('[data-content-consent]')).toBeNull();
    await s.submit(fakeMockKey('mock-c'));
    expect(s.perms.request).toHaveBeenCalledWith({ origins: [C.origin] });
    expect($('[data-provider-permission]').textContent).not.toContain('محتوى المواقع');
  });

  it('Firefox: النقرة تطلب مضيف المختار والموافقة معًا، والبطاقة تذكر أن Firefox ينسبها إلى «المطوِّر» وأن المحتوى يُرسل إلى المختار وحده (O-25)', async () => {
    const s = await setup({ firefox: true });
    await s.choose('mock-b');
    const notice = $('[data-content-consent]').textContent ?? '';
    for (const part of ['websiteContent', 'واحدة لكل المزوّدين', 'فلا يُرسل تحليل دونها', 'مطوِّر الامتداد', 'لا يرسل شيئًا إلى مطوّره', 'إلى المزوّد الذي تختاره وحده']) expect(notice).toContain(part);
    expect($('[data-provider-permission]').textContent).toContain('غير ممنوحتين');
    await s.submit(fakeMockKey('mock-b'));
    expect(s.order).toEqual(['request:https://api.mock-b.test/*+websiteContent']);
    await flush();
    expect($('[data-provider-permission]').getAttribute('data-provider-permission')).toBe('granted');
    expect($('[data-provider-permission]').textContent).toContain('ممنوحتان');
  });

  it('Firefox: سحب المضيف يخص مزوّده وتبقى الموافقة، وسحب الموافقة يخص الكل وتبقى المضيفات', async () => {
    const s = await setup({ firefox: true, granted: [ANTHROPIC.origin, B.origin], collected: ['websiteContent'] });
    await s.choose('mock-b');
    expect($('[data-action="key-revoke"]').textContent).toBe('اسحب صلاحية api.mock-b.test');
    expect($('[data-action="content-revoke"]').textContent).toContain('لكل المزوّدين');
    act(() => $('[data-action="key-revoke"]').click());
    await flush();
    expect(s.perms.remove).toHaveBeenLastCalledWith({ origins: [B.origin] });
    expect(s.perms.granted.has(ANTHROPIC.origin)).toBe(true);
    expect(s.perms.collected.has('websiteContent')).toBe(true);
    expect($('[data-provider-permission]').textContent).toContain('المضيف غير ممنوح، وموافقة محتوى المواقع ممنوحة');
    act(() => $('[data-action="content-revoke"]').click());
    await flush();
    expect(s.perms.remove).toHaveBeenLastCalledWith({ data_collection: ['websiteContent'] });
    expect(s.perms.granted.has(ANTHROPIC.origin)).toBe(true);
    expect(container.querySelector('[data-action="content-revoke"]')).toBeNull();
  });

  it('رفض النافذة: يُحفظ المفتاح «غير متحقق منه» في مخزن المختار ولا يُرسل شيء', async () => {
    const s = await setup({ answer: false });
    await s.choose('mock-b');
    await s.submit(fakeMockKey('mock-b'));
    await flush();
    expect(s.order).toEqual(['request:https://api.mock-b.test/*']);
    expect(s.port.verify).not.toHaveBeenCalled();
    expect($('[data-key-message]').textContent).toContain('حُفظ مفتاح Mock B');
    expect($('[data-key-message]').textContent).toContain('لم يُتحقق منه');
  });
});
