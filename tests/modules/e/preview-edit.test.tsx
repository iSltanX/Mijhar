// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-04 (AC-E4) على مستوى الوحدة (والشق e2e وتدقيق الشبكة في المتصفحات في browser/builder-check.mjs) وواجهة TEST-PRIV-02 (AC-E5):
// الوحدة مركَّبة في الصفحة كما تركّبها الإضافة. محدّد القوالب يبدّل الحزمة؛ والمعاينة تقبل التعديل اليدوي، وما فيها (بتعديلاتها) هو بعينه ما
// يُنسخ أو يُنزَّل `.md`؛ وتعديلاتها لا يستبدلها تغيير القالب أو الاختيار إلا بطلب صريح؛ ولا طلب شبكة (fetch أو XHR أو sendBeacon) في البناء
// والمعاينة والتعديل والنسخ والتنزيل. واللافتة دائمة وفيها إخلاء المسؤولية، والفاحص يظلل الأنماط المشبوهة في النص الحالي (ومنه المعدَّل)
// دون أن يغيّر منه شيئًا.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAPS_HEADING, createContextBuilderModule, downloadMarkdown } from '../../../src/modules/e/builder';
import { PRIVACY_BANNER, PRIVACY_DISCLAIMER } from '../../../src/modules/e/privacy-check';
import { TEMPLATES } from '../../../src/modules/e/templates';
import { flush, hostsOf, mountModules } from '../d/helpers';
import { E_FIXTURE, loadFile } from './helpers';

const NOW = Date.UTC(2026, 9, 24, 9, 30);
// رموز وهمية تُركَّب وقت التشغيل.
const TOKEN = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
const AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

let fetchSpy: ReturnType<typeof vi.spyOn>;
let xhrSpy: ReturnType<typeof vi.spyOn>;
let beacon: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'sendBeacon');
});

const noNetwork = () => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(xhrSpy).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
};

async function mounted(extra: { download?: boolean } = {}) {
  loadFile(E_FIXTURE);
  const copied: string[] = [];
  const downloaded: Array<{ text: string; name: string }> = [];
  const copy = vi.fn(async (text: string) => {
    copied.push(text);
    return 'copied' as const;
  });
  const download = vi.fn(async (text: string, name: string) => {
    downloaded.push({ text, name });
    return 'downloaded' as const;
  });
  const { manager, errors } = await mountModules([createContextBuilderModule({ now: () => NOW, copy, ...(extra.download === false ? {} : { download }) })]);
  const root = () => hostsOf('e.builder')[0]?.shadowRoot as ShadowRoot;
  const q = <E extends Element = HTMLElement>(sel: string) => root().querySelector(sel) as E | null;
  const area = () => q<HTMLTextAreaElement>('[data-preview]') as HTMLTextAreaElement;
  const preview = () => area().value;
  const click = async (sel: string) => {
    const el = q<HTMLElement>(sel);
    if (!el) throw new Error(`لا عنصر: ${sel}`);
    el.click();
    await flush();
  };
  const type = async (text: string) => {
    area().value = text;
    area().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  await click('[data-action="builder-toggle"]');
  return { manager, errors, root, q, area, preview, click, type, copy, copied, download, downloaded };
}
type Ui = Awaited<ReturnType<typeof mounted>>;
const headings = (text: string) => text.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));

