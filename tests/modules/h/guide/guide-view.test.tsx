// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/community"}
// TEST-COMM-03 (AC-H3) على العينة المرجعية fixture-community-repo.html مع CONTRIBUTING.md: ملخص الخطوات كما وردت، وروابط وسوم المبتدئين
// بعددها المتاح فعلًا، وخارطة الطريق، وما لم يُعثر عليه، وعدم تنفيذ أي إجراء نيابة عن المستخدم.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROADMAP, createGuideView, summarizeContributing } from '../../../../src/modules/h/first-contribution';
import type { FetchText } from '../../../../src/modules/h/first-contribution';
import { pageInfoFromUrl } from '../../../../src/shared/page';
import type { PageSource } from '../../../../src/shared/page';
import { ASSERTIVE_ABSENCE, fakeAccess, fixtureText, flush } from '../helpers';
import TERMS from '../../../../src/modules/h/first-contribution/terms.json';

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

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const settle = async (ms = 10) => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(10);
  });
  await settle();
};
const source = (href: string): PageSource => ({ read: async () => pageInfoFromUrl(href, 't'), subscribe: () => () => {} });

const FILES: Record<string, string> = {
  'README.md': fixtureText('fixture-readme.md'),
  'CONTRIBUTING.md': fixtureText('fixture-contributing.md'),
  '.github/pull_request_template.md': fixtureText('fixture-pr-template.md'),
};

function recordingFetch(files: Record<string, string>): { fetchText: FetchText; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetchText: async (url) => {
      urls.push(url);
      const rel = decodeURIComponent(url.replace('https://github.com/octo/community/raw/HEAD/', ''));
      return rel in files ? { ok: true, text: files[rel] as string } : { ok: false, reason: 'not-found', status: 404 };
    },
  };
}

async function mount(options: { files?: Record<string, string>; href?: string; access?: ReturnType<typeof fakeAccess> } = {}) {
  const net = recordingFetch(options.files ?? FILES);
  const access = options.access ?? fakeAccess((p) => ({ body: { total_count: decodeURIComponent(p).includes('good first issue') ? 12 : 2 } }));
  const View = createGuideView({ source: () => source(options.href ?? 'https://github.com/octo/community'), fetchText: net.fetchText, access: () => access });
  await act(async () => render(<View settings={null as never} surface="native" />, container));
  await settle();
  return { net, access };
}

