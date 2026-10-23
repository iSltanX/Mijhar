// @vitest-environment jsdom
// المدقق نفسه (src/modules/b/access/audit.ts): يلتقط ما يخلّ بـAC-B5 ولا يصفّر على بديل ظاهره سليم، ثم تُدقَّق بطاقة كل مدخل في القاموس.
import { render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { auditBadges, auditCard } from '../../../../src/modules/b/access';
import { ExplainCard, GLOSSARY_ENTRIES, docsLink } from '../../../../src/modules/b/card';

const html = (markup: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.append(root);
  return root;
};
const rules = (root: ParentNode, sizeOf = () => ({ width: 32, height: 32 })): string[] => auditBadges(root, { sizeOf }).map((v) => v.rule);
afterEach(() => (document.body.innerHTML = ''));

describe('auditBadges', () => {
  it('شارة سليمة: لا مخالفة', () => {
    const root = html('<button type="button" class="badge" aria-label="شرح «ن» — آمن" aria-expanded="false" data-entry="x"></button>');
    expect(rules(root)).toEqual([]);
  });

  it('div role=button يُلتقط: لا يُفتح بـEnter وSpace تلقائيًا', () => {
    const root = html('<div role="button" tabindex="0" class="badge" aria-label="شرح" aria-expanded="false"></div>');
    expect(rules(root)).toContain('badge-not-native-button');
  });

  it('زر بلا اسم وصول أو بنوع submit أو tabindex سالب أو معطّل أو بلا aria-expanded أو صغير', () => {
    expect(rules(html('<button type="button" class="badge" aria-expanded="false"></button>'))).toContain('badge-no-name');
    expect(rules(html('<button class="badge" aria-label="a" aria-expanded="false"></button>'))).toContain('badge-wrong-type');
    expect(rules(html('<button type="button" tabindex="-1" class="badge" aria-label="a" aria-expanded="false"></button>'))).toContain('badge-unreachable-by-tab');
    expect(rules(html('<button type="button" disabled class="badge" aria-label="a" aria-expanded="false"></button>'))).toContain('badge-disabled');
    expect(rules(html('<button type="button" class="badge" aria-label="a"></button>'))).toContain('badge-no-expanded-state');
    expect(rules(html('<button type="button" class="badge" aria-label="a" aria-expanded="false"></button>'), () => ({ width: 18, height: 18 }))).toContain('badge-small-target');
  });

  it('tabindex=0 مقبول، وaria-label من مسافات فقط ليس اسمًا', () => {
    expect(rules(html('<button type="button" tabindex="0" class="badge" aria-label="a" aria-expanded="true"></button>'))).toEqual([]);
    expect(rules(html('<button type="button" class="badge" aria-label="   " aria-expanded="false"></button>'))).toContain('badge-no-name');
  });
});

describe('auditCard', () => {
  it('حوار بلا اسم ولا tabindex ولا زر إغلاق يُلتقط', () => {
    const root = html('<section class="card" role="dialog"></section>');
    expect(auditCard(root).map((v) => v.rule).sort()).toEqual(['card-no-close', 'card-no-name', 'card-not-focusable']);
  });

  it('لا بطاقة فلا مخالفة', () => {
    expect(auditCard(html('<p>لا شيء</p>'))).toEqual([]);
  });
});

describe('بطاقة كل مدخل في القاموس', () => {
  it(`كل بطاقة من المداخل ${GLOSSARY_ENTRIES.length} حوار باسم وزر إغلاق باسم وصول، ورابط الوثيقة (إن وُجد) يفتح بأمان`, () => {
    expect(GLOSSARY_ENTRIES.length).toBeGreaterThanOrEqual(100);
    const bad: string[] = [];
    for (const entry of GLOSSARY_ENTRIES) {
      const container = document.createElement('div');
      document.body.append(container);
      render(<ExplainCard entry={entry} onClose={() => {}} />, container);
      const violations = auditCard(container);
      if (violations.length) bad.push(`${entry.id}: ${violations.map((v) => v.rule).join(',')}`);
      const link = container.querySelector<HTMLAnchorElement>('a[data-action="docs"]');
      if (docsLink(entry)) {
        if (!link || link.getAttribute('rel') !== 'noopener noreferrer' || link.getAttribute('target') !== '_blank') bad.push(`${entry.id}: رابط الوثيقة غير آمن`);
      } else if (link) bad.push(`${entry.id}: رابط لا أصل له`);
      render(null, container);
      container.remove();
    }
    expect(bad).toEqual([]);
  });
});