describe('محدّد القوالب', () => {
  it('خمسة خيارات: حزمة عامة ثم القوالب الأربعة؛ والافتراضي العامة بمخرجها السابق', async () => {
    const ui = await mounted();
    const radios = [...ui.root().querySelectorAll<HTMLInputElement>('input[name="mj-e-template"]')];
    expect(radios.map((r) => r.getAttribute('data-template'))).toEqual(['none', 'diagnose', 'review', 'handoff', 'resume']);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false, false, false]);
    expect(ui.preview()).toContain('# حزمة سياق: feat: refresh the settings UI');
    ui.manager.stop();
  });

  it.each(TEMPLATES)('اختيار «$label» يولّد حزمته في المعاينة، والرجوع إلى العامة يعيدها', async (template) => {
    const ui = await mounted();
    await ui.click(`input[data-template="${template.id}"]`);
    expect(ui.preview().split('\n')[0]).toBe(`# ${template.titlePrefix}: feat: refresh the settings UI`);
    expect(headings(ui.preview()).at(-1)).toBe(GAPS_HEADING);
    expect(headings(ui.preview()).map((h) => h.replace(/ \(.*\)$/, ''))).toEqual([...template.sections.map((s) => s.heading), GAPS_HEADING]);
    // قائمة الاختيار تحكم القالب أيضًا.
    await ui.click('input[data-item="checks"]');
    expect(ui.preview()).not.toContain('`EasyCLA`');
    await ui.click('input[data-item="checks"]');
    expect(ui.preview()).toContain('`EasyCLA`');
    await ui.click('input[data-template="none"]');
    expect(ui.preview().split('\n')[0]).toBe('# حزمة سياق: feat: refresh the settings UI');
    expect(ui.errors).toEqual([]);
    ui.manager.stop();
  });

  it('قسم «ما تعذّر جمعه أو اقتُطع لطوله» في الواجهة وفي الحزمة معًا مع كل قالب', async () => {
    const ui = await mounted();
    for (const t of TEMPLATES) {
      await ui.click(`input[data-template="${t.id}"]`);
      const ui_items = [...ui.root().querySelectorAll('[data-gaps] li')].length;
      const inBundle = ui.preview().slice(ui.preview().indexOf(`## ${GAPS_HEADING}`)).split('\n').filter((l) => l.startsWith('- **')).length;
      expect(inBundle, t.id).toBe(ui_items);
      expect(ui_items).toBeGreaterThanOrEqual(4);
    }
    ui.manager.stop();
  });
});

describe('TEST-CTX-04: المعاينة قابلة للتعديل قبل النسخ أو التنزيل', () => {
  it('حقل المعاينة غير للقراءة فقط، وتعديله يظهر في النص ويعلن أنه معدَّل', async () => {
    const ui = await mounted();
    expect(ui.area().readOnly).toBe(false);
    expect(ui.q('[data-edited]')).toBeNull();
    const generated = ui.preview();
    await ui.type(`${generated}\n\nملاحظة يدوية من المستخدم.`);
    expect(ui.preview()).toContain('ملاحظة يدوية من المستخدم.');
    expect(ui.q('[data-edited]')).not.toBeNull();
    expect(ui.errors).toEqual([]);
    ui.manager.stop();
  });

  it('«انسخ الحزمة» ينسخ النص المعدَّل بعينه لا المولَّد', async () => {
    const ui = await mounted();
    await ui.click('input[data-template="handoff"]');
    const edited = ui.preview().replace('(يكتبه من يسلّم المهمة: اكتب هنا قبل النسخ.)', 'أنهيت ربط الواجهة بالإعدادات.');
    expect(edited).not.toBe(ui.preview());
    await ui.type(edited);
    await ui.click('[data-action="builder-copy"]');
    expect(ui.copy).toHaveBeenCalledTimes(1);
    expect(ui.copied[0]).toBe(edited);
    expect(ui.copied[0]).toContain('أنهيت ربط الواجهة بالإعدادات.');
    expect(ui.q('[data-copy-state]')?.getAttribute('data-copy-state')).toBe('copied');
    ui.manager.stop();
  });

  it('«نزّل كملف .md» ينزّل النص المعدَّل بعينه باسم من المصدر والقالب، ويعلن طلب التنزيل لا اكتماله', async () => {
    const ui = await mounted();
    await ui.click('input[data-template="review"]');
    await ui.type(`${ui.preview()}\nسطر أضافه المستخدم`);
    await ui.click('[data-action="builder-download"]');
    expect(ui.download).toHaveBeenCalledTimes(1);
    expect(ui.downloaded[0]?.name).toBe('mijhar-pr-octo-demo-4242-review.md');
    expect(ui.downloaded[0]?.text).toBe(ui.preview());
    expect(ui.downloaded[0]?.text.endsWith('سطر أضافه المستخدم')).toBe(true);
    const note = ui.q('[data-download-state]');
    expect(note?.getAttribute('data-download-state')).toBe('downloaded');
    expect(note?.textContent).toContain('طُلب من المتصفح تنزيل الملف mijhar-pr-octo-demo-4242-review.md');
    expect(note?.textContent).toContain('لم تُرسل الحزمة إلى أي جهة');
    // العامة بلا قالب: اسم context.
    await ui.click('input[data-template="none"]');
    await ui.click('[data-action="builder-download"]');
    expect(ui.downloaded.at(-1)?.name).toBe('mijhar-pr-octo-demo-4242-context.md');
    ui.manager.stop();
  });

  it('تغيير القالب أو الاختيار لا يستبدل النص المعدَّل؛ و«استبدلها بالنص المولَّد» يعيد المولَّد ويزيل التنبيه', async () => {
    const ui = await mounted();
    await ui.type('نص كتبته بيدي');
    await ui.click('input[data-template="resume"]');
    await ui.click('input[data-item="checks"]');
    await ui.click('input[data-item="description"]');
    expect(ui.preview()).toBe('نص كتبته بيدي');
    expect(ui.q('[data-edited]')).not.toBeNull();
    await ui.click('[data-action="builder-regenerate"]');
    expect(ui.q('[data-edited]')).toBeNull();
    expect(ui.preview().split('\n')[0]).toBe('# استكمال عمل: feat: refresh the settings UI');
    expect(ui.preview()).not.toContain('`EasyCLA`'); // الفحوص ما زالت غير مختارة
    expect(ui.preview()).not.toContain('> Refresh the settings UI');
    ui.manager.stop();
  });

  it('إعادة النص المعدَّل إلى المولَّد بعينه يزيل صفة «معدَّل»', async () => {
    const ui = await mounted();
    const generated = ui.preview();
    await ui.type('تعديل');
    expect(ui.q('[data-edited]')).not.toBeNull();
    await ui.type(generated);
    expect(ui.q('[data-edited]')).toBeNull();
    await ui.click('input[data-item="checks"]'); // وهو يتبع الاختيار من جديد
    expect(ui.preview()).not.toContain('## نتائج الفحوص');
    ui.manager.stop();
  });

  it('الوحدة تزوّد النافذة بالمنزِّل الافتراضي فيكون زر التنزيل مفعَّلًا دائمًا في الإضافة', async () => {
    const ui = await mounted({ download: false });
    expect(ui.q<HTMLButtonElement>('[data-action="builder-download"]')?.disabled).toBe(false);
    ui.manager.stop();
  });

  it('لا طلب شبكة (fetch وXHR وsendBeacon) أثناء البناء والمعاينة والتبديل والتعديل والنسخ والتنزيل', async () => {
    const ui = await mounted();
    for (const t of TEMPLATES) await ui.click(`input[data-template="${t.id}"]`);
    await ui.click('input[data-item="checks"]');
    await ui.type(`${ui.preview()}\nتعديل`);
    await ui.click('[data-action="builder-copy"]');
    await ui.click('[data-action="builder-download"]');
    await ui.click('[data-action="builder-regenerate"]');
    await ui.click('[data-action="builder-recollect"]');
    expect(ui.errors).toEqual([]);
    noNetwork();
    ui.manager.stop();
  });
});

