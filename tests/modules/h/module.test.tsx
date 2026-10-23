// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/community"}
// الوحدة (ح) في الصفحة عبر دورة الحياة: شريط README العربي على العينات المرجعية (TEST-COMM-01 e2e)، وبطاقة الملف الشخصي (TEST-COMM-06).
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_MODULES, HOST_TAG, LifecycleManager, MemoryStorageArea, ModuleRegistry, PageDetector, SettingsStore, Store, createSettingsRegistry } from '../../../src/core';
import { COMMUNITY_PROFILE_CARD_KEY, COMMUNITY_README_BANNER_KEY, createModuleH, defineCommunitySettings } from '../../../src/modules/h';
import { SCOPE_STATEMENT } from '../../../src/modules/h/readme-detector';
import { ASSERTIVE_ABSENCE, fixtureText, flush } from './helpers';

let manager: LifecycleManager | null = null;
afterEach(() => {
  act(() => manager?.stop());
  manager = null;
});

function load(file: string, url: string): void {
  const parsed = new DOMParser().parseFromString(fixtureText(file), 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', url);
}

async function openContext() {
  const area = new MemoryStorageArea();
  const store = await Store.open({ area, changes: area, locks: null });
  const settings = await SettingsStore.open(store, createSettingsRegistry(defineCommunitySettings));
  return { settings, store };
}

async function start(settleMs = 30) {
  const context = await openContext();
  const module = createModuleH({ context: async () => context, settleMs });
  manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: () => true });
  await act(async () => {
    manager?.start();
    await flush(15);
  });
  await act(async () => void (await flush(20)));
  return { context, manager };
}

const hosts = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(HOST_TAG)];
const text = (): string => hosts().map((h) => h.shadowRoot?.textContent ?? '').join('\n');
const inHost = <E extends Element = HTMLElement>(selector: string): E => {
  for (const host of hosts()) {
    const el = host.shadowRoot?.querySelector<E>(selector);
    if (el) return el;
  }
  throw new Error(`لا عنصر: ${selector}`);
};

