// صفحات GitHub حقيقية محفوظة (fixtures/spikes، بلا تسجيل دخول): ما يُشرح منها وما يُترك ولماذا. التواقيع الدلالية في القاموس فرضية
// (T-3.1 «حدود معلنة»)، فاختبار الصفحات الحقيقية يقيس التغطية الفعلية ويثبت قاعدة عدم التخمين على عناصر حقيقية: «Star» و«Fork» لغير
// المسجَّل روابط إلى /login لا أزرار، و«Code» زر الاستنساخ ليس تبويب Code. يُكتب تقرير التغطية إلى MJ8_COVERAGE_OUT إن عُيّن.
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { classifyPath } from '../../../../src/core';
import { GLOSSARY_ENTRIES, buildIndex, findMatches, pageKindsOf } from '../../../../src/modules/b/card';
import { ROOT } from '../../../setup/paths';

const PAGES = [
  { name: 'مستودع (mohataher/arabic-stop-words)', file: 'gh-repo-arabic-stop-words.html', href: 'https://github.com/mohataher/arabic-stop-words' },
  { name: 'مشكلة (salktbi902/ETOS-LLM-Studio#1)', file: 'gh-issue-etos-1.html', href: 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1' },
  { name: 'طلب دمج (Watad-Project/Watad#80)', file: 'gh-pr-watad-80.html', href: 'https://github.com/Watad-Project/Watad/pull/80' },
] as const;

const index = buildIndex(GLOSSARY_ENTRIES);
const label = (el: Element): string => `${el.localName}${el.id ? `#${el.id}` : ''} «${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}»`;

function run(file: string, href: string) {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'fixtures/spikes', file), 'utf8'), { url: href });
  const route = classifyPath(new URL(href).pathname);
  const kinds = pageKindsOf({ type: route.type, href });
  return { ...findMatches(dom.window.document, index, { kinds, href }), kinds, elements: dom.window.document.querySelectorAll('*').length };
}

describe('التغطية الفعلية على صفحات حقيقية', () => {
  const results = PAGES.map((p) => ({ ...p, ...run(p.file, p.href) }));

  it('صفحة المستودع: التبويبات المعروفة وقسم «About» وحدها تُشرح، وروابط الدخول وزر الاستنساخ لا', () => {
    const repo = results[0]!;
    // jsdom لا يحسب التخطيط فيُحصي عنصرين مخفيين في المتصفح (عنوان About مكررًا للشاشات الضيقة)؛ شارات المتصفح 7 (e2e).
    expect([...new Set(repo.matches.map((m) => m.entry.id))].sort()).toEqual(['about-panel', 'repo-tab-actions', 'repo-tab-code', 'repo-tab-insights', 'repo-tab-issues', 'repo-tab-pulls', 'repo-tab-releases', 'repo-tab-security']);
    const skipped = (text: RegExp) => repo.skipped.find((s) => text.test(label(s.element)));
    // «Star» و«Fork» لغير المسجَّل روابط إلى صفحة الدخول، فلا يُشرح الرابط على أنه زر الإجراء.
    const fork = repo.skipped.find((s) => s.entries.includes('fork'));
    expect(fork?.reason === 'href' || fork?.reason === 'role').toBe(true);
    expect(skipped(/^button «Code»/)?.reason ?? 'role').toBe('role');
  });

  it('لا شرح تخميني: كل عنصر مشروح تسميته مطابقة كاملة لتسمية توقيعه ودوره من أدواره', () => {
    for (const page of results) {
      for (const match of page.matches) {
        const signature = match.entry.signature!;
        expect(signature.labels.map((l) => l.toLowerCase().replace('…', '...')), `${page.name} ${label(match.element)}`).toContain(match.label);
        expect(signature.pages.some((k) => k === 'any' || page.kinds.includes(k))).toBe(true);
      }
    }
  });

  it('صفحة المشكلة وصفحة الطلب: ما لا يعرفه القاموس بثقة لا يُشرح (التغطية الجزئية معلنة)', () => {
    const [, issue, pr] = results as [(typeof results)[number], (typeof results)[number], (typeof results)[number]];
    expect(issue.matches.length).toBeLessThanOrEqual(2);
    expect(pr.matches.length).toBeLessThanOrEqual(3);
  });

  it('تقرير التغطية', () => {
    const out = process.env.MJ8_COVERAGE_OUT;
    if (!out) return;
    const lines = ['# تغطية بطاقة الشرح على صفحات حقيقية محفوظة', '', 'مولَّد بـ`MJ8_COVERAGE_OUT=<ملف> npx vitest run tests/modules/b/card/real-pages.test.ts`. الصفحات من `fixtures/spikes` (لغير مسجَّل). المداخل بتوقيع دلالي: ' + String(GLOSSARY_ENTRIES.filter((e) => e.kind === 'element').length) + ' من ' + GLOSSARY_ENTRIES.length + '.', ''];
    for (const page of results) {
      lines.push(`## ${page.name}`, '', `- عناصر الصفحة: ${page.elements} · أنواع الصفحة: ${page.kinds.join('، ')}`, `- مشروحة: **${page.matches.length}**`, '');
      for (const m of page.matches) lines.push(`  - ${label(m.element)} ← \`${m.entry.id}\` (درجة ${m.score})`);
      const reasons = new Map<string, number>();
      for (const s of page.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
      lines.push('', `- ترك بسبب (عنصر طابقت تسميته مدخلًا ولم تكتمل شروطه): ${[...reasons].map(([r, n]) => `${r} ${n}`).join('، ') || 'لا شيء'}`, '');
      for (const s of page.skipped.slice(0, 12)) lines.push(`  - ${label(s.element)} ✗ ${s.reason} (${s.entries.join('، ')})`);
      lines.push('');
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${lines.join('\n')}\n`);
  });
});
