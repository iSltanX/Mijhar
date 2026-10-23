// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-TOUR-01 (AC-B7): تشغيل الجولات الخمس عشرة على عينات GitHub؛ عدّاد الأحداث والنداءات الاصطناعية على عناصر GitHub يساوي صفرًا في كل جولة؛ وبطاقة سبب الغياب
// عند حذف عنصر خطوة؛ والجولات الحساسة تعرض شرحًا بصريًا فقط (لا تُقرأ صفحتها ولا يُبرز فيها شيء).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector, classifyPath } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { GLOSSARY_ENTRIES } from '../../../../src/modules/b/card';
import { TOURS, TOUR_COUNT, TOUR_MESSAGE, TourState, ToursListView, createToursModule, entriesOf, getTour, isTourMessage, resolvePath, resolveStep } from '../../../../src/modules/b/tours';
import type { TourBridge, TourStatus } from '../../../../src/modules/b/tours';
import { flush, hostsOf, stubRects } from '../card/helpers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const page = (name: string): string => path.join(HERE, 'fixtures', `${name}.html`);

function load(file: string, url: string): void {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', url);
}

const OLD_PATH_IDS = [
  'profile-intro', 'open-repo', 'commit-branch-tag-release', 'create-repo', 'upload-file', 'understand-pr', 'understand-actions', 'publish-release',
  'privacy-settings', 'secure-2fa', 'add-ssh', 'protect-branch', 'public-vs-private', 'delete-repo-safely', 'top-navigation',
];
const VISUAL_TOURS = ['privacy-settings', 'secure-2fa', 'add-ssh', 'protect-branch', 'public-vs-private', 'delete-repo-safely'];

describe('بيانات الجولات (F-B7)', () => {
  it('خمس عشرة جولة محوَّلة من المسارات الخمسة عشر بالمعرّفات نفسها وبترتيبها', () => {
    expect(TOURS).toHaveLength(TOUR_COUNT);
    expect(TOURS.map((t) => t.id)).toEqual(OLD_PATH_IDS);
    expect(TOURS.map((t) => t.order)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(new Set(TOURS.map((t) => t.id)).size).toBe(15);
    for (const tour of TOURS) {
      expect(tour.steps.length, tour.id).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.title.trim().length, `${tour.id}: عنوان`).toBeGreaterThan(0);
        expect(step.body.trim().length, `${tour.id}: متن`).toBeGreaterThan(10);
        expect(`${step.title} ${step.body}`, `${tour.id}: لا لغة محاكاة`).not.toMatch(/محاكاة|تعليمي|ghsim/);
      }
    }
  });

  it('كل مدخل تشير إليه خطوة موجود في القاموس بتوقيع عنصر، وكل خطوة بلا مدخل شرح بصري أو نصي بحت', () => {
    const element = new Set(GLOSSARY_ENTRIES.filter((e) => e.kind === 'element' && e.signature).map((e) => e.id));
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        const ids = step.entry === null ? [] : typeof step.entry === 'string' ? [step.entry] : step.entry;
        for (const id of ids) expect(element.has(id), `${tour.id}: ${id}`).toBe(true);
        expect(entriesOf(step)).toHaveLength(ids.length);
      }
    }
  });

  it('الجولات الحساسة ستٌّ، كل خطوة فيها شرح بصري؛ وكل خطوة تخص صفحة إعدادات شرح بصري', () => {
    expect(TOURS.filter((t) => t.visualOnly).map((t) => t.id)).toEqual(VISUAL_TOURS);
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        const onSettings = entriesOf(step).some((e) => e.signature?.pages.some((kind) => kind === 'settings-account' || kind === 'settings-repo'));
        if (onSettings) expect(step.visual, `${tour.id}: ${step.title}`).toBeDefined();
      }
    }
    // «إنشاء مستودع» جولة حية فيها خطوة ظهور بصرية.
    const create = getTour('create-repo')!;
    expect(create.visualOnly).toBe(false);
    expect(create.steps.map((s) => s.visual !== undefined)).toEqual([false, true]);
  });

  it('خطوة الشرح البصري لا تلمس DOM إطلاقًا (مستند يرمي عند أي وصول)', () => {
    const trap = new Proxy({}, { get: (_t, prop) => { throw new Error(`وصول إلى المستند: ${String(prop)}`); } }) as unknown as Document;
    for (const id of VISUAL_TOURS) {
      for (const step of getTour(id)!.steps) {
        const resolution = resolveStep(step, trap, { type: 'settings', href: 'https://github.com/settings/security' });
        expect(resolution.kind).toBe('visual');
      }
    }
  });
});

