// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/issues/new"}
// TEST-WRITE-01 (AC-F1) وTEST-WRITE-04 (AC-F4) على العينة المرجعية fixture-editors.html (نماذج Issue وPR وتعليق بمسودات موجودة وحقل بلا شريط وCodeMirror):
//  - زر «مساعد» في شريط كل حقل مدعوم، فتحه يعرض لوحة تنظّم المتوقع والفعلي وخطوات التكرار والبيئة والأدلة بمعاينة كاملة، دون نشر أو إرسال؛
//  - الإدراج عند المؤشر أو بالإلحاق دون مسح المسودة، ولقطة تراجع قبله، و«التراجع عن آخر إدراج»، ولا نشر تلقائي (لا submit ولا نقر على زر إرسال).
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compose } from '../../../../src/modules/f/composer';
import { buttonHosts, click, field, fill, flush, hosts, loadHtml, mountComposer, openFor, pageHtml, panelButton, panelField, panelHost, panelRoot, preview, status, triggerFor, typeInto } from './helpers';
import type { Live } from './helpers';

let live: Live | null = null;
beforeEach(() => {
  window.history.pushState({}, '', '/octo/demo/issues/new');
  loadHtml();
});
afterEach(() => {
  live?.manager.stop();
  live = null;
  vi.restoreAllMocks();
});

/** كل ما قد يكون «نشرًا» أو «إرسالًا»: أحداث submit ونقر أزرار الإرسال ونداءات submit/requestSubmit. */
function watchPublishing(): { events: string[]; stop: () => void } {
  const events: string[] = [];
  const onSubmit = (event: Event): void => void events.push(`submit:${(event.target as Element).id}`);
  const onClick = (event: Event): void => {
    const target = event.target as Element;
    if (target.closest?.('button[type="submit"], input[type="submit"]')) events.push(`click:${target.id}`);
  };
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('click', onClick, true);
  const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => void events.push('form.submit()'));
  const request = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => void events.push('form.requestSubmit()'));
  return {
    events,
    stop: () => {
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('click', onClick, true);
      submit.mockRestore();
      request.mockRestore();
    },
  };
}

const FIELDS = {
  expected: 'The side panel opens when I press Alt+G.',
  actual: 'Nothing happens in Firefox 158.',
  steps: 'Open github.com\nPress Alt+G\nWatch the sidebar',
  environment: 'macOS 15\nFirefox 158.0.1',
  evidence: 'https://example.com/shot.png',
};

