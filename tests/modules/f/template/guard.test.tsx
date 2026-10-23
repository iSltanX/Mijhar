// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/issues/new?template=bug_report.yml"}
// TEST-WRITE-02 (AC-F2): حارس «القالب أولًا» على عينات القوالب. في Issue Forms ذات الحقول الإلزامية لا يستبدل المساعد النموذج ولا يتجاوز حقوله ويعمل دليلًا جانبيًا للحقل المفتوح؛
// وفي قوالب Markdown تبقى الترويسات وقوائم التحقق كما هي؛ وإن لم يُتعرَّف على هيكل القالب عُرض النص للنسخ اليدوي دون لمس حقول الصفحة. ولا نشر ولا إرسال في أي خطوة.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preservesOriginal } from '../../../../src/modules/f/template';
import { ROOT, click, field, flush, loadHtml, mountComposer, panelHost, panelRoot, triggerFor } from '../composer/helpers';
import type { Live } from '../composer/helpers';

const TEMPLATES = path.join(ROOT, 'fixtures/templates');
const page = (name: string): string => path.join(TEMPLATES, name);
const md = (name: string): string => fs.readFileSync(page(name), 'utf8');
const go = (url: string): void => window.history.replaceState({}, '', url);

let live: Live | null = null;
const submits: string[] = [];
const submitClicks: string[] = [];
const onSubmit = (event: Event): void => void submits.push((event.target as Element).id);
const onClick = (event: Event): void => {
  const target = (event.composedPath()[0] ?? event.target) as Element;
  if ((target as HTMLButtonElement).type === 'submit') submitClicks.push(target.id);
};
beforeEach(() => {
  submits.length = 0;
  submitClicks.length = 0;
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('click', onClick, true);
});
afterEach(() => {
  document.removeEventListener('submit', onSubmit, true);
  document.removeEventListener('click', onClick, true);
  live?.manager.stop();
  live = null;
  vi.unstubAllGlobals();
});

const q = <E extends Element = HTMLElement>(selector: string): E | null => panelRoot().querySelector<E>(selector);
const need = <E extends Element = HTMLElement>(selector: string): E => {
  const el = q<E>(selector);
  if (!el) throw new Error(`لا عنصر في اللوحة: ${selector}`);
  return el;
};
const type = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(4);
  });
};
const press = async (selector: string): Promise<void> => click(need(selector), 8);
const open = async (id: string): Promise<void> => click(triggerFor(id), 8);
const pageWithoutHosts = (): string => {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  for (const host of clone.querySelectorAll('mijhar-host')) host.remove();
  return clone.outerHTML;
};