describe('روابط فتح الصفحة (بنقر المستخدم)', () => {
  it('يحل القوالب بقيم الصفحة، ولا يخمّن عند نقصها', () => {
    const v = { owner: 'octo', repo: 'demo', user: 'octo-dev' };
    expect(resolvePath('/{owner}/{repo}/releases', v)).toBe('https://github.com/octo/demo/releases');
    expect(resolvePath('/{user}?tab=repositories', v)).toBe('https://github.com/octo-dev?tab=repositories');
    expect(resolvePath('/settings/security', v)).toBe('https://github.com/settings/security');
    expect(resolvePath('/{owner}/{repo}', { owner: null, repo: null, user: 'u' })).toBeNull();
    expect(resolvePath(undefined, v)).toBeNull();
    // قيم خارجة عن أحرف الأسماء لا تُحقن في الرابط.
    expect(resolvePath('/{owner}/{repo}', { owner: 'a/../b', repo: 'x', user: null })).toBeNull();
  });
});

// ---------- الوحدة على عينات الصفحة ----------

interface Live {
  manager: LifecycleManager;
  state: TourState;
  errors: unknown[];
}

async function mount(options: { state?: TourState; api?: ExtensionApi | null } = {}): Promise<Live> {
  const state = options.state ?? new TourState();
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([createToursModule({ state, api: options.api ?? null, rectOf: stubRects(), debounceMs: 5 })]),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(20);
  return { manager, state, errors };
}

let live: Live | null = null;
afterEach(() => {
  live?.manager.stop();
  live = null;
});

const barHost = (): HTMLElement | undefined => hostsOf('b.tours')[0];
const bar = (): HTMLElement | null => barHost()?.shadowRoot?.querySelector<HTMLElement>('.tour-bar') ?? null;
const inBar = <E extends Element = HTMLElement>(selector: string): E | null => barHost()?.shadowRoot?.querySelector<E>(selector) ?? null;
const rings = (): number => hostsOf('b.search.highlight')[0]?.shadowRoot?.querySelectorAll('.ring').length ?? 0;
const press = async (selector: string): Promise<void> => {
  await act(async () => {
    inBar(selector)!.click();
    await flush(10);
  });
};
const start = async (id: string): Promise<void> => {
  await act(async () => {
    live!.state.start(id);
    await flush(12);
  });
};

