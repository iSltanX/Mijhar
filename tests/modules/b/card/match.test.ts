// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// قاعدة عدم التخمين في المطابقة (BLK-DOM-LOW-CONFIDENCE) على fixture-github-ui-sample.html وقاموس الاختبار:
// التسمية والدور والصفحة والرابط شروط معًا، والتباس مدخلين بدرجة واحدة يمنع الشرح، والمصطلحات المجردة لا تُربط بعنصر أبدًا.
import { beforeEach, describe, expect, it } from 'vitest';
import { GLOSSARY_ENTRIES, buildIndex, findMatches, normalizeLabel, pageKindsOf, roleOf } from '../../../../src/modules/b/card';
import type { PageKind } from '../../../../src/data/glossary/types';
import { SAMPLE, loadHtml, testEntry } from './helpers';

const HREF = 'https://github.com/octo/demo';
const REPO_HOME: PageKind[] = ['any', 'repo-home'];
const real = buildIndex(GLOSSARY_ENTRIES);
const ids = (el: Element | null): string | undefined => el?.getAttribute('id') ?? undefined;

const EXPECTED_BY_ID: Record<string, string> = {
  'nav-search': 'nav-search',
  'nav-create': 'nav-create',
  'nav-notifications': 'nav-notifications',
  'nav-profile': 'nav-profile-menu',
  'watch-btn': 'watch',
  'fork-link': 'fork',
  'star-btn': 'star',
  'tab-code': 'repo-tab-code',
  'tab-issues': 'repo-tab-issues',
  'tab-pulls': 'repo-tab-pulls',
  'tab-actions': 'repo-tab-actions',
  'tab-settings': 'repo-tab-settings',
  'branch-select': 'branch-select',
  'add-file': 'add-file-menu',
  'create-new-file': 'create_new_file',
  'upload-files': 'upload_files',
  'clone-https': 'clone_https',
  'clone-ssh': 'clone_ssh',
  'download-zip': 'download_zip',
};