describe('الأزرار في حقول الكتابة', () => {
  it('زر لكل حقل مدعوم: في شريط أدواته، أو قبله مباشرة إن غاب الشريط؛ ولا زر لـCodeMirror', async () => {
    live = await mountComposer();
    expect(buttonHosts()).toHaveLength(4);
    for (const id of ['issue-body', 'pull_request_body', 'new_comment_field']) {
      const toolbar = document.querySelector(`markdown-toolbar[for="${id}"]`)!;
      expect(toolbar.querySelectorAll('[data-mijhar-host="f.composer.button"]')).toHaveLength(1);
    }
    expect(field('fallback-field').previousElementSibling?.getAttribute('data-mijhar-host')).toBe('f.composer.button');
    expect(document.querySelector('.cm-editor markdown-toolbar')!.children).toHaveLength(0);
    expect(live.errors).toEqual([]);
  });

  it('الأزرار أزرار أصلية باسم وصول وحالة فتح، وبلا أثر قبل الضغط: لا لوحة، والمسودات كما هي', async () => {
    const drafts = ['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field'].map((id) => field(id).value);
    live = await mountComposer();
    for (const id of ['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field']) {
      const button = triggerFor(id);
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-label')).toContain('مساعد كتابة البلاغات والمراجعات');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
    expect(panelHost()).toBeNull();
    expect(['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field'].map((id) => field(id).value)).toEqual(drafts);
  });

  it('حقل للقراءة فقط أو معطّل أو داخل CodeMirror بلا زر، وحقل يُضاف لاحقًا يأخذ زرًا', async () => {
    live = await mountComposer();
    const extra = document.createElement('div');
    extra.innerHTML =
      '<markdown-toolbar for="ro"></markdown-toolbar><textarea id="ro" readonly></textarea><markdown-toolbar for="dis"></markdown-toolbar><textarea id="dis" disabled></textarea><markdown-toolbar for="late"></markdown-toolbar><textarea id="late"></textarea>';
    document.querySelector('main')!.append(extra);
    await flush(40);
    expect(buttonHosts()).toHaveLength(5);
    expect(document.querySelector('markdown-toolbar[for="ro"]')!.children).toHaveLength(0);
    expect(document.querySelector('markdown-toolbar[for="dis"]')!.children).toHaveLength(0);
    expect(document.querySelector('markdown-toolbar[for="late"]')!.children).toHaveLength(1);
  });
});

describe('اللوحة وتنظيم المتوقع والفعلي والخطوات والبيئة والأدلة (AC-F1)', () => {
  it('فتح اللوحة: حوار غير مشروط باسم، في نهاية body، والتركيز على أول حقل، وزر المساعد مضغوط', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    expect(panelHost()).not.toBeNull();
    expect(document.body.lastElementChild).toBe(panelHost());
    const panel = panelRoot().querySelector('.panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(panelRoot().getElementById('mj-composer-title')!.textContent).toBe('مساعد كتابة البلاغات والمراجعات');
    expect(panelRoot().activeElement).toBe(panelField('expected'));
    expect(triggerFor('issue-body').getAttribute('aria-expanded')).toBe('true');
    expect(panelRoot().querySelector('[data-section="static"]')).not.toBeNull();
  });

  it('خمسة حقول بتسميات وتلميحات، والنوع الافتراضي من الصفحة (بلاغ جديد ← Issue)', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    const labels = [...panelRoot().querySelectorAll('.field > label')].map((l) => l.textContent);
    expect(labels).toEqual(['المتوقع', 'الفعلي', 'خطوات التكرار', 'البيئة', 'الأدلة', 'لغة العناوين']);
    for (const name of ['expected', 'actual', 'steps', 'environment', 'evidence']) {
      const el = panelField(name);
      expect(panelRoot().querySelector(`label[for="${el.id}"]`)).not.toBeNull();
      expect(el.getAttribute('aria-describedby')).toBe(`${el.id}-hint`);
    }
    expect((panelRoot().querySelector('input[name="mj-composer-kind"][value="issue"]') as HTMLInputElement).checked).toBe(true);
  });

  it('طلب دمج (صفحة PR): النوع الافتراضي PR وتسميات الحقول بصيغته', async () => {
    window.history.pushState({}, '', '/octo/demo/pull/9');
    live = await mountComposer();
    await openFor('issue-body');
    expect((panelRoot().querySelector('input[name="mj-composer-kind"][value="pr"]') as HTMLInputElement).checked).toBe(true);
    expect([...panelRoot().querySelectorAll('.field > label')].slice(0, 3).map((l) => l.textContent)).toEqual(['المتوقع بعد التغيير', 'ما كان يحدث قبله', 'خطوات التحقق']);
  });

  it('المعاينة الكاملة تتبع الكتابة حرفيًا (ما سيُدرج بالضبط)، وقبل الكتابة نص مساعد وأزرار الإدراج معطّلة', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    expect(preview().getAttribute('data-empty')).toBe('true');
    expect(panelButton('insert-cursor').disabled).toBe(true);
    expect(panelButton('insert-append').disabled).toBe(true);
    await fill(FIELDS);
    expect(preview().getAttribute('data-empty')).toBe('false');
    expect(preview().textContent).toBe(compose({ ...FIELDS }, { kind: 'issue', language: 'auto' }).text);
    expect(preview().textContent).toContain('## Steps to reproduce\n\n1. Open github.com\n2. Press Alt+G\n3. Watch the sidebar');
    expect(panelButton('insert-cursor').disabled).toBe(false);
    // لغة العناوين تتبع ما يُكتب، ويمكن فرضها.
    // غلبة الحروف العربية على كل ما كُتب تحوّل العناوين إلى العربية.
    await fill({ expected: 'يفتح اللوحة الجانبية عند الضغط على الاختصار', actual: 'لا يحدث شيء في المتصفح إطلاقًا', steps: 'افتح الصفحة\nاضغط الاختصار', environment: '', evidence: '' });
    expect(preview().textContent).toContain('## السلوك المتوقع');
    expect(preview().textContent).toContain('1. افتح الصفحة\n2. اضغط الاختصار');
    const select = panelRoot().getElementById('mj-composer-language') as HTMLSelectElement;
    await act(async () => {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await flush(5);
    });
    expect(preview().textContent).toContain('## Expected behavior');
    // أقسام فارغة تُعلَن.
    expect(panelRoot().querySelector('[data-section="preview"] .note')!.textContent).toContain('أقسام فارغة لن تُدرج');
  });

  it('التنظيم على العينات المرجعية: بلاغ جديد وطلب دمج وتعليق، دون نشر أو إرسال', async () => {
    const watch = watchPublishing();
    live = await mountComposer();
    for (const [id, kind] of [['issue-body', 'issue'], ['pull_request_body', 'issue'], ['new_comment_field', 'issue']] as const) {
      await openFor(id);
      await fill(FIELDS);
      expect(preview().textContent, id).toContain(`## ${kind === 'issue' ? 'Expected behavior' : ''}`);
      await click(panelButton('close'));
    }
    watch.stop();
    expect(watch.events).toEqual([]);
  });
});

