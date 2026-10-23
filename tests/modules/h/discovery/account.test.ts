// TEST-COMM-06 (AC-H6) — الجزء السلوكي: «محتوى عربي» منفصل عن «بيانات يعلنها صاحب الحساب»، والمعلن يُعرض حرفيًا،
// وعينات حسابات بأسماء ومواقع موحية لا تُنتج أي وسم هوية، ووسم المحتوى لا يتأثر بحقول الحساب مطلقًا.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { SelectorsRegistry } from '../../../../src/core/detector';
import { PROFILE_SELECTORS, arabicScriptShare, buildAccountView, declaredEntries, isArabicContent, readAccount, readPinnedProjects } from '../../../../src/modules/h/discovery';
import type { AccountFields, ProjectText } from '../../../../src/modules/h/discovery';

/** عينات موحية عمدًا: أسماء ومواقع ولغات تغري بالاستنتاج. لا تُنتج أي منها وسمًا. */
const SUGGESTIVE: readonly AccountFields[] = [
  { login: 'abu_ahmad', name: 'Mohammed Al-Farsi', location: 'Riyadh, Saudi Arabia', bio: 'Backend engineer' },
  { login: 'khalid-cairo', name: 'خالد عبد الرحمن', location: 'القاهرة', bio: 'مطوّر ويب' },
  { login: 'yamamoto', name: 'Hiroshi Yamamoto', location: 'Tokyo', bio: 'I write Rust' },
  { login: 'sven', name: 'Sven Müller', location: 'Berlin', bio: null },
  { login: 'ali_dubai', name: 'Ali', location: 'Dubai UAE', bio: 'العربية لغتي' },
  { login: 'maria', name: 'María García', location: 'Madrid', bio: 'Developer' },
  { login: 'user123', name: null, location: null, bio: null },
  { login: 'omar', name: 'Omar', location: 'Lagos, Nigeria', bio: 'Arabic is my first language' },
];

const PROJECTS: readonly ProjectText[] = [
  { repo: 'a/arabic-nlp', description: 'مكتبة لمعالجة اللغة العربية' },
  { repo: 'a/english', description: 'A small HTTP client' },
  { repo: 'a/mixed', description: 'Tokenizer for نصوص عربية with fast paths and caching' },
  { repo: 'a/short', description: 'عربي' },
];

const keysOf = (value: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) for (const item of value) keysOf(item, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), keysOf(v, out));
  return out;
};

describe('بيانات يعلنها صاحب الحساب', () => {
  it('تُعرض حرفيًا كما كُتبت، ولا يدخل اسم المستخدم', () => {
    for (const account of SUGGESTIVE) {
      const entries = declaredEntries(account);
      for (const entry of entries) expect(entry.text).toBe(account[entry.field]);
      expect(entries.map((e) => e.field)).toEqual((['name', 'location', 'bio'] as const).filter((f) => (account[f] ?? '').trim() !== ''));
      expect(JSON.stringify(entries)).not.toContain(account.login);
    }
  });

  it('الحقل الفارغ أو الفراغات لا يُعرض', () => {
    expect(declaredEntries({ login: 'x', name: '   ', location: '', bio: null })).toEqual([]);
  });

  it('النص لا يتغير حتى لو بدا موحيًا: لا اقتطاع ولا تطبيع ولا تصحيح', () => {
    const odd = 'Riyadh ,  Saudi-Arabia ☪ (KSA)';
    expect(declaredEntries({ login: 'x', name: null, location: odd, bio: null })[0]?.text).toBe(odd);
  });
});