describe('Issue Forms ذات الحقول الإلزامية: دليل جانبي لا بديل عن النموذج', () => {
  beforeEach(async () => {
    loadHtml(page('issue-form.html'));
    go('https://github.com/octo/demo/issues/new?template=bug_report.yml');
    live = await mountComposer();
  });

  it('أزرار المساعد على منطقتي النص في النموذج، وفتحه من «خطوات إعادة الإنتاج» يعرض وضع النموذج لا حقوله الخمسة', async () => {
    await open('issue_form_steps');
    expect(panelHost()).not.toBeNull();
    expect(need('section.panel').dataset.template).toBe('issue-form');
    expect(need('.template-block[data-template="issue-form"]').dataset.currentLabel).toBe('Steps to reproduce');
    expect(need('[data-template-notice]').textContent).toContain('لا يستبدل المساعد النموذج ولا يتجاوز حقوله');
    // حقل واحد للدليل بتسميته وإلزاميته، ولا الحقول الخمسة العامة ولا لغة العناوين.
    expect(need('[data-field="form-current"] label').textContent).toContain('Steps to reproduce');
    expect(need('[data-required]').textContent).toContain('إلزامي');
    expect(q('[data-field="expected"]')).toBeNull();
    expect(q('#mj-composer-language')).toBeNull();
    expect(q('input[name="mj-composer-kind"]')).toBeNull();
    // حقول النموذج الأخرى للاطلاع فقط، بأنواعها وإلزاميها.
    const items = [...panelRoot().querySelectorAll<HTMLElement>('[data-form-field]')].map((li) => li.textContent);
    expect(items).toEqual([
      'Version · حقل نصي · إلزامي',
      'Steps to reproduce · منطقة نص · إلزامي · هنا',
      'Expected behavior · منطقة نص · إلزامي',
      'Browser · قائمة منسدلة',
      'Terms · مربعات اختيار · إلزامي',
    ]);
  });

  it('الإدراج في الحقل المفتوح وحده بصيغته (خطوات مرقّمة بلا ترويسات)، وكل الحقول الأخرى والنموذج كما هي', async () => {
    const before = pageWithoutHosts();
    const form = document.getElementById('new-issue-form')!;
    const childCount = form.children.length;
    await open('issue_form_steps');
    await type(need<HTMLTextAreaElement>('#mj-composer-single'), 'Open github.com\nPress Alt+G\nWatch the sidebar');
    expect(need('[data-preview]').textContent).toBe('1. Open github.com\n2. Press Alt+G\n3. Watch the sidebar');
    await press('[data-action="insert-cursor"]');
    expect(field('issue_form_steps').value).toBe('1. Open github.com\n2. Press Alt+G\n3. Watch the sidebar\n');
    // لا شيء في الحقول الأخرى.
    expect((document.getElementById('issue_form_version') as HTMLInputElement).value).toBe('2.0.1');
    expect(field('issue_form_expected').value).toBe('It should open the sidebar.');
    expect((document.getElementById('issue_form_browser') as HTMLSelectElement).value).toBe('Firefox');
    expect((document.getElementById('issue_form_terms') as HTMLInputElement).checked).toBe(false);
    // النموذج هو نفسه: العنصر ذاته وأبناؤه وسمات الإلزام والنص النائب.
    expect(document.getElementById('new-issue-form')).toBe(form);
    expect(form.children.length).toBe(childCount);
    expect(pageWithoutHosts()).toBe(before);
    for (const id of ['issue_form_version', 'issue_form_steps', 'issue_form_expected', 'issue_form_terms']) expect((document.getElementById(id) as HTMLInputElement).required).toBe(true);
    // لا إرسال ولا نقر على زر الإرسال.
    expect(submits).toEqual([]);
    expect(submitClicks).toEqual([]);
  });

  it('التراجع يعيد الحقل حرفيًا، والحقل الآخر دليله بصيغته (المتوقع فقرة)', async () => {
    await open('issue_form_steps');
    await type(need<HTMLTextAreaElement>('#mj-composer-single'), 'one');
    await press('[data-action="insert-append"]');
    expect(field('issue_form_steps').value).toBe('1. one\n');
    await press('[data-action="undo"]');
    expect(field('issue_form_steps').value).toBe('');
    await open('issue_form_expected');
    await click(triggerFor('issue_form_expected'), 8);
    await open('issue_form_expected');
    expect(need('.template-block[data-template="issue-form"]').dataset.currentLabel).toBe('Expected behavior');
    await type(need<HTMLTextAreaElement>('#mj-composer-single'), 'The sidebar opens');
    expect(need('[data-preview]').textContent).toBe('The sidebar opens');
    await press('[data-action="insert-append"]');
    expect(field('issue_form_expected').value).toBe('It should open the sidebar.\n\nThe sidebar opens\n');
  });

  it('قائمة التسميات الجانبية (مربعات اختيار في قائمة) ليست من حقول النموذج', async () => {
    await open('issue_form_steps');
    const labels = [...panelRoot().querySelectorAll('[data-form-field]')].map((li) => li.getAttribute('data-form-field'));
    expect(labels).not.toContain('bug');
    expect(labels).not.toContain('docs');
    expect(labels).not.toContain('Title');
  });

  it('عبارة من بنك العبارات تُدرج في الحقل المفتوح عبر المعاينة فقط', async () => {
    await open('issue_form_expected');
    await press('[data-category="note"]');
    await press('[data-phrase="n-docs"]');
    expect(field('issue_form_expected').value).toBe('It should open the sidebar.');
    expect(need('[data-preview]').dataset.output).toBe('block');
    await press('[data-action="insert-append"]');
    expect(field('issue_form_expected').value).toContain('قد يفيد توثيق هذا السلوك');
    expect(field('issue_form_steps').value).toBe('');
  });
});