describe('التنزيل الافتراضي (Blob محلي ورابط blob:)', () => {
  function stubBlobUrls() {
    const blobs: Blob[] = [];
    const created = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:https://github.com/${blobs.length}`;
    });
    const revoked = vi.fn();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
    const clicks: Array<{ href: string; download: string; hidden: boolean; connected: boolean; stopped: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // نقرة التنزيل لا تخرج إلى معالجات الصفحة: مستمع على المستند لا يراها.
      const seen = vi.fn();
      document.addEventListener('click', seen, { once: true });
      // jsdom لا ينفّذ التنقل: يُمنع الفعل الافتراضي بعد أن يمرّ الحدث على مستمع الوحدة.
      this.addEventListener('click', (e) => e.preventDefault(), { once: true });
      this.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
      clicks.push({ href: this.href, download: this.download, hidden: this.hidden === true, connected: this.isConnected, stopped: !seen.mock.calls.length });
      document.removeEventListener('click', seen);
    });
    return { blobs, created, revoked, clicks };
  }

  it('الوحدة بلا خيار download: النقر على التنزيل يبني Blob بنص المعاينة ويطلب التنزيل باسمه، ويزيل العنصر ويلغي الرابط لاحقًا', async () => {
    const stub = stubBlobUrls();
    // إلغاء الرابط مؤجَّل 10 ثوانٍ: يُلتقط المؤقِّت ويُنفَّذ يدويًا (بلا مؤقِّتات مزيفة تعلّق mountModules).
    const realSetTimeout = globalThis.setTimeout;
    const delayed: Array<() => void> = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 10_000) {
        delayed.push(fn);
        return 0;
      }
      return realSetTimeout(fn, ms);
    }) as unknown as typeof setTimeout);
    loadFile(E_FIXTURE);
    const { manager } = await mountModules([createContextBuilderModule({ now: () => NOW })]);
    const root = hostsOf('e.builder')[0]?.shadowRoot as ShadowRoot;
    const press = async (sel: string) => {
      (root.querySelector(sel) as HTMLElement).click();
      await flush();
    };
    await press('[data-action="builder-toggle"]');
    await press('input[data-template="diagnose"]');
    const area = root.querySelector('[data-preview]') as HTMLTextAreaElement;
    area.value = `${area.value}\nتعديل يدوي`;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    await press('[data-action="builder-download"]');
    expect(stub.created).toHaveBeenCalledTimes(1);
    const blob = stub.blobs[0] as Blob;
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe(area.value);
    expect(stub.clicks).toEqual([{ href: 'blob:https://github.com/1', download: 'mijhar-pr-octo-demo-4242-diagnose.md', hidden: true, connected: true, stopped: true }]);
    expect(root.querySelector('a[download]')).toBeNull();
    expect(stub.revoked).not.toHaveBeenCalled();
    expect(delayed).toHaveLength(1);
    delayed[0]?.();
    expect(stub.revoked).toHaveBeenCalledWith('blob:https://github.com/1');
    expect(root.querySelector('[data-download-state]')?.getAttribute('data-download-state')).toBe('downloaded');
    noNetwork();
    manager.stop();
  });

  it('فشل المتصفح في إنشاء الرابط يُعلن فشلًا بنص بديل (انسخ يدويًا)', async () => {
    Object.assign(URL, {
      createObjectURL: () => {
        throw new Error('blocked');
      },
      revokeObjectURL: vi.fn(),
    });
    const host = document.createElement('div');
    document.body.append(host);
    await expect(downloadMarkdown('x', 'a.md', host)).resolves.toBe('failed');
    host.remove();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
    await expect(downloadMarkdown('x', 'a.md', document.createElement('div'))).resolves.toBe('failed');
  });
});

