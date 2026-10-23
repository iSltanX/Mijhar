// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-PR-01 (AC-D1): بطاقة ملخص حالة طلب الدمج على عينة PR المرجعية: الفرع المصدر والهدف، التأخر، الملفات والأسطر والالتزامات،
// المراجعات، التعارضات، ملخص الفحوص بفصل الإلزامية عن الاختيارية؛ وكل قيمة ناقصة في الصفحة «غير متاح» لا قيمة مخمّنة.
// عينتان: صفحة PR حقيقية محفوظة لغير مسجَّل (بلا صندوق دمج)، وعينة معقدة بصندوق دمج وفحوص بكل التصنيفات.
import { describe, expect, it } from 'vitest';
import { PR_STATUS_SELECTORS, UNAVAILABLE_TEXT, createPrStatusModule, parseStatusDetails, readPrSummary } from '../../../src/modules/d/pr-status';
import type { FetchDetails, PrSummary } from '../../../src/modules/d/pr-status';
import { ROOT, flush, hostsOf, loadHtml, mountModules, readFixture, selectorsWith, shadowText } from './helpers';

const REAL_PR = `${ROOT}/fixtures/spikes/gh-pr-watad-80.html`;
const selectors = () => selectorsWith(PR_STATUS_SELECTORS);

const summaryOf = (file: string, fetched?: Parameters<typeof readPrSummary>[2] extends infer O ? (O extends { fetched?: infer F } ? F : never) : never): PrSummary => {
  loadHtml(file);
  return readPrSummary(document, selectors(), { fetched, pageNumber: 4242 });
};

const available = <T,>(v: { available: boolean; value?: T }): T => {
  expect(v.available).toBe(true);
  return v.value as T;
};

describe('صفحة PR حقيقية محفوظة لغير مسجَّل (Watad-Project/Watad#80)', () => {
  const summary = () => summaryOf(REAL_PR);

  it('الفرعان والحالة والالتزامات والملفات والأسطر كما تعرضها الصفحة', () => {
    const s = summary();
    expect(available(s.base)).toEqual({ branch: 'main', repo: 'Watad-Project/Watad' });
    expect(available(s.head)).toEqual({ branch: 'feature/contractor-work-tabs', repo: 'Watad-Project/Watad' });
    expect(available(s.state)).toBe('open');
    expect(available(s.commits)).toBe(8);
    expect(available(s.files)).toBe(56);
    expect(available(s.additions)).toBe(5381);
    expect(available(s.deletions)).toBe(1);
  });

  it('المراجعات من قائمة المراجعين في الشريط الجانبي (تظهر لكل زائر): طلب أحدهم تغييرات', () => {
    const s = summary();
    expect(available(s.reviews)).toEqual({ state: 'changes-requested', evidence: 'Om4rMu requested changes', source: 'sidebar' });
  });

  it('ما لا تعرضه الصفحة لغير المسجَّل يبقى غير متاح بسببه: التعارضات والتأخر (صندوق الدمج للمسجَّل فقط)', () => {
    const s = summary();
    for (const value of [s.conflicts, s.behind]) {
      expect(value.available).toBe(false);
      expect(value.available === false && value.reason.length).toBeGreaterThan(10);
    }
  });

  it('الفحوص: الرمز المجمَّع لآخر التزام (1 / 1) بلا صفوف، فلا تُخمَّن صفوف ولا يُفصل الإلزامي', () => {
    const s = summary();
    expect(available(s.checks.rollup)).toMatchObject({ label: '1 / 1 checks OK', tone: 'success', passed: 1, total: 1 });
    expect(s.checks.items).toHaveLength(0);
    expect(s.checks.requiredKnown).toBe(false);
    expect(s.checks.detailsUrl).toMatch(/^\/Watad-Project\/Watad\/commit\/[0-9a-f]{40}\/status-details\?popover=true$/);
  });
});