describe('المرشد على العينة المرجعية', () => {
  it('قبل النقر: روابط الوسوم وخارطة الطريق ظاهرة، ولا طلب شبكة ولا صلاحية', async () => {
    const { net, access } = await mount();
    expect(net.urls).toEqual([]);
    expect(access.calls).toEqual([]);
    expect(container.querySelector('[data-guide-state]')).toBeNull();
    expect(container.querySelectorAll('[data-section="beginner-labels"] a')).toHaveLength(3);
    expect(container.querySelectorAll('[data-section="roadmap"] li')).toHaveLength(5);
  });

  it('النقر على «اقرأ تعليمات هذا المشروع»: ملخص الخطوات كما وردت في CONTRIBUTING', async () => {
    const { net } = await mount();
    await click($('[data-action="read-project"]'));
    const expected = summarizeContributing(FILES['CONTRIBUTING.md'] as string);
    const shown = [...container.querySelectorAll('[data-file="contributing"] [data-group]')].map((g) => ({
      heading: g.getAttribute('data-group'),
      steps: [...g.querySelectorAll('li')].map((li) => li.textContent),
    }));
    expect(shown).toEqual(expected.groups.map((g) => ({ heading: g.heading, steps: [...g.steps] })));
    expect(shown.length).toBeGreaterThan(0);
    expect($('[data-note-id="issue-first"] .quote').textContent).toBe('Please open an issue first to discuss any large change before submitting a pull request.');
    expect($('[data-file="readme"]').textContent).toContain('Read CONTRIBUTING.md first.');
    expect([...container.querySelectorAll('[data-checklist] li')].map((li) => li.textContent)).toEqual(['I have read CONTRIBUTING.md', 'I added tests', 'I updated the documentation']);
    // الطلبات: نصوص الملفات من github.com وحده.
    for (const url of net.urls) expect(url).toMatch(/^https:\/\/github\.com\/octo\/community\/raw\/HEAD\//);
  });

  it('يُظهر ما لم يُعثر عليه (CODE_OF_CONDUCT هنا) مع ما جُرِّب، بلا جزم', async () => {
    await mount();
    await click($('[data-action="read-project"]'));
    const missing = $('[data-missing-kind="conduct"]').textContent ?? '';
    expect(missing).toContain('لم يُعثر على CODE_OF_CONDUCT');
    expect(missing).toContain('.github/CODE_OF_CONDUCT.md');
    for (const pattern of ASSERTIVE_ABSENCE) expect(missing, String(pattern)).not.toMatch(pattern);
  });

  it('فشل شبكة لملف يُعلن «تعذّرت قراءة» لا «لم يُعثر»', async () => {
    const urls: string[] = [];
    const View = createGuideView({
      source: () => source('https://github.com/octo/community'),
      fetchText: async (url) => {
        urls.push(url);
        return url.includes('CONTRIBUTING') ? { ok: false, reason: 'network' } : { ok: false, reason: 'not-found', status: 404 };
      },
      access: () => fakeAccess(() => ({ body: {} })),
    });
    await act(async () => render(<View settings={null as never} surface="native" />, container));
    await settle();
    await click($('[data-action="read-project"]'));
    expect($('[data-failed-kind="contributing"]').textContent).toContain('تعذّرت قراءة');
    expect(container.querySelector('[data-missing-kind="contributing"]')).toBeNull();
  });

  it('وسوم المبتدئين: روابط بصياغة صحيحة، والعدد بعد النقر وبالصلاحية فقط', async () => {
    const { access } = await mount();
    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-section="beginner-labels"] [data-label] a')];
    expect(links.map((a) => decodeURIComponent(new URL(a.href).searchParams.get('q') ?? ''))).toEqual(['is:issue is:open label:"good first issue"', 'is:issue is:open label:"help wanted"', 'is:issue is:open label:"documentation"']);
    expect(container.querySelector('[data-count]')).toBeNull();
    await click($('[data-action="load-counts"]'));
    expect(access.calls[0]).toBe('request');
    expect($('[data-label="good first issue"] [data-count]').getAttribute('data-count')).toBe('12');
    expect($('[data-label="documentation"] [data-count]').getAttribute('data-count')).toBe('2');
  });

  it('رفض الصلاحية: الأعداد غير متاحة بسببها والروابط باقية', async () => {
    await mount({ access: fakeAccess(() => ({ body: {} }), { granted: false }) });
    await click($('[data-action="load-counts"]'));
    expect(container.querySelector('[data-count]')).toBeNull();
    expect($('[data-label="help wanted"] [data-count-unavailable]').textContent).toContain('رُفضت الصلاحية');
    expect(container.querySelectorAll('[data-section="beginner-labels"] a')).toHaveLength(3);
  });

  it('خارطة الطريق: خمس خطوات بشرح المصطلحات من القاموس', async () => {
    await mount();
    const steps = [...container.querySelectorAll('[data-section="roadmap"] li')];
    expect(steps.map((s) => s.getAttribute('data-term'))).toEqual(['issue', 'fork', 'branch', 'commit', 'pull_request']);
    expect(ROADMAP.map((r) => r.text)).toEqual(steps.map((s) => s.firstChild?.textContent));
    for (const term of TERMS) expect(container.querySelector(`[data-term="${term.id}"]`)?.textContent).toContain(term.brief);
  });

  it('لا ينفذ إجراء نيابة عن المستخدم: لا نشر ولا فتح نوافذ ولا إرسال نماذج ولا سوى روابط للقراءة', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const submit = vi.fn();
    document.addEventListener('submit', submit, true);
    await mount();
    await click($('[data-action="read-project"]'));
    await click($('[data-action="load-counts"]'));
    expect(openSpy).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(container.querySelector('form')).toBeNull();
    for (const button of container.querySelectorAll('button')) expect(['read-project', 'load-counts']).toContain(button.getAttribute('data-action'));
    for (const a of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.href).toMatch(/^https:\/\/github\.com\//);
    }
    document.removeEventListener('submit', submit, true);
    openSpy.mockRestore();
  });

  it('تغيّر المستودع يخفي نتائج السابق دون تأثير متأخر، وعودته لا تعيدها قسرًا', async () => {
    let href = 'https://github.com/octo/community';
    const listeners = new Set<() => void>();
    const live: PageSource = { read: async () => pageInfoFromUrl(href, 't'), subscribe: (n) => (listeners.add(n), () => void listeners.delete(n)) };
    const net = recordingFetch(FILES);
    const View = createGuideView({ source: () => live, fetchText: net.fetchText, access: () => fakeAccess(() => ({ body: {} })) });
    await act(async () => render(<View settings={null as never} surface="native" />, container));
    await settle();
    await click($('[data-action="read-project"]'));
    expect(container.querySelector('[data-guide-state="done"]')).not.toBeNull();
    href = 'https://github.com/octo/other';
    await act(async () => {
      for (const l of listeners) l();
      await flush(120);
    });
    await settle();
    expect(container.querySelector('[data-guide-state]')).toBeNull();
    expect($('[data-guide-repo]').textContent).toContain('octo/other');
    expect(container.querySelector('[data-action="read-project"]')).not.toBeNull();
  });

  it('خارج المستودعات: إرشاد، وخارطة الطريق تبقى', async () => {
    await mount({ href: 'https://github.com/' });
    expect(container.querySelector('[data-guide-empty="no-repo"]')).not.toBeNull();
    expect(container.querySelector('[data-action="read-project"]')).toBeNull();
    expect(container.querySelectorAll('[data-section="roadmap"] li')).toHaveLength(5);
  });
});

describe('مصطلحات المرشد من القاموس', () => {
  it('terms.json مطابق لإدخالات القاموس الحالية (لا انجراف)', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const glossary = JSON.parse(fs.readFileSync(path.join(root, 'src/data/glossary/entries.json'), 'utf8')) as { entries: Array<{ id: string; ar: string; en: string; brief: string }> };
    for (const term of TERMS) {
      const entry = glossary.entries.find((e) => e.id === term.id);
      expect(entry, term.id).toBeDefined();
      expect({ ar: term.ar, en: term.en, brief: term.brief }).toEqual({ ar: entry?.ar, en: entry?.en, brief: entry?.brief });
    }
  });
});