describe('عينة واجهة المستودع مع القاموس الفعلي', () => {
  beforeEach(() => loadHtml(SAMPLE));

  it('يطابق العناصر المعروفة بالمدخل الصحيح، وتسميات العدّادات لا تمنع المطابقة', () => {
    const { matches } = findMatches(document, real, { kinds: REPO_HOME, href: HREF });
    const byId = Object.fromEntries(matches.map((m) => [ids(m.element) ?? m.element.localName, m.entry.id]));
    for (const [id, entry] of Object.entries(EXPECTED_BY_ID)) expect(byId[id], id).toBe(entry);
    // + عنوان README (دور heading في صفحة المستودع).
    expect(matches).toHaveLength(Object.keys(EXPECTED_BY_ID).length + 1);
    expect(matches.find((m) => m.element.id === '')?.entry.id).toBe('readme-block');
  });

  it('لا يُشرح أي «شرك»: عنصر بلا دور، رابط بنمط مخالف، زر لصفحة أخرى، تسمية مجهولة، مخفي', () => {
    const { matches, skipped } = findMatches(document, real, { kinds: REPO_HOME, href: HREF });
    const explained = new Set(matches.map((m) => ids(m.element)));
    for (const decoy of ['decoy-star', 'decoy-fork-href', 'decoy-delete', 'decoy-unknown-label', 'decoy-hidden-watch', 'decoy-aria-hidden', 'decoy-unknown', 'decoy-heading-star', 'watch-link']) {
      expect(explained.has(decoy), decoy).toBe(false);
    }
    const reason = (id: string) => skipped.find((s) => ids(s.element) === id)?.reason;
    expect(reason('decoy-fork-href')).toBe('href');
    expect(reason('decoy-delete')).toBe('page');
    expect(reason('decoy-hidden-watch')).toBe('hidden');
    expect(reason('decoy-aria-hidden')).toBe('hidden');
    expect(reason('decoy-heading-star')).toBe('role');
    expect(reason('watch-link')).toBe('role');
    // عنصر بلا دور وتسمية لا يعرفها القاموس لا يظهر حتى في المتخطى.
    expect(skipped.some((s) => ids(s.element) === 'decoy-star')).toBe(false);
    expect(skipped.some((s) => ids(s.element) === 'decoy-unknown')).toBe(false);
  });

  it('المطابقة لا تعدّل الصفحة', () => {
    const before = document.documentElement.outerHTML;
    findMatches(document, real, { kinds: REPO_HOME, href: HREF });
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('زر «Delete this repository» يُشرح في صفحة إعدادات المستودع لا في صفحة المستودع', () => {
    const settingsPage = findMatches(document, real, { kinds: ['any', 'settings-repo'], href: 'https://github.com/octo/demo/settings' });
    expect(settingsPage.matches.map((m) => m.entry.id)).toContain('delete_repo');
  });

  it('أنواع الصفحات من الكاشف: المستودع والإعدادات والأمان والإشعارات', () => {
    const k = (type: Parameters<typeof pageKindsOf>[0]['type'], path: string) => pageKindsOf({ type, href: `https://github.com${path}` });
    expect(k('repo', '/octo/demo')).toEqual(['any', 'repo-home']);
    expect(k('pr-checks', '/octo/demo/pull/4/checks')).toContain('pull-request');
    expect(k('other', '/octo/demo/settings/branches')).toContain('settings-repo');
    expect(k('other', '/octo/demo/security')).toContain('security');
    expect(k('other', '/notifications')).toContain('notifications');
    expect(k('other', '/new')).toContain('new-repo');
    expect(k('other', '/octo/demo/some-unknown')).toEqual(['any']);
    expect(k('settings', '/settings/profile')).toContain('settings-account');
  });
});

describe('قاموس الاختبار', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  const mount = (html: string): void => {
    document.body.innerHTML = html;
  };
  const run = (entries: ReturnType<typeof testEntry>[], kinds: PageKind[] = REPO_HOME, href = HREF) => findMatches(document, buildIndex(entries), { kinds, href });

  it('التسمية مطابقة كاملة لا جزئية: «Fork now» لا تطابق «Fork»، و«Forks» لا تطابقها', () => {
    mount('<button>Fork now</button><button>Forks</button><button>Fork</button>');
    const { matches } = run([testEntry('fork', 'Fork', ['button'], ['any'])]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.element.textContent).toBe('Fork');
  });

  it('بلا حساسية لحالة الأحرف ولا مسافات زائدة ولا علامات اتجاه، والنقاط الثلاث تتوحّد مع «…»', () => {
    mount('<button>‎  STAR ‏</button><button aria-label="Commit changes…">x</button>');
    const { matches } = run([testEntry('star', 'Star', ['button'], ['any']), testEntry('commit', 'Commit changes...', ['button'], ['any'])]);
    expect(matches.map((m) => m.entry.id).sort()).toEqual(['commit', 'star']);
    expect(normalizeLabel('  Find a repository…  ')).toBe('find a repository...');
  });

  it('aria-label يكفي، وaria-labelledby يُحل، والعدّاد الملصق يُحذف من الاسم', () => {
    mount('<span id="lbl">Watch</span><button aria-labelledby="lbl">x</button><button>Issues <span>1,204</span></button><button>Issues 12k</button>');
    const { matches } = run([testEntry('watch', 'Watch', ['button'], ['any']), testEntry('issues', 'Issues', ['button'], ['any'])]);
    expect(matches.map((m) => m.entry.id).sort()).toEqual(['issues', 'issues', 'watch']);
  });

  it('عدّادات GitHub الحقيقية (Counter وCounterLabel وsr-only «(N)») لا تمنع المطابقة', () => {
    mount(
      '<a href="/octo/demo/pulls">Pull requests<span data-component="CounterLabel" aria-hidden="true">1</span><span class="prc-VisuallyHidden"> (1)</span></a>' +
        '<a href="/octo/demo/issues">Issues<span class="Counter">1,204</span></a>' +
        '<button><svg></svg><span class="sr-only">Notifications</span></button>',
    );
    const { matches } = run([
      testEntry('pulls', 'Pull requests', ['link'], ['any'], { hrefPatterns: ['/pulls$'] }),
      testEntry('issues', 'Issues', ['link'], ['any']),
      testEntry('notifications', 'Notifications', ['button'], ['any']),
    ]);
    expect(matches.map((m) => m.entry.id).sort()).toEqual(['issues', 'notifications', 'pulls']);
  });

  it('الدور شرط: رابط لا يطابق توقيع زر، والدور الصريح يغلب الضمني', () => {
    mount('<a href="/x">Open</a><div role="button">Open</div><span role="tab">Open</span>');
    const { matches, skipped } = run([testEntry('open', 'Open', ['button'], ['any'])]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.element.getAttribute('role')).toBe('button');
    expect(skipped.map((s) => s.reason)).toEqual(['role', 'role']);
  });

  it('الصفحة شرط: توقيع صفحة معينة لا يطابق في غيرها، و«any» يطابق دائمًا', () => {
    mount('<button>Merge</button>');
    const pr = testEntry('merge', 'Merge', ['button'], ['pull-request']);
    expect(run([pr], ['any', 'repo-home']).matches).toHaveLength(0);
    expect(run([pr], ['any', 'repo-home']).skipped[0]?.reason).toBe('page');
    expect(run([pr], ['any', 'pull-request']).matches).toHaveLength(1);
    expect(run([testEntry('merge-any', 'Merge', ['button'], ['any'])], ['any']).matches).toHaveLength(1);
  });

  it('نمط الرابط شرط للروابط: المطابق يمرّ والمخالف يُرفض، ولا أثر للنمط على الأزرار', () => {
    mount('<a href="/octo/demo/fork">Fork</a><a href="/other">Fork</a><button>Fork</button><a href="https://evil.example/fork">Fork</a>');
    const { matches, skipped } = run([testEntry('fork', 'Fork', ['link', 'button'], ['any'], { hrefPatterns: ['/fork$'] })]);
    expect(matches.map((m) => m.element.localName + (m.element.getAttribute('href') ?? ''))).toEqual(['a/octo/demo/fork', 'button']);
    expect(skipped.map((s) => s.reason)).toEqual(['href', 'href']);
  });

  it('الالتباس: مدخلان بالدرجة نفسها لا يُشرح العنصر بأي منهما', () => {
    mount('<button>Alpha</button>');
    const a = testEntry('a', 'Alpha', ['button'], ['any']);
    const b = testEntry('b', 'Alpha', ['button'], ['any']);
    const result = run([a, b]);
    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toEqual([expect.objectContaining({ reason: 'ambiguous', entries: ['a', 'b'] })]);
  });

  it('الأعلى درجة يفوز: نوع صفحة خاص يغلب «any»، ونمط رابط مطابق يرفع الدرجة', () => {
    mount('<a href="/new">New</a>');
    const generic = testEntry('nav-create', 'New', ['link'], ['any']);
    const specific = testEntry('repos-new', 'New', ['link'], ['profile'], { hrefPatterns: ['/new$'] });
    const onProfile = run([generic, specific], ['any', 'profile']);
    expect(onProfile.matches.map((m) => [m.entry.id, m.score])).toEqual([['repos-new', 3]]);
    const elsewhere = run([generic, specific], ['any', 'repo-home']);
    expect(elsewhere.matches.map((m) => [m.entry.id, m.score])).toEqual([['nav-create', 1]]);
  });

  it('المصطلحات المجردة (بلا توقيع) لا تُربط بعنصر ولو طابقت تسميتها نصًّا', () => {
    mount('<button>Repository</button><h2>Commit</h2>');
    const concept = testEntry('repository', 'Repository', ['button'], ['any'], { kind: 'concept', signature: null });
    const result = run([concept]);
    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(GLOSSARY_ENTRIES.filter((e) => e.kind === 'concept').every((e) => e.signature === null)).toBe(true);
  });

  it('نص طويل لحاوية لا يُقرأ اسمًا، والمدخل الطويل لا يطابق', () => {
    mount(`<a href="/x">${'Star '.repeat(60)}</a>`);
    expect(run([testEntry('star', 'Star', ['link'], ['any'])]).matches).toHaveLength(0);
  });

  it('الأدوار الضمنية: input وselect وtextarea وh2 وsummary', () => {
    mount('<input type="checkbox" id="c"><input type="text"><select></select><textarea></textarea><h2>x</h2><summary>s</summary><a>no href</a><input type="hidden">');
    const roles = [...document.body.querySelectorAll('*')].map((e) => roleOf(e));
    expect(roles).toEqual(['checkbox', 'textbox', 'combobox', 'textbox', 'heading', 'button', null, null]);
  });
});