describe('العينة المعقدة (صندوق دمج مسجَّل)', () => {
  const summary = () => summaryOf('fixture-pr-complex.html');

  it('الترويسة: بيانات الصفحة المنظّمة تعطي الرقم وsha، والفرعان والتلميح يعطيان المستودع', () => {
    const s = summary();
    expect(available(s.number)).toBe(4242);
    expect(s.headSha).toBe('22c15d5f509f0a7076b74b3f0f48a740802103b4');
    expect(available(s.base)).toEqual({ branch: 'main', repo: 'octo/demo' });
    expect(available(s.head)).toEqual({ branch: 'feature/ui-refresh', repo: 'octo-dev/demo' });
    expect(available(s.commits)).toBe(3);
    expect(available(s.files)).toBe(12);
    expect([available(s.additions), available(s.deletions)]).toEqual([1204, 87]);
  });

  it('المراجعات والتعارضات والتأخر من صندوق الدمج', () => {
    const s = summary();
    expect(available(s.reviews)).toMatchObject({ state: 'review-required' });
    expect(available(s.conflicts)).toBe(true);
    expect(available(s.behind)).toBe(true);
  });

  it('الفحوص بالتصنيفات السبعة كلها، وفصل الإلزامية (4) عن الاختيارية (5)', () => {
    const { checks } = summary();
    expect(checks.source).toBe('mergebox');
    expect(checks.requiredKnown).toBe(true);
    expect(checks.items).toHaveLength(9);
    expect(checks.counts).toEqual({ success: 2, failure: 2, running: 1, skipped: 1, cancelled: 1, 'not-run': 1, unknown: 1 });
    const required = checks.items.filter((i) => i.required === true);
    expect(required.map((i) => [i.name, i.classification.category])).toEqual([
      ['ci / lint (pull_request)', 'failure'],
      ['ci / build (pull_request)', 'running'],
      ['Linux / Browser', 'not-run'],
      ['EasyCLA', 'success'],
    ]);
    expect(checks.items.filter((i) => i.required !== true)).toHaveLength(5);
    expect(checks.items.find((i) => i.name === 'ci / lint (pull_request)')?.id).toBe('9001');
  });

  it('رمز التزام الرأس بمطابقة sha لا بآخر رمز: الأخير هو الأصفر 6 / 12', () => {
    expect(available(summary().checks.rollup)).toMatchObject({ label: '6 / 12 checks OK', tone: 'pending', passed: 6, total: 12 });
  });

  it('بلا صندوق دمج: مراجعات وتعارض غير متاحة ولا تُستنتج من غياب العبارة', () => {
    loadHtml('fixture-pr-complex.html');
    document.querySelector('[data-testid="mergebox-partial"]')?.remove();
    const s = readPrSummary(document, selectors(), { pageNumber: 4242 });
    expect(s.conflicts.available).toBe(false);
    expect(s.reviews.available).toBe(false);
    expect(s.behind.available).toBe(false);
    expect(s.checks.requiredKnown).toBe(false);
  });

  it('صندوق الدمج لا يذكر التعارض: غير متاح لا «لا تعارضات»، وإن صرّح بعدمه فـ false', () => {
    loadHtml('fixture-pr-complex.html');
    const box = document.querySelector('[data-testid="mergebox-partial"]') as Element;
    for (const h of [...box.querySelectorAll('h4')]) if (/conflicts|out-of-date/.test(h.textContent ?? '')) h.closest('section')?.remove();
    expect(readPrSummary(document, selectors()).conflicts.available).toBe(false);
    expect(readPrSummary(document, selectors()).behind.available).toBe(false);
    const ok = document.createElement('p');
    ok.textContent = 'This branch has no conflicts with the base branch';
    box.append(ok);
    const s = readPrSummary(document, selectors());
    expect(s.conflicts).toEqual({ available: true, value: false });
  });

  it('الحالات الأخرى للمراجعة: طُلبت تغييرات ومعتمد', () => {
    loadHtml('fixture-pr-complex.html');
    const box = document.querySelector('[data-testid="mergebox-partial"]') as Element;
    box.querySelector('h4')!.textContent = 'Changes requested';
    box.querySelector('p')!.textContent = 'octo-reviewer requested changes';
    expect(available(readPrSummary(document, selectors()).reviews).state).toBe('changes-requested');
    box.querySelector('h4')!.textContent = 'Changes approved';
    box.querySelector('p')!.textContent = '1 approving review by reviewers with write access.';
    expect(available(readPrSummary(document, selectors()).reviews).state).toBe('approved');
  });
});