describe('الجولة على صفحة المستودع', () => {
  beforeEach(() => load(page('repo'), 'https://github.com/octo/demo'));

  it('قبل البدء لا أثر في الصفحة: لا مضيف ولا تعديل', async () => {
    const before = document.documentElement.outerHTML;
    live = await mount();
    expect(hostsOf('b.tours')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
    expect(live.errors).toEqual([]);
  });

  it('تبدأ فتبرز عنصر الخطوة وتشرحه، وتتقدم بزر التالي حتى تنتهي فتزول الطبقات وتعود الصفحة حرفيًا', async () => {
    const before = document.documentElement.outerHTML;
    live = await mount();
    await start('open-repo');
    expect(hostsOf('b.tours')).toHaveLength(1);
    expect(bar()?.getAttribute('aria-label')).toContain('فتح مستودع');
    expect(bar()?.dataset.resolution).toBe('found');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('تبويب الشفرة');
    expect(inBar('.tour-tag')?.textContent).toContain('مُبرز');
    expect(rings()).toBe(1);
    expect(inBar('[data-tour-position]')?.textContent).toBe('1');

    await press('[data-action="tour-next"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('شجرة الملفات');
    expect(rings()).toBe(1);
    await press('[data-action="tour-prev"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('تبويب الشفرة');
    expect((inBar('[data-action="tour-prev"]') as HTMLButtonElement).disabled).toBe(true);

    for (let i = 0; i < 3; i += 1) await press('[data-action="tour-next"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('لوحة حول المشروع');
    expect(inBar('[data-action="tour-next"]')?.textContent).toBe('إنهاء الجولة');
    await press('[data-action="tour-next"]');
    expect(live.state.tour).toBeNull();
    expect(hostsOf('b.tours')).toHaveLength(0);
    expect(hostsOf('b.search.highlight')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('Esc وزر × ينهيان الجولة', async () => {
    live = await mount();
    await start('open-repo');
    await act(async () => {
      bar()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      await flush(10);
    });
    expect(live.state.tour).toBeNull();
    await start('open-repo');
    await press('[data-action="tour-stop"]');
    expect(live.state.tour).toBeNull();
    expect(hostsOf('b.tours')).toHaveLength(0);
  });

  it('حذف عنصر الخطوة يعرض بطاقة تشرح سبب غيابه بدل التخمين ولا يُبرز شيئًا', async () => {
    document.getElementById('readme')!.remove();
    live = await mount();
    await start('open-repo');
    await press('[data-action="tour-next"]');
    await press('[data-action="tour-next"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('ملف التعريف README');
    expect(bar()?.dataset.resolution).toBe('absent');
    const card = inBar('[data-tour-absent]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('لم يظهر عنصر هذه الخطوة');
    expect(card!.textContent).toContain('لا يظهر README إن لم يكن في جذر المستودع ملف بهذا الاسم');
    expect(card!.textContent).toContain('لا تخمّن عنصرًا');
    expect(rings()).toBe(0);
    // المتابعة ممكنة بعد الغياب.
    await press('[data-action="tour-next"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('لوحة حول المشروع');
    expect(bar()?.dataset.resolution).toBe('found');
  });

  it('عنصر يوجد في صفحة أخرى: البطاقة تذكر الصفحة وصلاحية العنصر من القاموس', async () => {
    live = await mount();
    await start('commit-branch-tag-release');
    for (let i = 0; i < 3; i += 1) await press('[data-action="tour-next"]');
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('Release');
    expect(bar()?.dataset.resolution).toBe('absent');
    const text = inBar('[data-tour-absent]')!.textContent!;
    expect(text).toContain('صلاحية الكتابة');
    expect(text).toContain('Releases');
    // رابط فتح الصفحة يضغطه المستخدم، مطلق إلى github.com.
    const link = inBar<HTMLAnchorElement>('[data-action="tour-open-page"]');
    expect(link?.getAttribute('href')).toBe('https://github.com/octo/demo/releases');
  });

  it('الجولة تبقى بعد تنقل Turbo: تعيد الوحدة تركيبها بالحالة نفسها على الصفحة الجديدة', async () => {
    live = await mount();
    await start('publish-release');
    expect(bar()?.dataset.resolution).toBe('absent');
    const state = live.state;
    live.manager.stop();
    load(page('releases'), 'https://github.com/octo/demo/releases');
    live = await mount({ state });
    expect(hostsOf('b.tours')).toHaveLength(1);
    expect(bar()?.dataset.resolution).toBe('found');
    expect(rings()).toBe(1);
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('إنشاء إصدار جديد');
  });

  it('ظهور العنصر بعد التحميل (React) يحدّد الخطوة بعد هدوء التعديلات', async () => {
    document.getElementById('tags-link')!.remove();
    live = await mount();
    await start('commit-branch-tag-release');
    await press('[data-action="tour-next"]');
    await press('[data-action="tour-next"]');
    expect(bar()?.dataset.resolution).toBe('absent');
    const link = document.createElement('a');
    link.href = '/octo/demo/tags';
    link.textContent = 'Tags';
    document.getElementById('js-repo-pjax-container')!.append(link);
    await act(async () => void (await flush(40)));
    expect(bar()?.dataset.resolution).toBe('found');
    expect(rings()).toBe(1);
  });
});

describe('الجولات الحساسة: شرح بصري فقط', () => {
  beforeEach(() => load(page('settings-account'), 'https://github.com/settings/security'));

  it.each(VISUAL_TOURS)('%s: شريط بصري بلا إبراز ولا قراءة للصفحة ولا لمس لعناصرها', async (id) => {
    const before = document.documentElement.outerHTML;
    live = await mount();
    await start(id);
    const tour = getTour(id)!;
    for (let i = 0; i < tour.steps.length; i += 1) {
      expect(bar()?.dataset.resolution).toBe('visual');
      expect(inBar('[data-tour-visual]')).not.toBeNull();
      expect(inBar('.tour-wire')).not.toBeNull();
      expect(inBar('[data-tour-visual]')!.textContent).toContain('شرح بصري فقط');
      expect(inBar('[data-tour-absent]')).toBeNull();
      expect(rings()).toBe(0);
      expect(hostsOf('b.search.highlight')).toHaveLength(0);
      await press('[data-action="tour-next"]');
    }
    expect(live.state.tour).toBeNull();
    // الصفحة الحساسة لم تتغير حرفيًا.
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

// ---------- قفل الأمان: لا نقر اصطناعي على عناصر GitHub ----------

const PAGE_OF: Record<string, { file: string; url: string }> = {
  profile: { file: 'profile', url: 'https://github.com/octo-dev' },
  repo: { file: 'repo', url: 'https://github.com/octo/demo' },
  releases: { file: 'releases', url: 'https://github.com/octo/demo/releases' },
  actions: { file: 'actions', url: 'https://github.com/octo/demo/actions' },
  pr: { file: 'pr', url: 'https://github.com/octo/demo/pull/7' },
  settings: { file: 'settings-account', url: 'https://github.com/settings/security' },
};

/** صفحات العينة التي تُشغَّل عليها خطوات الجولة بحسب مساره (الجولة الواحدة قد تمر بصفحات). */
function pageForStep(path: string | undefined, tourId: string, stepIndex: number): { file: string; url: string } {
  if (tourId === 'understand-pr' && stepIndex === 1) return PAGE_OF.pr!;
  if (!path) return PAGE_OF.repo!;
  if (path.startsWith('/{user}')) return PAGE_OF.profile!;
  if (path.endsWith('/releases')) return PAGE_OF.releases!;
  if (path.endsWith('/actions')) return PAGE_OF.actions!;
  if (path.startsWith('/settings') || path.includes('/settings')) return PAGE_OF.settings!;
  return PAGE_OF.repo!;
}

describe('قفل الأمان (AC-B7): صفر نقرات وأحداث اصطناعية على عناصر GitHub في كل جولة', () => {
  let counts: { events: string[]; calls: string[] };
  const spies: Array<() => void> = [];

  const fromExtension = (node: unknown): boolean => node instanceof Node && node.getRootNode() instanceof ShadowRoot;

  beforeEach(() => {
    counts = { events: [], calls: [] };
    // أي حدث نقر أو لمس أو إرسال أو لوحة مفاتيح يبلغ الصفحة من عنصر ليس من الإضافة (الأحداث الموثوقة معدومة في jsdom، فكل ما يصل اصطناعي).
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit', 'input', 'change', 'keydown', 'keyup']) {
      const listener = (event: Event): void => {
        const origin = event.composedPath()[0];
        if (!fromExtension(origin)) counts.events.push(`${type}:${(origin as Element | null)?.id ?? (origin as Node | null)?.nodeName}`);
      };
      document.addEventListener(type, listener, true);
      spies.push(() => document.removeEventListener(type, listener, true));
    }
    const watch = <T extends object>(proto: T, name: keyof T & string): void => {
      const original = proto[name] as unknown as (...args: unknown[]) => unknown;
      const spy = vi.spyOn(proto, name as never) as unknown as { mockImplementation(fn: (this: unknown, ...args: unknown[]) => unknown): unknown; mockRestore(): void };
      spy.mockImplementation(function (this: unknown, ...args: unknown[]) {
        if (!fromExtension(this)) counts.calls.push(`${String(name)}:${(this as Element | null)?.id ?? (this as Node | null)?.nodeName}`);
        return original.apply(this, args);
      });
      spies.push(() => spy.mockRestore());
    };
    watch(HTMLElement.prototype, 'click');
    watch(HTMLElement.prototype, 'focus');
    watch(HTMLFormElement.prototype, 'submit');
    watch(HTMLFormElement.prototype, 'requestSubmit');
    watch(EventTarget.prototype, 'dispatchEvent');
  });
  afterEach(() => {
    for (const undo of spies.splice(0)) undo();
  });

  it.each(TOURS.map((t) => [t.id] as const))('%s: تُشغَّل خطواتها كلها على صفحاتها ولا يقع نقر ولا حدث ولا تركيز على عنصر GitHub', async (id) => {
    const tour = getTour(id)!;
    const state = new TourState();
    for (let i = 0; i < tour.steps.length; i += 1) {
      const target = pageForStep(tour.steps[i]!.path, id, i);
      load(page(target.file), target.url);
      live = await mount({ state });
      if (i === 0) await start(id);
      else {
        // الانتقال بين الصفحات: الحالة المشتركة تبقى والوحدة تُعاد تركيبها.
        await act(async () => void (await flush(15)));
      }
      expect(state.tour?.id).toBe(id);
      expect(state.step).toBe(i);
      expect(bar()?.dataset.step).toBe(String(i));
      await press('[data-action="tour-next"]');
      live.manager.stop();
      live = null;
    }
    expect(state.tour).toBeNull();
    expect(counts.events, `${id}: أحداث`).toEqual([]);
    expect(counts.calls.filter((c) => !c.startsWith('dispatchEvent')), `${id}: نداءات`).toEqual([]);
    // dispatchEvent المسموح الوحيد: ما يصدره Preact أو الاختبار على عناصر داخل جذور الإضافة (مستثنى أعلاه)؛ لا واحد على عنصر الصفحة.
    expect(counts.calls.filter((c) => c.startsWith('dispatchEvent')), `${id}: dispatchEvent`).toEqual([]);
  });

  it('ضابط: العدّاد يلتقط نقرة اصطناعية على عنصر من الصفحة ولا يلتقط نقرة على زر الشريط (فصفره في الجولات ذو معنى)', async () => {
    load(page('profile'), PAGE_OF.profile!.url);
    live = await mount();
    await start('profile-intro');
    await press('[data-action="tour-next"]');
    expect(counts.events).toEqual([]);
    document.getElementById('edit-profile')!.click();
    expect(counts.events.some((e) => e.startsWith('click:edit-profile'))).toBe(true);
    expect(counts.calls).toContain('click:edit-profile');
  });

  it('الجولات الحية تجد عناصرها فعلًا على العينات (لا يكتفي الاختبار بالغياب)', async () => {
    const found: Record<string, string[]> = {};
    for (const tour of TOURS) {
      for (let i = 0; i < tour.steps.length; i += 1) {
        const step = tour.steps[i]!;
        const target = pageForStep(step.path, tour.id, i);
        load(page(target.file), target.url);
        const resolution = resolveStep(step, document, { type: classifyPath(new URL(target.url).pathname).type, href: target.url });
        (found[tour.id] ??= []).push(resolution.kind);
      }
    }
    expect(found['profile-intro']).toEqual(['found', 'found', 'found', 'found']);
    expect(found['open-repo']).toEqual(['found', 'found', 'found', 'found']);
    expect(found['top-navigation']).toEqual(['found', 'found', 'found', 'found']);
    expect(found['understand-actions']).toEqual(['found', 'found']);
    expect(found['understand-pr']).toEqual(['found', 'found']);
    expect(found['upload-file']).toEqual(['found']);
    expect(found['publish-release']).toEqual(['found']);
    expect(found['create-repo']).toEqual(['found', 'visual']);
    for (const id of VISUAL_TOURS) expect(new Set(found[id]), id).toEqual(new Set(['visual']));
    void ROOT;
  });
});

// ---------- الرسائل واللوحة ----------

type Listener = (message: unknown, sender: unknown, reply: (response?: unknown) => void) => unknown;

function fakeApi(): { api: ExtensionApi; send: (message: unknown) => unknown } {
  const listeners = new Set<Listener>();
  const api = { runtime: { onMessage: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) } } } as unknown as ExtensionApi;
  const send = (message: unknown): unknown => {
    let response: unknown;
    for (const listener of listeners) listener(message, {}, (r) => (response = r));
    return response;
  };
  return { api, send };
}

describe('رسائل اللوحة', () => {
  beforeEach(() => load(page('repo'), 'https://github.com/octo/demo'));

  it('start وnext وprev وstatus وstop عبر الرسالة، والرسائل الغريبة تُتجاهل', async () => {
    const { api, send } = fakeApi();
    live = await mount({ api });
    expect(send({ type: TOUR_MESSAGE, action: 'status' })).toEqual({ active: null, step: 0 });
    expect(send({ type: 'other', action: 'start', id: 'open-repo' })).toBeUndefined();
    expect(send({ type: TOUR_MESSAGE, action: 'explode' })).toBeUndefined();
    await act(async () => {
      expect(send({ type: TOUR_MESSAGE, action: 'start', id: 'open-repo' })).toEqual({ active: 'open-repo', step: 0 });
      await flush(12);
    });
    expect(bar()).not.toBeNull();
    await act(async () => {
      expect(send({ type: TOUR_MESSAGE, action: 'next' })).toEqual({ active: 'open-repo', step: 1 });
      await flush(12);
    });
    expect(inBar('[data-tour-step-title]')?.textContent).toBe('شجرة الملفات');
    expect(send({ type: TOUR_MESSAGE, action: 'prev' })).toEqual({ active: 'open-repo', step: 0 });
    // جولة غير معروفة لا تبدأ.
    expect(send({ type: TOUR_MESSAGE, action: 'start', id: 'no-such-tour' })).toEqual({ active: 'open-repo', step: 0 });
    await act(async () => {
      expect(send({ type: TOUR_MESSAGE, action: 'stop' })).toEqual({ active: null, step: 0 });
      await flush(12);
    });
    expect(bar()).toBeNull();
    expect(isTourMessage({ type: TOUR_MESSAGE, action: 'start', id: 5 })).toBe(false);
  });
});

describe('قائمة الجولات في اللوحة', () => {
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

  const fakeSettings = { get: () => true, subscribe: () => () => {}, isModuleEnabled: () => true, registry: { has: () => false }, set: async () => {} };

  it('تعرض الجولات الخمس عشرة وشارة «شرح بصري فقط» للستّ، وزر البدء يرسل إلى الجسر ويعرض الحالة', async () => {
    const sent: Array<[string, string | undefined]> = [];
    let status: TourStatus | null = { active: null, step: 0 };
    const bridge: TourBridge = {
      status: async () => status,
      send: async (action, id) => {
        sent.push([action, id]);
        status = action === 'start' ? { active: id!, step: 0 } : { active: null, step: 0 };
        return status;
      },
    };
    await act(async () => {
      render(<ToursListView settings={fakeSettings as never} surface="native" bridge={bridge} />, container);
      await flush(10);
    });
    expect(container.querySelectorAll('[data-tour-id]')).toHaveLength(15);
    expect([...container.querySelectorAll('[data-visual-only="true"]')].map((li) => (li as HTMLElement).dataset.tourId)).toEqual(VISUAL_TOURS);
    expect(container.querySelectorAll('[data-tag="visual-only"]')).toHaveLength(6);
    expect(container.querySelector('input, textarea, select')).toBeNull();
    await act(async () => {
      (container.querySelector('[data-action="start-tour"][data-tour="understand-actions"]') as HTMLButtonElement).click();
      await flush(10);
    });
    expect(sent).toEqual([['start', 'understand-actions']]);
    const li = container.querySelector('[data-tour-id="understand-actions"]')!;
    expect(li.getAttribute('data-running')).toBe('true');
    expect(li.textContent).toContain('جارية · الخطوة 1 من 2');
    await act(async () => {
      (li.querySelector('[data-action="stop-tour"]') as HTMLButtonElement).click();
      await flush(10);
    });
    expect(sent.at(-1)).toEqual(['stop', undefined]);
  });

  it('خارج صفحة GitHub: تُعلن ذلك ولا تفعل شيئًا', async () => {
    const bridge: TourBridge = { status: async () => null, send: async () => null };
    await act(async () => {
      render(<ToursListView settings={fakeSettings as never} surface="native" bridge={bridge} />, container);
      await flush(10);
    });
    // الأثر يعمل بعد الرسم فتصل الحالة في دورة لاحقة.
    await act(async () => void (await flush(10)));
    expect(container.querySelector('[data-notice="unreachable"]')).not.toBeNull();
    expect(container.querySelector('[data-running="true"]')).toBeNull();
  });
});

describe('الشيفرة نفسها لا تحوي نداءً إلى النقر أو الإرسال أو إطلاق الأحداث', () => {
  it('src/modules/b/tours بلا click() وdispatchEvent وsubmit وrequestSubmit وبناء أحداث اصطناعية', () => {
    const dir = path.join(ROOT, 'src/modules/b/tours');
    const forbidden = /\.(click|submit|requestSubmit|dispatchEvent|initEvent)\s*\(|new\s+(Mouse|Pointer|Keyboard|Input|Custom|Focus|Touch)?Event\s*\(|\.focus\s*\(\s*\)(?!.*preventScroll)/;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      // التعليقات مستثناة: الحراسة على الشيفرة التنفيذية.
      const code = text.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
      expect(code, file).not.toMatch(forbidden);
    }
  });
});