describe('قوالب Markdown: الترويسات وقوائم التحقق كما هي', () => {
  beforeEach(async () => {
    loadHtml(page('markdown-template.html'));
    go('https://github.com/octo/demo/compare/main...feature');
    field('pull_request_body').value = md('PULL_REQUEST_TEMPLATE.md');
    live = await mountComposer();
  });

  it('يتعرف على القالب ويبيّن العنوان المقابل لكل حقل', async () => {
    await open('pull_request_body');
    expect(need('section.panel').dataset.template).toBe('markdown');
    expect(need('[data-template-notice]').textContent).toContain('تبقى ترويسات القالب وقوائم التحقق وتعليقاته كما هي ولا يُحذف منها شيء');
    const mapped = Object.fromEntries([...panelRoot().querySelectorAll<HTMLElement>('[data-map-field]')].map((li) => [li.dataset.mapField, li.textContent]));
    expect(mapped).toMatchObject({ actual: '«Description»', steps: '«How to test»', evidence: '«Screenshots»' });
    expect(mapped.expected).toContain('لا عنوان مقابل');
    // نوع الصفحة طلب دمج: الحقول الخمسة تبقى للكتابة، وكل حقل يبيّن أين يُدرج.
    expect(need('[data-field="steps"] .hint').textContent).toContain('يُدرج تحت «How to test»');
  });

  it('«أدرج تحت عناوين القالب» يملأ تحت العناوين ويحفظ القالب حرفيًا، والمعاينة تطابق ما في الحقل', async () => {
    const original = field('pull_request_body').value;
    await open('pull_request_body');
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Fixes the sidebar toggle');
    await type(need<HTMLTextAreaElement>('#mj-composer-steps'), 'Open github.com\nPress Alt+G');
    await type(need<HTMLTextAreaElement>('#mj-composer-environment'), 'macOS 15');
    const preview = need('[data-preview]').textContent!;
    expect(need('[data-preview]').dataset.output).toBe('edits');
    await press('[data-action="insert-template"]');
    const value = field('pull_request_body').value;
    expect(value).toBe(preview);
    expect(preservesOriginal(original, value)).toBe(true);
    expect(value).toContain('## Description\n\nFixes the sidebar toggle\n');
    expect(value).toContain('## How to test\n\n1. Open github.com\n2. Press Alt+G\n');
    expect(value.endsWith('## Environment\n\n- macOS 15\n')).toBe(true);
    // قوائم التحقق وتعليقات الإرشاد كما هي.
    for (const line of ['- [ ] I have read the contributing guidelines', '- [ ] I have added tests for my changes', '- [x] My code follows the project style', '<!-- What does this PR change and why? -->']) {
      expect(value.split('\n')).toContain(line);
    }
    expect(need('.status[data-status="on"]').textContent).toContain('تحت عناوين القالب');
    expect(submits).toEqual([]);
    expect(submitClicks).toEqual([]);
  });

  it('التراجع عن الإدراج المتعدد يعيد القالب حرفيًا، وبعد تعديل المستخدم تبقى تعديلاته', async () => {
    const original = field('pull_request_body').value;
    await open('pull_request_body');
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Fixes it');
    await type(need<HTMLTextAreaElement>('#mj-composer-steps'), 'one');
    await press('[data-action="insert-template"]');
    expect(field('pull_request_body').value).not.toBe(original);
    await press('[data-action="undo"]');
    expect(field('pull_request_body').value).toBe(original);

    await press('[data-action="insert-template"]');
    const inserted = field('pull_request_body').value;
    // المستخدم يضيف سطره الخاص بعد الإدراج.
    field('pull_request_body').value = `${inserted}\nمن عندي: ملاحظة أخيرة`;
    await press('[data-action="undo"]');
    expect(field('pull_request_body').value).toBe(`${original}\nمن عندي: ملاحظة أخيرة`);
  });

  it('عبارة مختارة تحل محل التنظيم في المعاينة وتُدرج كتلةً واحدة، والقالب سليم', async () => {
    const original = field('pull_request_body').value;
    await open('pull_request_body');
    await press('[data-category="praise"]');
    await press('[data-phrase="p-tests"]');
    expect(need('[data-preview]').dataset.output).toBe('block');
    expect(need('[data-preview]').textContent).toContain('أحسنت بإضافة الاختبارات');
    expect(field('pull_request_body').value).toBe(original);
    await press('[data-action="insert-append"]');
    expect(preservesOriginal(original, field('pull_request_body').value)).toBe(true);
    expect(field('pull_request_body').value).toContain('أحسنت بإضافة الاختبارات');
  });
});

