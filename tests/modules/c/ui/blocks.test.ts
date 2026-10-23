// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/mijhar-demo/issues/7"}
// من DOM إلى فقرات (src/modules/c/ui/blocks.ts): المقاطع المقنَّعة، والعناصر المحمية وأنواعها، والمستثنى (pre وarabic وnotranslate)، وربط الرمز بعنصره الأصلي
// حين يتكرر نص الرابط وعناوينه مختلفة، وسياسة التخطي. دوال على DOM لا تعدّله.
import { beforeEach, describe, expect, it } from 'vitest';
import { maskSegments } from '../../../../src/modules/c/masking';
import { blockOf, collectBlocks, inlineSegments, skipReasonFor, tokenNodes } from '../../../../src/modules/c/ui';
import type { TranslatableBlock } from '../../../../src/modules/c/ui';
import { FIXTURE, loadHtml } from './helpers';

beforeEach(() => loadHtml(FIXTURE));

const readme = (): Element => document.querySelector('#readme article')!;
const byCase = (name: string): TranslatableBlock => {
  const block = blockOf(document.querySelector(`[data-case="${name}"]`)!);
  if (typeof block === 'string') throw new Error(`${name}: ${block}`);
  return block;
};

describe('collectBlocks على README', () => {
  it('الفقرات القابلة للترجمة بترتيب المستند، وما عداها يُترك بسببه', () => {
    const { blocks, skipped } = collectBlocks(readme());
    const names = blocks.map((b) => b.element.getAttribute('data-case') ?? b.element.textContent);
    expect(names).toEqual([
      'h1', 'p-code-link', 'p-mention-ref-path', 'p-two-here', 'p-kbd', 'p-time', 'p-badge', 'p-sentences', 'h2', 'li-simple', 'li-nested', 'li-inner', 'p-in-li', 'th', 'Description', 'td-text', 'p-in-quote',
    ]);
    // العربية تُترك، وخلية الشيفرة وحدها لا نص فيها، وكتلة pre مستثناة.
    expect(skipped['already-arabic']).toBeGreaterThanOrEqual(1);
    expect(blocks.some((b) => b.element.getAttribute('data-case') === 'p-arabic')).toBe(false);
    expect(blocks.some((b) => b.element.closest('pre, .highlight'))).toBe(false);
  });

  it('لا تعدّل الصفحة', () => {
    const before = document.documentElement.outerHTML;
    collectBlocks(readme());
    collectBlocks(document.querySelector('[data-testid="issue-body"]')!);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('المقاطع والعناصر المحمية', () => {
  it('code ورابط: النص يبقى نصًا والمحمي مقطع صريح بنوعه', () => {
    const block = byCase('p-code-link');
    expect(block.segments).toEqual([
      'This extension helps Arabic readers understand repositories. Run ',
      { type: 'CODE', value: 'npm install' },
      ' first, then see the ',
      { type: 'LINK', value: 'installation guide' },
      ' for details.',
    ]);
    expect(block.nodes.map((n) => [n.kind, n.tag ?? n.href])).toEqual([
      ['code', 'code'],
      ['link', 'https://github.com/octo/mijhar-demo/blob/main/INSTALL.md'],
    ]);
    expect(block.plain).not.toContain('npm install');
  });

  it('إشارة @ وإحالة # رابطان مصنَّفان USER وREF، والمسار في النص يكتشفه المقنِّع', () => {
    const block = byCase('p-mention-ref-path');
    expect(block.segments.filter((s) => typeof s !== 'string')).toEqual([
      { type: 'USER', value: '@octocat' },
      { type: 'REF', value: '#123' },
    ]);
    const { masked } = maskSegments(block.segments);
    expect(masked).toContain('⟦PATH_');
    expect(masked).not.toContain('src/components/common/Explain.tsx');
  });

  it('kbd وrelative-time وعنصر notranslate: محمية', () => {
    expect(byCase('p-kbd').segments.filter((s) => typeof s !== 'string')).toEqual([
      { type: 'CODE', value: 'Alt' },
      { type: 'CODE', value: 'H' },
    ]);
    expect(byCase('p-time').segments.filter((s) => typeof s !== 'string')).toEqual([{ type: 'TERM', value: 'Oct 22, 2026' }]);
    expect(maskSegments(byCase('p-time').segments).masked).toContain('⟦TERM_0⟧');
  });

  it('رابط الصورة بلا نص وسائط: يُعلَّم hasMedia ولا يدخل الترجمة', () => {
    const block = byCase('p-badge');
    expect(block.hasMedia).toBe(true);
    expect(block.segments).toEqual(['The build badge shows the current state of the main branch.']);
  });

  it('عنصر القائمة المتداخلة: نصه المباشر وحده، والفرعية فقرة مستقلة', () => {
    expect(byCase('li-nested').segments).toEqual(['Configure the build target']);
    expect(byCase('li-inner').segments).toEqual(['Set the ', { type: 'CODE', value: 'TARGET' }, ' variable to chromium or firefox.']);
  });

  it('عنوان وخلية جدول وفقرة في اقتباس فقرات عادية', () => {
    expect(byCase('h1').segments).toEqual(['Mijhar Demo Project']);
    expect(byCase('td-text').segments).toEqual(['Enable the reader mode feature for long pages.']);
    expect(byCase('p-in-quote').plain).toBe('Note: this tool never sends page content to any server.');
  });
});

describe('ربط الرمز بعنصره الأصلي', () => {
  it('كلمة «here» برابطين مختلفين: كل رمز يصل إلى رابطه ولو بقي ترتيبه', () => {
    const block = byCase('p-two-here');
    const { expectedTokens } = maskSegments(block.segments);
    const map = tokenNodes(block, expectedTokens);
    const links = [...expectedTokens.values()].filter((r) => r.type === 'LINK');
    expect(links).toHaveLength(2);
    expect(links.map((r) => map.get(r.token)?.href)).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  it('رموز اكتشفها المقنِّع في النص (مسار) بلا عنصر أصلي، وبين الرموز الصريحة لا تفسد المطابقة', () => {
    const block = byCase('p-mention-ref-path');
    const { expectedTokens } = maskSegments(block.segments);
    const map = tokenNodes(block, expectedTokens);
    const byType = [...expectedTokens.values()].map((r) => [r.type, map.get(r.token)?.kind ?? null]);
    expect(byType).toEqual(expect.arrayContaining([['USER', 'link'], ['REF', 'link'], ['PATH', null]]));
  });
});

// VR-12 (الجزء (أ) من MJ-AUDIT-005): كانت المطابقة بالنوع والنص فيرتبط الرابط برمز نص عادي مطابق يسبقه.
describe('ربط الرموز الصريحة بعناصرها بالموضع', () => {
  it('«#7» نصًا قبل رابط «#7»: رمز الرابط يصل إلى الرابط، ورمز النص بلا عنصر', () => {
    document.body.innerHTML = '<p id="x">See #7 and <a href="https://github.com/o/r/issues/7">#7</a> for the details please</p>';
    const block = blockOf(document.getElementById('x')!) as TranslatableBlock;
    const { expectedTokens } = maskSegments(block.segments);
    const map = tokenNodes(block, expectedTokens);
    const refs = [...expectedTokens.values()].filter((r) => r.original === '#7').sort((a, b) => a.index - b.index);
    expect(refs).toHaveLength(2);
    expect(map.get(refs[0]!.token)).toBeUndefined();
    expect(map.get(refs[1]!.token)?.href).toBe('https://github.com/o/r/issues/7');
  });
});

describe('inlineSegments للتحديد (شظية عبر فقرات)', () => {
  it('الكتل المتداخلة تُسطَّر بدل أن تُسقط، وكتلة الشيفرة تُحمى كاملة', () => {
    const range = document.createRange();
    range.setStartBefore(document.querySelector('[data-case="p-code-link"]')!);
    range.setEndAfter(document.querySelector('[data-case="p-arabic"]')!);
    const { segments } = inlineSegments(range.cloneContents(), true);
    const text = segments.map((s) => (typeof s === 'string' ? s : `⟪${s.value}⟫`)).join('');
    expect(text).toContain('Run ⟪npm install⟫ first');
    expect(text).toContain('\n');
    expect(text).toContain('فقرة عربية');
    const pre = document.createRange();
    pre.selectNodeContents(document.querySelector('[data-case="pre"]')!.parentElement!);
    expect(inlineSegments(pre.cloneContents(), true).segments.some((s) => typeof s !== 'string' && s.value.includes('npm run build'))).toBe(true);
  });
});

describe('skipReasonFor', () => {
  it('عربي أو بلا لاتيني أو فارغ يُترك، والإنجليزي والمختلط الغالب إنجليزيته يُترجم', () => {
    expect(skipReasonFor('')).toBe('empty');
    expect(skipReasonFor('   ')).toBe('empty');
    expect(skipReasonFor('12345 !!!')).toBe('no-latin');
    expect(skipReasonFor('هذه فقرة عربية طويلة بعض الشيء')).toBe('already-arabic');
    expect(skipReasonFor('Run the tests فقط')).toBeNull();
    expect(skipReasonFor('أمر git عادي في الكتابة اليومية')).toBe('already-arabic');
    expect(skipReasonFor('Use git to commit')).toBeNull();
    expect(skipReasonFor('ok')).toBe('no-latin');
  });
});