describe('الإدراج وحماية المسودة (AC-F4)', () => {
  it('عند المؤشر في تعليق بمسودة: ما قبل المؤشر وما بعده كما هما، ويظهر النص المعاين بالضبط، ولا إرسال', async () => {
    const watch = watchPublishing();
    live = await mountComposer();
    const original = field('new_comment_field').value;
    field('new_comment_field').setSelectionRange(24, 24);
    await openFor('new_comment_field');
    await fill(FIELDS);
    const text = compose({ ...FIELDS }, { kind: 'issue', language: 'auto' }).text;
    await click(panelButton('insert-cursor'));
    const value = field('new_comment_field').value;
    expect(value.startsWith(original.slice(0, 24))).toBe(true);
    expect(value.endsWith(original.slice(24))).toBe(true);
    expect(value).toContain(text.trimEnd());
    expect(value.replace(text.trimEnd(), '').replace(/\n{2,}/g, '\n')).toBe(original.replace(/\n{2,}/g, '\n'));
    expect(status()).toContain('أُدرج عند المؤشر');
    expect(status()).toContain('لم يُمسح شيء من مسودتك، ولم يُرسل شيء');
    expect(panelButton('undo').disabled).toBe(false);
    watch.stop();
    expect(watch.events).toEqual([]);
  });

  it('المؤشر حيث تركه المستخدم في الحقل (لا عند فتح اللوحة): الحقل لا يفقد تحديده بنقر زر المساعد', async () => {
    live = await mountComposer();
    const f = field('new_comment_field');
    f.setSelectionRange(5, 5);
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    triggerFor('new_comment_field').dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    expect([f.selectionStart, f.selectionEnd]).toEqual([5, 5]);
  });

  it('بالإلحاق في طلب دمج بمسودة: المسودة سليمة في أول الحقل والنص في آخره', async () => {
    live = await mountComposer();
    const original = field('pull_request_body').value;
    await openFor('pull_request_body');
    await fill(FIELDS);
    await click(panelButton('insert-append'));
    const value = field('pull_request_body').value;
    expect(value.startsWith(original)).toBe(true);
    expect(value.slice(original.length)).toBe(`\n\n${compose({ ...FIELDS }, { kind: 'issue', language: 'auto' }).text.trimEnd()}\n`);
    expect(status()).toContain('أُلحق في نهاية المسودة');
  });

  it('حقل فارغ: يُدرج النص وحده (بلا فواصل زائدة في أوله)', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    await fill(FIELDS);
    await click(panelButton('insert-cursor'));
    expect(field('issue-body').value).toBe(compose({ ...FIELDS }, { kind: 'issue', language: 'auto' }).text.trimEnd() + '\n');
  });

  it('التراجع عن آخر إدراج يعيد المسودة والتحديد حرفيًا من لقطة ما قبل الإدراج', async () => {
    live = await mountComposer();
    const f = field('new_comment_field');
    const original = f.value;
    f.setSelectionRange(12, 24);
    await openFor('new_comment_field');
    await fill(FIELDS);
    await click(panelButton('insert-cursor'));
    expect(f.value).not.toBe(original);
    await click(panelButton('undo'));
    expect(f.value).toBe(original);
    expect([f.selectionStart, f.selectionEnd]).toEqual([12, 24]);
    expect(status()).toContain('عادت مسودتك كما كانت قبله حرفيًا');
    expect(panelButton('undo').disabled).toBe(true);
  });

  it('تعديل لاحق ثم تراجع: يُزال المُدرج وحده ويبقى تعديلك', async () => {
    live = await mountComposer();
    const f = field('pull_request_body');
    await openFor('pull_request_body');
    await fill(FIELDS);
    await click(panelButton('insert-append'));
    f.setRangeText('\nMy later edit.', f.value.length, f.value.length, 'end');
    await click(panelButton('undo'));
    expect(f.value).toContain('Draft: this PR fixes the sidebar toggle.');
    expect(f.value).toContain('My later edit.');
    expect(f.value).not.toContain('Expected behavior');
    expect(status()).toContain('بقيت تعديلاتك اللاحقة');
  });

  it('تعذّر التراجع (المُدرج نفسه تغيّر): تحذير ولا مساس بالحقل، ونسخ المسودة السابقة إلى الحافظة', async () => {
    live = await mountComposer();
    const f = field('new_comment_field');
    const original = f.value;
    await openFor('new_comment_field');
    await fill(FIELDS);
    await click(panelButton('insert-append'));
    f.value = f.value.replace('Nothing happens', 'Something else');
    const edited = f.value;
    await click(panelButton('undo'));
    expect(f.value).toBe(edited);
    expect(status()).toContain('تعذّر التراجع تلقائيًا');
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void written.push(text) } });
    await click(panelButton('copy-previous'), 20);
    expect(written).toEqual([original]);
    expect(status()).toContain('نُسخت المسودة السابقة');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('denied')) } });
    await click(panelButton('copy-previous'), 20);
    expect(status()).toContain('تعذّر النسخ');
  });

  it('لا نشر تلقائي في أي خطوة: فتح وكتابة وإدراج وإلحاق وتراجع وإغلاق، على كل النماذج', async () => {
    const watch = watchPublishing();
    live = await mountComposer();
    for (const id of ['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field']) {
      await openFor(id);
      await fill(FIELDS);
      await click(panelButton('insert-cursor'));
      await click(panelButton('undo'));
      await click(panelButton('insert-append'));
      await click(panelButton('close'));
    }
    watch.stop();
    expect(watch.events).toEqual([]);
  });

  it('الإدراج لا يتعدى الحقل المفتوح: الحقول الأخرى لم تُمس', async () => {
    live = await mountComposer();
    const before = Object.fromEntries(['issue-body', 'pull_request_body', 'new_comment_field', 'fallback-field'].map((id) => [id, field(id).value]));
    await openFor('pull_request_body');
    await fill(FIELDS);
    await click(panelButton('insert-cursor'));
    for (const id of ['issue-body', 'new_comment_field', 'fallback-field']) expect(field(id).value, id).toBe(before[id]);
  });

  it('الحقل أُزيل من الصفحة أثناء فتح اللوحة: تُغلق (أو يُعلَن عند الإدراج) ولا استثناء', async () => {
    live = await mountComposer();
    await openFor('fallback-field');
    field('fallback-field').closest('form')!.remove();
    await flush(40);
    expect(panelHost()).toBeNull();
    expect(live.errors).toEqual([]);
  });
});