describe('المراجعون في الشريط الجانبي', () => {
  const sidebar = (tips: string[], extra = ''): void => {
    loadHtml('fixture-pr-complex.html');
    document.querySelector('[data-testid="mergebox-partial"]')?.remove();
    const form = document.createElement('form');
    form.setAttribute('aria-label', 'Select reviewers');
    form.innerHTML = tips.map((tip, i) => `<a id="review-status-u${i}" aria-labelledby="t${i}" href="#"></a><tool-tip id="t${i}">${tip}</tool-tip>`).join('') + extra;
    document.querySelector('main')!.append(form);
  };
  const state = (): string | undefined => {
    const reviews = readPrSummary(document, selectors()).reviews;
    return reviews.available ? reviews.value.state : undefined;
  };

  it('طلب التغييرات يغلب الاعتماد، والاعتماد يغلب التعليقات، والتعليقات تغلب الانتظار', () => {
    sidebar(['ann approved these changes', 'bob requested changes']);
    expect(state()).toBe('changes-requested');
    sidebar(['ann approved these changes', 'bob left review comments']);
    expect(state()).toBe('approved');
    sidebar(['bob left review comments', 'cy requested a review']);
    expect(state()).toBe('commented');
    sidebar(['Awaiting requested review from cy']);
    expect(state()).toBe('awaiting');
  });

  it('«No reviews» صراحةً = لا مراجعات، وقائمة بلا حالات مقروءة = غير متاح', () => {
    sidebar([], '<p>No reviews</p>');
    expect(state()).toBe('none');
    sidebar([], '<p>Request up to 15 reviewers</p>');
    expect(state()).toBeUndefined();
  });

  it('صندوق الدمج هو المرجع حين يذكر حالة، وإلا يُقرأ الشريط', () => {
    loadHtml('fixture-pr-complex.html');
    const form = document.createElement('form');
    form.setAttribute('aria-label', 'Select reviewers');
    form.innerHTML = '<a id="review-status-u" aria-labelledby="t"></a><tool-tip id="t">ann approved these changes</tool-tip>';
    document.querySelector('main')!.append(form);
    expect(available(readPrSummary(document, selectors()).reviews)).toMatchObject({ state: 'review-required', source: 'mergebox' });
    document.querySelector('[data-testid="mergebox-partial"] section')!.remove();
    expect(available(readPrSummary(document, selectors()).reviews)).toMatchObject({ state: 'approved', source: 'sidebar' });
  });
});

describe('جزء status-details', () => {
  it('صفوف بلا تسجيل دخول: التصنيف من الرمز والوصف، وrequired = null (لا يعرضه الجزء)', () => {
    const doc = new DOMParser().parseFromString(readFixture('fixture-status-details.html'), 'text/html');
    const items = parseStatusDetails(doc);
    expect(items.map((i) => i.classification.category)).toEqual(['success', 'success', 'failure', 'skipped', 'running', 'cancelled']);
    expect(items.every((i) => i.required === null && i.source === 'status-details')).toBe(true);
    expect(items[2]).toMatchObject({ name: 'build-and-deploy / test (pull_request)', detail: 'Failing after 4m', id: '7003' });
  });
});