describe('الوحدة (ح) مسجَّلة', () => {
  it('ضمن الوحدات المضمّنة بمعرّف h وبجوار g بلا تكرار', () => {
    const ids = BUILTIN_MODULES.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'g', 'h']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('شريط README العربي في صفحة المستودع', () => {
  it('شجرة كاملة بلا README عربي: بيان النطاق قبل README، ولا عبارة جازمة، وزر docs/', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community');
    await start();
    expect(hosts()).toHaveLength(1);
    const readme = document.querySelector('article.markdown-body') as HTMLElement;
    expect(readme.parentElement?.firstElementChild).toBe(hosts()[0]);
    expect(inHost('[data-readme-state="not-found-in-scope"]').textContent).toBe(SCOPE_STATEMENT);
    expect(inHost('[data-action="scan-docs"]')).not.toBeNull();
    for (const pattern of ASSERTIVE_ABSENCE) expect(text(), String(pattern)).not.toMatch(pattern);
  });

  it('README عربي في الجذر: رابطه ظاهر في الشريط', async () => {
    load('fixture-community-repo-arabic.html', 'https://github.com/octo/community');
    await start();
    expect(inHost('[data-readme-state="found"]').textContent).toContain('يتوفر ملف تعريف باللغة العربية');
    expect(inHost<HTMLAnchorElement>('[data-readme-match]').href).toBe('https://github.com/octo/community/blob/main/README.ar-AR.md');
  });

  it('شجرة مقطوعة: الاقتطاع ظاهر صراحة', async () => {
    load('fixture-community-repo-truncated.html', 'https://github.com/octo/community');
    await start();
    expect(inHost('[data-readme-truncated]').textContent).toMatch(/مقتطعة.*5108/);
  });

  it('زر فحص docs/ داخل الصفحة: لا واجهة صلاحيات في سكربت المحتوى، فالنقر يعلن عدم الاكتمال ولا يرسل شيئًا', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community');
    const calls: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => (calls.push(args), original(...(args as [RequestInfo])))) as typeof fetch;
    try {
      await start();
      await act(async () => {
        inHost('[data-action="scan-docs"]').click();
        await flush(10);
      });
      await act(async () => void (await flush(10)));
      expect(inHost('[data-scan-state="incomplete"]').textContent).toContain('لم يكتمل');
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('مفتاح الشريط يخفيه فورًا ويعيده', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community');
    const { context } = await start();
    expect(text()).toContain('نطاق الفحص');
    await act(async () => {
      await context.settings.set(COMMUNITY_README_BANNER_KEY, false);
      await flush(8);
    });
    expect(text()).not.toContain('نطاق الفحص');
    await act(async () => {
      await context.settings.set(COMMUNITY_README_BANNER_KEY, true);
      await flush(8);
    });
    expect(text()).toContain('نطاق الفحص');
  });

  it('الإيقاف يعيد الصفحة كما كانت حرفيًا', async () => {
    load('fixture-community-repo-arabic.html', 'https://github.com/octo/community');
    const before = document.documentElement.outerHTML;
    const { manager: running } = await start();
    expect(hosts()).toHaveLength(1);
    act(() => running.stop());
    expect(hosts()).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('صفحة تُرسم متأخرة: يظهر الشريط بعد وصول الشجرة لا قبلها', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community');
    const table = document.querySelector('table[aria-labelledby="folders-and-files"]') as HTMLElement;
    const parent = table.parentElement as HTMLElement;
    table.remove();
    document.querySelector('article.markdown-body')?.parentElement?.remove();
    await start(2000);
    expect(hosts()).toHaveLength(0);
    await act(async () => {
      parent.append(table);
      await flush(300);
    });
    expect(hosts()).toHaveLength(1);
    expect(text()).toContain('نطاق الفحص');
  });

  it('صفحة لا تُقرأ بعد انتهاء المهلة: بيان عدم الفحص بلا جزم', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community');
    document.querySelector('table[aria-labelledby="folders-and-files"]')?.remove();
    document.querySelector('article.markdown-body')?.parentElement?.remove();
    await start(20);
    await act(async () => void (await flush(80)));
    expect(inHost('[data-readme-state="unreadable"]').textContent).toContain('لم يُفحص شيء');
    for (const pattern of ASSERTIVE_ABSENCE) expect(text(), String(pattern)).not.toMatch(pattern);
  });

  it('لا تُركَّب في صفحات غير المستودع الرئيسي (مشكلة مثلًا)', async () => {
    load('fixture-community-repo.html', 'https://github.com/octo/community/issues/3');
    await start();
    expect(hosts()).toHaveLength(0);
  });
});

describe('بطاقة الملف الشخصي', () => {
  it('قسمان منفصلان: محتوى عربي من وصف المشاريع، وبيانات معلنة حرفية بتنبيهها', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    await start();
    expect(hosts()).toHaveLength(1);
    expect(inHost('[data-block="arabic-content"] h3').textContent).toBe('محتوى عربي');
    expect([...hosts()[0]!.shadowRoot!.querySelectorAll('[data-block="arabic-content"] [data-repo]')].map((n) => n.getAttribute('data-repo'))).toEqual(['abu_ahmad/arabic-nlp']);
    expect(inHost('[data-block="declared"] h3').textContent).toBe('بيانات يعلنها صاحب الحساب');
    expect(inHost('[data-field="location"]').textContent).toBe('Riyadh, Saudi Arabia');
    expect(inHost('[data-field="name"]').textContent).toBe('Mohammed Al-Farsi');
    expect(inHost('[data-field="bio"]').textContent).toBe('Backend engineer');
    expect(inHost('[data-declared-notice]').textContent).toMatch(/نص حر لا يمثل استنتاجًا/);
  });

  it('لا وسم هوية في الصفحة بعد تركيب البطاقة، والمعلن لا يدخل نص قسم المحتوى', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    await start();
    const content = inHost('[data-block="arabic-content"]').textContent ?? '';
    for (const forbidden of ['Riyadh', 'Saudi', 'Mohammed', 'abu_ahmad ']) expect(content).not.toContain(forbidden);
    const all = text();
    expect(all).not.toMatch(/سعودي|عربي الأصل|ينحدر|جنسيته (هي|:)/);
  });

  it('تبديل الحقول المعلنة لا يغيّر قسم المحتوى', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    await start();
    const first = inHost('[data-block="arabic-content"]').innerHTML;
    act(() => manager?.stop());
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    document.querySelector('.p-name')!.textContent = 'Hiroshi Yamamoto';
    document.querySelector('.p-label')!.textContent = 'Tokyo';
    document.querySelector('.p-note')!.textContent = 'I write Rust';
    await start();
    expect(inHost('[data-block="arabic-content"]').innerHTML).toBe(first);
    expect(inHost('[data-field="location"]').textContent).toBe('Tokyo');
  });

  it('مفتاح البطاقة يخفيها', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    const { context } = await start();
    expect(text()).toContain('بيانات يعلنها صاحب الحساب');
    await act(async () => {
      await context.settings.set(COMMUNITY_PROFILE_CARD_KEY, false);
      await flush(8);
    });
    expect(text()).not.toContain('بيانات يعلنها صاحب الحساب');
  });

  it('الإيقاف يعيد الصفحة كما كانت', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    const before = document.documentElement.outerHTML;
    const { manager: running } = await start();
    act(() => running.stop());
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('صفحة حساب لا تُعرف بنيتها (بلا h-card): لا حقن في موضع مخمَّن', async () => {
    load('fixture-profile.html', 'https://github.com/abu_ahmad');
    document.querySelector('.h-card')?.classList.remove('h-card');
    await start(20);
    await act(async () => void (await flush(60)));
    expect(hosts()).toHaveLength(0);
  });
});