describe('اللوحة: لوحة المفاتيح والجلسة', () => {
  it('Escape يغلق اللوحة ويعيد التركيز إلى زر المساعد، وزر الإغلاق كذلك', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    act(() => void panelField('expected').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
    await flush(5);
    expect(panelHost()).toBeNull();
    expect(triggerFor('issue-body').getAttribute('aria-expanded')).toBe('false');
    const button = triggerFor('issue-body');
    expect((button.getRootNode() as ShadowRoot).activeElement).toBe(button);
    expect(document.activeElement).toBe((button.getRootNode() as ShadowRoot).host);
    await openFor('issue-body');
    await click(panelButton('close'));
    expect(panelHost()).toBeNull();
  });

  it('ضغطة الزر مرة ثانية تغلق اللوحة، وفتح حقل آخر يستبدلها (لوحة واحدة دائمًا)', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    await click(triggerFor('issue-body'));
    expect(panelHost()).toBeNull();
    await openFor('issue-body');
    await openFor('new_comment_field');
    expect(hosts('f.composer.panel')).toHaveLength(1);
    expect(triggerFor('issue-body').getAttribute('aria-expanded')).toBe('false');
    expect(triggerFor('new_comment_field').getAttribute('aria-expanded')).toBe('true');
  });

  it('ما كُتب في اللوحة يبقى لكل حقل ما دامت الصفحة مفتوحة، ولا يختلط بين الحقول', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    await fill({ expected: 'kept for issue body' });
    await click(panelButton('close'));
    await openFor('new_comment_field');
    expect(panelField('expected').value).toBe('');
    await click(panelButton('close'));
    await openFor('issue-body');
    expect(panelField('expected').value).toBe('kept for issue body');
  });

  it('الكتابة في اللوحة لا تبلغ اختصارات GitHub: حرف أو Enter لا يبلغ المستند، وCtrl/⌘ يمر', async () => {
    live = await mountComposer();
    await openFor('issue-body');
    const seen: string[] = [];
    const spy = (event: Event): void => void seen.push((event as KeyboardEvent).key);
    document.addEventListener('keydown', spy);
    try {
      for (const key of ['g', 'i', 'Enter', '?']) act(() => void panelField('expected').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true })));
      expect(seen).toEqual([]);
      act(() => void panelField('expected').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true })));
      act(() => void panelField('expected').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true })));
      expect(seen).toEqual(['z', 'Tab']);
    } finally {
      document.removeEventListener('keydown', spy);
    }
  });
});

describe('إيقاف الوحدة', () => {
  it('وهي مفتوحة وبعد إدراج: الصفحة حرفيًا كما كانت (لا مضيف ولا سمة) والمسودة بما أدرجه المستخدم', async () => {
    const pristine = pageHtml();
    live = await mountComposer();
    await openFor('new_comment_field');
    await fill(FIELDS);
    await click(panelButton('insert-append'));
    const value = field('new_comment_field').value;
    live.manager.stop();
    live = null;
    expect(buttonHosts()).toHaveLength(0);
    expect(panelHost()).toBeNull();
    expect(pageHtml()).toBe(pristine);
    expect(field('new_comment_field').value).toBe(value);
  });
});