describe('الوحدة d.pr-status على الصفحة', () => {
  const fragment: FetchDetails = async () => readFixture('fixture-status-details.html');

  it('تُدرج المضيف بعد ترويسة الطلب وتعرض الحقول، وتُزال بإيقاف الوحدة فيعود DOM الصفحة كما كان', async () => {
    loadHtml('fixture-pr-complex.html');
    const before = document.documentElement.outerHTML;
    const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5 })]);
    const [host] = hostsOf('d.pr-status');
    expect(errors).toEqual([]);
    expect(host).toBeDefined();
    expect(host?.previousElementSibling?.getAttribute('data-component')).toBe('PageHeader');
    const card = host?.shadowRoot?.querySelector('[data-card="pr-status"]');
    expect(card).not.toBeNull();
    const text = shadowText(host);
    for (const expected of ['ملخص حالة طلب الدمج', 'مفتوح', 'feature/ui-refresh', 'main', 'مطلوب مراجعة', 'يوجد تعارض يجب حله', 'متأخر عن فرع الهدف', 'الإلزامية (4)', 'الاختيارية (5)']) {
      expect(text, expected).toContain(expected);
    }
    // التصنيفات السبعة بنصها.
    for (const label of ['ناجح', 'فاشل', 'قيد التشغيل', 'متجاوز', 'ملغى', 'لم يُشغَّل', 'غير معروف']) expect(text, label).toContain(label);
    // لا ادعاء جاهزية.
    expect(text).not.toMatch(/جاهز للدمج|ready to merge/i);
    manager.stop();
    expect(hostsOf('d.pr-status')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('صفحة حقيقية لغير مسجَّل: غير متاح للمراجعات والتعارضات والتأخر، وتفاصيل الفحوص تُجلب من status-details بنفس الأصل', async () => {
    loadHtml(REAL_PR);
    const requested: string[] = [];
    const { manager } = await mountModules([
      createPrStatusModule({
        debounceMs: 5,
        fetchDetails: async (url) => {
          requested.push(url);
          return readFixture('fixture-status-details.html');
        },
      }),
    ]);
    await flush(30);
    const [host] = hostsOf('d.pr-status');
    const text = shadowText(host);
    expect(text).toContain('feature/contractor-work-tabs');
    expect(text).toContain('5,381');
    expect(host?.shadowRoot?.querySelector('[data-field="reviews"] [data-available="true"]')?.textContent?.trim()).toBe('طُلبت تغييرات');
    expect(host?.shadowRoot?.querySelector('[data-field="reviews"] [data-review-source="sidebar"]')?.getAttribute('title')).toBe('Om4rMu requested changes');
    expect(host?.shadowRoot?.querySelector('[data-field="conflicts"] [data-available="false"]')?.textContent).toBe(UNAVAILABLE_TEXT);
    expect(host?.shadowRoot?.querySelector('[data-field="behind"] [data-available="false"]')?.textContent).toBe(UNAVAILABLE_TEXT);
    expect(host?.shadowRoot?.querySelector('[data-required="unavailable"]')).not.toBeNull();
    // طلب واحد لالتزام الرأس: آخر رمز في المحادثة.
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatch(/\/commit\/[0-9a-f]{40}\/status-details\?popover=true$/);
    expect(host?.shadowRoot?.querySelector('[data-group="all"]')).not.toBeNull();
    manager.stop();
  });

  it('فشل جلب التفاصيل: يُعلَن «غير متاح» بسببه ولا يُعرض نجاحًا', async () => {
    loadHtml(REAL_PR);
    const { manager } = await mountModules([
      createPrStatusModule({
        debounceMs: 5,
        fetchDetails: async () => {
          throw new Error('HTTP 429');
        },
      }),
    ]);
    await flush(30);
    const [host] = hostsOf('d.pr-status');
    const state = host?.shadowRoot?.querySelector('[data-checks-state="error"]');
    expect(state?.textContent).toContain('HTTP 429');
    expect(state?.textContent).toContain(UNAVAILABLE_TEXT);
    expect(host?.shadowRoot?.querySelectorAll('.d-chip')).toHaveLength(0);
    manager.stop();
  });

  it('لا فحوص مُبلَّغ عنها: جزء status-details بلا صفوف يعلن ذلك ولا يعرضه «قيد التشغيل»', async () => {
    loadHtml(REAL_PR);
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: async () => '<div class="merge-status-list"></div>' })]);
    await flush(30);
    const [host] = hostsOf('d.pr-status');
    expect(host?.shadowRoot?.querySelector('[data-checks-state="none-reported"]')?.textContent).toContain('لا فحوص مُبلَّغ عنها');
    manager.stop();
  });

  it('إعادة تركيب الوحدة (تنقل أو إعادة رسم الصفحة) لا تكرر طلب الالتزام نفسه، وتنتهي صلاحية النتيجة بعد مهلتها، والفشل لا يُحفظ', async () => {
    loadHtml(REAL_PR);
    let clock = 1000;
    const requested: string[] = [];
    let fail = false;
    const module = createPrStatusModule({
      debounceMs: 5,
      cacheMs: 5000,
      now: () => clock,
      fetchDetails: async (url) => {
        requested.push(url);
        if (fail) throw new Error('HTTP 500');
        return readFixture('fixture-status-details.html');
      },
    });
    const first = await mountModules([module]);
    await flush(30);
    expect(requested).toHaveLength(1);
    first.manager.refresh();
    first.manager.stop();
    const second = await mountModules([module]);
    await flush(30);
    expect(requested).toHaveLength(1);
    expect(shadowText(hostsOf('d.pr-status')[0])).toContain('ناجح');
    second.manager.stop();
    clock += 6000;
    const third = await mountModules([module]);
    await flush(30);
    expect(requested).toHaveLength(2);
    third.manager.stop();
    // فشل: لا يُحفظ فتعيد المحاولة التالية الطلب.
    clock += 6000;
    fail = true;
    const fourth = await mountModules([module]);
    await flush(30);
    expect(requested).toHaveLength(3);
    fourth.manager.stop();
    fail = false;
    const fifth = await mountModules([module]);
    await flush(30);
    expect(requested).toHaveLength(4);
    fifth.manager.stop();
  });

  it('لا طلب إلى خارج github.com ولا إلى api.github.com', async () => {
    const { sameOriginFetch } = await import('../../../src/modules/d/pr-status');
    await expect(sameOriginFetch('https://api.github.com/repos/o/r/pulls/1', new AbortController().signal)).rejects.toThrow('خارج github.com');
    await expect(sameOriginFetch('https://evil.example/x', new AbortController().signal)).rejects.toThrow('خارج github.com');
  });

  it('تتجدد البطاقة حين تتغير الصفحة بعد التركيب (الالتزامات 3 ← 4)', async () => {
    loadHtml('fixture-pr-complex.html');
    const { manager } = await mountModules([createPrStatusModule({ debounceMs: 5 })]);
    const [host] = hostsOf('d.pr-status');
    const commits = () => host?.shadowRoot?.querySelector('[data-field="commits"] dd')?.textContent?.trim();
    expect(commits()).toBe('3');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue?.includes('wants to merge 3 commits')) node.nodeValue = node.nodeValue.replace('3 commits', '4 commits');
    }
    await flush(40);
    expect(commits()).toBe('4');
    manager.stop();
  });
});