describe('الفصل بين المحتوى العربي والبيانات المعلنة', () => {
  it('وسم «محتوى عربي» يخص نصوص المشاريع وحدها', () => {
    const view = buildAccountView(SUGGESTIVE[0]!, PROJECTS);
    expect(view.content.findings.map((f) => f.repo)).toEqual(['a/arabic-nlp', 'a/short']);
    expect(view.content.findings.every((f) => f.label === 'محتوى عربي')).toBe(true);
    expect(view.content.title).toBe('محتوى عربي');
    expect(view.declared.title).toBe('بيانات يعلنها صاحب الحساب');
  });

  it('ثبات الوسم: يتساوى ناتج المحتوى لكل عينات الحسابات (لا أثر لاسم ولا موقع ولا لغة نبذة)', () => {
    const reference = JSON.stringify(buildAccountView(SUGGESTIVE[0]!, PROJECTS).content);
    for (const account of SUGGESTIVE) expect(JSON.stringify(buildAccountView(account, PROJECTS).content), account.login).toBe(reference);
  });

  it('حساب موحٍ بلا مشاريع: لا وسوم محتوى ولا أي وسم هوية', () => {
    for (const account of SUGGESTIVE) {
      const view = buildAccountView(account, []);
      expect(view.content.findings, account.login).toEqual([]);
      const keys = [...keysOf(view)];
      expect(keys.sort()).toEqual(['content', 'declared', 'entries', 'field', 'findings', 'label', 'notice', 'text', 'title'].filter((k) => keys.includes(k)).sort());
      for (const forbidden of ['nationality', 'identity', 'ethnicity', 'origin', 'country', 'language', 'tag', 'tags', 'isArab']) expect(keys).not.toContain(forbidden);
    }
  });

  it('تنبيه المعلن ثابت وينفي الاستنتاج صراحةً، ويظهر لكل عرض', () => {
    for (const account of SUGGESTIVE) {
      const { notice } = buildAccountView(account, PROJECTS).declared;
      expect(notice).toMatch(/نص حر/);
      expect(notice).toMatch(/لا يمثل استنتاجًا/);
    }
  });
});

describe('«محتوى عربي»: حروف النص وحده', () => {
  it('الحد: ثلاثة حروف عربية وأربعون بالمئة', () => {
    expect(isArabicContent('مكتبة لمعالجة اللغة العربية')).toBe(true);
    expect(isArabicContent('A small HTTP client')).toBe(false);
    expect(isArabicContent('Tokenizer for نصوص عربية with fast paths and caching')).toBe(false);
    expect(isArabicContent('عربي')).toBe(true);
    expect(isArabicContent('عر')).toBe(false);
    expect(isArabicContent('')).toBe(false);
    expect(isArabicContent('123 456 !!!')).toBe(false);
  });

  it('النسبة تُحسب من الحروف لا الأرقام ولا الرموز', () => {
    const share = arabicScriptShare('مرحبا 123 !!! hello');
    expect(share.arabicLetters).toBe(5);
    expect(share.letters).toBe(10);
    expect(share.share).toBeCloseTo(0.5);
  });
});

describe('قراءة صفحة الملف الشخصي', () => {
  const html = `<!doctype html><html><body>
    <div class="h-card" itemscope itemtype="http://schema.org/Person">
      <h1 class="vcard-names"><span class="p-name vcard-fullname" itemprop="name">  Mohammed   Al-Farsi </span><span class="p-nickname vcard-username" itemprop="additionalName">abu_ahmad</span></h1>
      <div class="p-note user-profile-bio">Backend
        engineer</div>
      <ul class="vcard-details"><li itemprop="homeLocation" aria-label="Home location: Riyadh, Saudi Arabia"><svg></svg><span class="p-label">Riyadh, Saudi Arabia</span></li></ul>
    </div>
    <ol><li class="pinned-item-list-item"><a href="/abu_ahmad/arabic-nlp"><span class="repo">arabic-nlp</span></a><p class="pinned-item-desc">مكتبة لمعالجة اللغة العربية</p></li>
        <li class="pinned-item-list-item"><a href="/abu_ahmad/client">client</a><p class="pinned-item-desc">A small HTTP client</p></li>
        <li class="pinned-item-list-item"><a href="/abu_ahmad/no-desc">no-desc</a></li></ol>
  </body></html>`;
  const dom = new JSDOM(html, { url: 'https://github.com/abu_ahmad' });
  const selectors = new SelectorsRegistry(PROFILE_SELECTORS);

  it('الحقول كما تعرضها الصفحة (الفراغ المتتابع يُطوى) واسم المستخدم من الصفحة', () => {
    expect(readAccount(dom.window.document, selectors, 'fallback')).toEqual({ login: 'abu_ahmad', name: 'Mohammed Al-Farsi', location: 'Riyadh, Saudi Arabia', bio: 'Backend engineer' });
  });

  it('المشاريع المثبتة بأوصافها ومساراتها؛ ما بلا وصف يُهمل', () => {
    expect(readPinnedProjects(dom.window.document, selectors)).toEqual([
      { repo: 'abu_ahmad/arabic-nlp', description: 'مكتبة لمعالجة اللغة العربية' },
      { repo: 'abu_ahmad/client', description: 'A small HTTP client' },
    ]);
  });

  it('صفحة بلا حقول: كلها null واسم المستخدم من الرابط', () => {
    const empty = new JSDOM('<!doctype html><body><div class="h-card"></div></body>', { url: 'https://github.com/x' });
    expect(readAccount(empty.window.document, selectors, 'x')).toEqual({ login: 'x', name: null, location: null, bio: null });
  });
});
