// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/7"}
// TEST-WRITE-03 (AC-F3): بنك العبارات يحتوي الأصناف الأربعة (سؤال، اقتراح مع كتلة suggestion، ملاحظة بسيطة، إشادة) بالعربية والإنجليزية، ويُدرج الاختيار عبر المعاينة فقط.
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, PHRASES, PHRASE_CATEGORIES, PHRASE_LANGUAGES, findPhrase, phrasesOf, selectPhrase } from '../../../../src/modules/f/phrasebank';
import { click, field, flush, loadHtml, mountComposer, panelRoot, triggerFor, ROOT } from '../composer/helpers';
import type { Live } from '../composer/helpers';
import path from 'node:path';

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

describe('بيانات البنك', () => {
  it('الأصناف الأربعة بالعربية والإنجليزية، في كل صنف ثلاث عبارات فأكثر بنصين غير فارغين', () => {
    expect(PHRASE_CATEGORIES).toEqual(['question', 'suggestion', 'note', 'praise']);
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...PHRASE_CATEGORIES].sort());
    expect(PHRASE_LANGUAGES).toEqual(['ar', 'en']);
    for (const category of PHRASE_CATEGORIES) {
      const phrases = phrasesOf(category);
      expect(phrases.length, category).toBeGreaterThanOrEqual(3);
      for (const phrase of phrases) {
        for (const language of PHRASE_LANGUAGES) {
          expect(phrase.text[language].trim().length, `${phrase.id}/${language}`).toBeGreaterThan(10);
          expect(phrase.label[language].trim().length, `${phrase.id}/${language} تسمية`).toBeGreaterThan(0);
        }
        // العربية عربية والإنجليزية إنجليزية (خارج كتلة الكود وما بين <>).
        const prose = (text: string): string => text.replace(/```[\s\S]*?```/g, '');
        expect(prose(phrase.text.ar), `${phrase.id} ar`).toMatch(ARABIC);
        expect(prose(phrase.text.en), `${phrase.id} en`).toMatch(LATIN);
        expect(prose(phrase.text.en), `${phrase.id} en بلا عربية`).not.toMatch(ARABIC);
      }
    }
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
  });

  it('عبارات الاقتراح تحمل كتلة suggestion مغلقة بنص بديل يملؤه المستخدم، وغيرها لا كتلة كود فيها', () => {
    for (const phrase of phrasesOf('suggestion')) {
      for (const language of PHRASE_LANGUAGES) {
        const text = phrase.text[language];
        expect(text, `${phrase.id}/${language}`).toMatch(/```suggestion\n<[^>\n]+>\n```$/);
        expect(text.match(/```/g)).toHaveLength(2);
      }
    }
    for (const category of ['question', 'note', 'praise'] as const) {
      for (const phrase of phrasesOf(category)) expect(phrase.text.ar + phrase.text.en).not.toContain('```');
    }
  });

  it('selectPhrase تعيد النص بلغته، وfindPhrase تعيد undefined لغير الموجود', () => {
    expect(selectPhrase('q-clarify', 'en')).toEqual({ id: 'q-clarify', language: 'en', text: findPhrase('q-clarify')!.text.en });
    expect(selectPhrase('q-clarify', 'ar')!.text).toMatch(ARABIC);
    expect(selectPhrase('none', 'ar')).toBeNull();
    expect(findPhrase('none')).toBeUndefined();
  });
});

// ---------- في المساعد ----------

let live: Live | null = null;
afterEach(() => {
  live?.manager.stop();
  live = null;
});

const FIXTURE = path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html');
const need = <E extends Element = HTMLElement>(selector: string): E => {
  const el = panelRoot().querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر في اللوحة: ${selector}`);
  return el;
};

async function openComment(): Promise<void> {
  loadHtml(FIXTURE);
  window.history.replaceState({}, '', 'https://github.com/octo/demo/pull/7');
  live = await mountComposer();
  await click(triggerFor('new_comment_field'), 8);
}

describe('الإدراج عبر المعاينة فقط (AC-F3)', () => {
  it('اختيار عبارة يعرضها في المعاينة ولا يمس الحقل ولا يطلق أي حدث input', async () => {
    await openComment();
    const draft = field('new_comment_field').value;
    const inputs: Event[] = [];
    field('new_comment_field').addEventListener('input', (event) => inputs.push(event));
    await click(need('[data-category="question"]'));
    await click(need('[data-phrase="q-tests"]'));
    expect(need('[data-preview]').textContent).toBe(findPhrase('q-tests')!.text.ar);
    expect(need('[data-preview]').dataset.output).toBe('block');
    expect(need('[data-phrase="q-tests"]').getAttribute('aria-pressed')).toBe('true');
    expect(field('new_comment_field').value).toBe(draft);
    expect(inputs).toEqual([]);
  });

  it('اللغة الإنجليزية، ثم الإدراج عند المؤشر بفواصل الفقرات، ثم التراجع يعيد المسودة حرفيًا', async () => {
    await openComment();
    const draft = field('new_comment_field').value;
    await click(need('[data-category="note"]'));
    await act(async () => {
      need<HTMLInputElement>('input[name="mj-phrase-language"][value="en"]').click();
      await flush(5);
    });
    await click(need('[data-phrase="n-nit"]'));
    expect(need('[data-preview]').textContent).toBe(findPhrase('n-nit')!.text.en);
    await click(need('[data-action="insert-cursor"]'));
    const value = field('new_comment_field').value;
    expect(value).toContain(findPhrase('n-nit')!.text.en);
    // المسودة سليمة حرفًا بحرف، والعبارة مرة واحدة تفصلها عنها فقرة فارغة.
    expect(value.split(findPhrase('n-nit')!.text.en)).toHaveLength(2);
    expect(value.replace(findPhrase('n-nit')!.text.en, '').trim()).toBe(draft.trim());
    await click(need('[data-action="undo"]'));
    expect(field('new_comment_field').value).toBe(draft);
  });

  it('كتلة suggestion تُدرج كاملة بسياجها، مع بيان أنها تعمل في تعليق مراجعة على سطر', async () => {
    await openComment();
    await click(need('[data-category="suggestion"]'));
    expect(need('[data-note="suggestion-block"]').textContent).toContain('تعليق مراجعة على سطر');
    await click(need('[data-phrase="s-change"]'));
    await click(need('[data-action="insert-append"]'));
    expect(field('new_comment_field').value.endsWith('```suggestion\n<الشيفرة المقترحة>\n```\n')).toBe(true);
  });

  it('زر «ألغِ العبارة» يعيد المعاينة إلى تنظيم الحقول، والنقر على العبارة نفسها يلغي اختيارها', async () => {
    await openComment();
    await click(need('[data-phrase="q-clarify"]'));
    expect(need('[data-note="phrase"]').textContent).toContain('تحل محل التنظيم');
    await click(need('[data-action="clear-phrase"]'));
    expect(need('[data-preview]').dataset.empty).toBe('true');
    await click(need('[data-phrase="q-clarify"]'));
    expect(need('[data-preview]').dataset.empty).toBe('false');
    await click(need('[data-phrase="q-clarify"]'));
    expect(need('[data-preview]').dataset.empty).toBe('true');
  });

  it('لا زر إدراج على العبارة نفسها: عناصر القائمة أزرار اختيار وحدها', async () => {
    await openComment();
    const buttons = [...panelRoot().querySelectorAll<HTMLButtonElement>('[data-phrase]')];
    expect(buttons.length).toBe(phrasesOf('question').length);
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(buttons.every((b) => !b.dataset.action)).toBe(true);
  });
});