describe('هيكل غير معروف: معاينة ونسخ يدوي دون لمس حقول الصفحة', () => {
  let written: string[];
  beforeEach(async () => {
    loadHtml(page('unknown-template.html'));
    go('https://github.com/octo/demo/issues/new');
    written = [];
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (text: string) => void written.push(text) } });
    live = await mountComposer();
  });

  it('لا أزرار إدراج ولا تراجع، وزر النسخ وحده، ولا يُلمس أي حقل في الصفحة', async () => {
    const before = pageWithoutHosts();
    const values = Object.fromEntries(['field_a', 'field_b', 'field_c'].map((id) => [id, (document.getElementById(id) as HTMLInputElement).value]));
    const inputs: string[] = [];
    document.addEventListener('input', (event) => inputs.push((event.target as Element).id), true);
    await open('field_a');
    expect(need('section.panel').dataset.template).toBe('unknown');
    expect(need('[data-template-notice]').textContent).toContain('لم يُتعرَّف على هيكل القالب');
    expect(q('[data-action="insert-cursor"]')).toBeNull();
    expect(q('[data-action="insert-append"]')).toBeNull();
    expect(q('[data-action="insert-template"]')).toBeNull();
    expect(q('[data-action="undo"]')).toBeNull();
    expect(need('[data-note="copy-only"]').textContent).toContain('لا إدراج في حقول الصفحة');
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Something broke');
    await type(need<HTMLTextAreaElement>('#mj-composer-steps'), 'one\ntwo');
    const preview = need('[data-preview]');
    expect(preview.dataset.output).toBe('copy');
    expect(preview.textContent).toContain('1. one\n2. two');
    await press('[data-action="copy-text"]');
    expect(written).toEqual([preview.textContent]);
    expect(need('.status[data-status="on"]').textContent).toContain('لم يُمس شيء في الصفحة');
    // الصفحة كما هي حرفيًا، وما من حدث input على أي حقل منها، ولا إرسال.
    expect(Object.fromEntries(['field_a', 'field_b', 'field_c'].map((id) => [id, (document.getElementById(id) as HTMLInputElement).value]))).toEqual(values);
    expect(pageWithoutHosts()).toBe(before);
    expect(inputs.filter((id) => id.startsWith('field_'))).toEqual([]);
    expect(submits).toEqual([]);
    expect(submitClicks).toEqual([]);
  });

  it('العبارة المختارة هنا أيضًا للنسخ اليدوي وحده', async () => {
    await open('field_a');
    await press('[data-category="question"]');
    await press('[data-phrase="q-clarify"]');
    expect(need('[data-preview]').dataset.output).toBe('copy');
    expect(q('[data-action="insert-cursor"]')).toBeNull();
    await press('[data-action="copy-text"]');
    expect(written[0]).toContain('هل يمكنك توضيح');
    expect(field('field_a').value).toBe('draft A');
  });

  it('تعذّر الحافظة: رسالة بالنسخ اليدوي من المعاينة ولا مساس بالصفحة', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
    await open('field_a');
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'x');
    await press('[data-action="copy-text"]');
    expect(need('.status[data-status="on"]').textContent).toContain('حدّد النص في المعاينة بنفسك');
    expect(field('field_a').value).toBe('draft A');
  });
});

describe('بلا قالب: سلوك T-7.1 كما هو', () => {
  it('بلاغ عادي (وقوائم جانبية بمربعات اختيار) ← لا وضع قالب، والإدراج المعتاد', async () => {
    loadHtml(page('plain-issue.html'));
    go('https://github.com/octo/demo/issues/new');
    live = await mountComposer();
    await open('issue_body');
    expect(need('section.panel').dataset.template).toBe('none');
    expect(q('[data-template-notice]')).toBeNull();
    await type(need<HTMLTextAreaElement>('#mj-composer-actual'), 'Something broke');
    await press('[data-action="insert-cursor"]');
    expect(field('issue_body').value).toBe('## Actual behavior\n\nSomething broke\n');
    expect(submits).toEqual([]);
  });

  it('مسودة بترويسة واحدة ليست قالبًا: الإلحاق المعتاد', async () => {
    loadHtml(page('plain-issue.html'));
    go('https://github.com/octo/demo/issues/new');
    field('issue_body').value = '## My notes\n\nsome text';
    live = await mountComposer();
    await open('issue_body');
    expect(need('section.panel').dataset.template).toBe('none');
  });
});