describe('TEST-PRIV-02 (الواجهة): اللافتة الدائمة وإخلاء المسؤولية وتظليل المرصود', () => {
  const area = (ui: Ui) => ui.area();

  it('اللافتة وإخلاء المسؤولية ظاهران دائمًا حتى بلا أي نمط مشبوه، وتقولان إن الفحص لا يضمن ولا يزيل', async () => {
    const ui = await mounted();
    const text = ui.q('[data-privacy]')?.textContent ?? '';
    expect(ui.q('[data-privacy-banner]')?.textContent).toBe(PRIVACY_BANNER);
    expect(ui.q('[data-privacy-disclaimer]')?.textContent).toBe(PRIVACY_DISCLAIMER);
    expect(text).toContain('قد تحتوي السجلات والتعليقات على بيانات خاصة');
    expect(text).toContain('لا يضمن كشف كل الأسرار');
    expect(text).toContain('لا يزيل أي نص');
    expect(text).toContain('المراجعة البشرية للمعاينة لازمة دائمًا');
    expect(ui.q('[data-privacy]')?.getAttribute('data-findings')).toBe('0');
    expect(ui.q('[data-privacy-none]')?.textContent).toContain('هذا لا يعني خلو المعاينة من الأسرار');
    expect(ui.q('[data-privacy-found]')).toBeNull();
    // القائمة المفحوصة مذكورة.
    const patterns = [...ui.root().querySelectorAll('[data-privacy-patterns] li')].map((li) => li.textContent);
    expect(patterns.join('|')).toContain('ghp_');
    expect(patterns.join('|')).toContain('Bearer');
    expect(patterns.join('|')).toContain('AKIA');
    // وتبقى مع كل قالب.
    for (const t of TEMPLATES) {
      await ui.click(`input[data-template="${t.id}"]`);
      expect(ui.q('[data-privacy-banner]')).not.toBeNull();
      expect(ui.q('[data-privacy-disclaimer]')).not.toBeNull();
    }
    ui.manager.stop();
  });

  it('رمز وهمي في مقتطف دليل من تعليق: يُرصد ويُظلَّل بسطره، وهو باقٍ في المعاينة كما هو (لا إزالة)', async () => {
    const ui = await mounted();
    const body = document.querySelector('#issuecomment-1001 .js-comment-body') as Element;
    body.textContent = `The job printed GH_TOKEN=${TOKEN} before failing.`;
    const range = document.createRange();
    range.selectNodeContents(body);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await flush();
    await ui.click('[data-action="snippet-add"]');
    expect(ui.preview()).toContain(TOKEN);
    const found = ui.q('[data-privacy-found]');
    expect(found).not.toBeNull();
    expect(ui.q('[data-privacy]')?.getAttribute('data-findings')).toBe('1');
    const row = found?.querySelector('li[data-finding="github-token"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('mark[data-finding-mark]')?.textContent).toBe(TOKEN);
    const line = ui.preview().split('\n').findIndex((l) => l.includes(TOKEN)) + 1;
    expect(row?.getAttribute('data-line')).toBe(String(line));
    expect(row?.textContent).toContain(`سطر ${line}`);
    expect(found?.textContent).toContain('لم يُحذف منها شيء');
    ui.manager.stop();
  });

  it('تعديل المعاينة يدويًا بإضافة رموز: يُرصد كل نمط (ghp_ وBearer وAKIA) فورًا، وحذفها يُسقط التنبيه', async () => {
    const ui = await mounted();
    const clean = ui.preview();
    const bearer = `Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'fakepayload', 'signature123'].join('.')}`;
    await ui.type(`${clean}\nGH_TOKEN=${TOKEN}\nAuthorization: ${bearer}\naws_access_key_id=${AWS}\n`);
    expect(ui.q('[data-privacy]')?.getAttribute('data-findings')).toBe('3');
    const ids = [...ui.root().querySelectorAll('[data-privacy-found] li')].map((li) => li.getAttribute('data-finding'));
    expect(ids).toEqual(['github-token', 'bearer', 'aws-access-key']);
    expect([...ui.root().querySelectorAll('mark[data-finding-mark]')].map((m) => m.textContent)).toEqual([TOKEN, bearer, AWS]);
    // النص كما كتبه المستخدم تمامًا؛ لم يُزَل شيء.
    expect(ui.preview()).toContain(`GH_TOKEN=${TOKEN}`);
    expect(ui.preview()).toContain(AWS);
    await ui.type(clean);
    expect(ui.q('[data-privacy]')?.getAttribute('data-findings')).toBe('0');
    expect(ui.q('[data-privacy-found]')).toBeNull();
    ui.manager.stop();
  });

  it('«انسخ» و«نزّل» مع مرصودات: يُنسخ النص كما هو ويُعلن عدد المرصودات وأن شيئًا لم يُحذف', async () => {
    const ui = await mounted();
    const edited = `${ui.preview()}\nGH_TOKEN=${TOKEN}\n`;
    await ui.type(edited);
    await ui.click('[data-action="builder-copy"]');
    expect(ui.copied[0]).toBe(edited);
    expect(ui.copied[0]).toContain(TOKEN);
    const note = ui.q('[data-copy-state]')?.textContent ?? '';
    expect(note).toContain('وفيها 1 من الأنماط المشبوهة لم يُحذف منها شيء');
    await ui.click('[data-action="builder-download"]');
    expect(ui.downloaded[0]?.text).toBe(edited);
    expect(ui.q('[data-download-state]')?.textContent).toContain('وفيها 1 من الأنماط المشبوهة لم يُحذف منها شيء');
    ui.manager.stop();
  });

  it('«حدّد في المعاينة» يحدد الموضع المرصود بعينه في حقل المعاينة', async () => {
    const ui = await mounted();
    await ui.type(`${ui.preview()}\nGH_TOKEN=${TOKEN}\n`);
    await ui.click('[data-action="finding-select"]');
    const a = area(ui);
    expect(a.value.slice(a.selectionStart, a.selectionEnd)).toBe(TOKEN);
    ui.manager.stop();
  });

  it('أكثر من 20 مرصودًا: تُعرض 20 ويُعدّ الباقي صراحة', async () => {
    const ui = await mounted();
    const many = Array.from({ length: 25 }, (_, i) => `K${i}=${['AKIA', `IOSFODNN7EXAM${String(i).padStart(3, '0')}`].join('')}`).join('\n');
    await ui.type(many);
    expect(ui.q('[data-privacy]')?.getAttribute('data-findings')).toBe('25');
    expect(ui.root().querySelectorAll('[data-privacy-found] li')).toHaveLength(20);
    expect(ui.q('[data-privacy-found]')?.textContent).toContain('و5 أخرى لم تُعرض هنا');
    ui.manager.stop();
  });

  it('لا طلب شبكة من الفاحص', async () => {
    const ui = await mounted();
    await ui.type(`GH_TOKEN=${TOKEN}`);
    await ui.click('[data-action="finding-select"]');
    noNetwork();
    ui.manager.stop();
  });
});
