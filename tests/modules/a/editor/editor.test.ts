// TEST-RTL-04 (AC-A4) على jsdom: عشرون تبديلًا في حقل يربطه <markdown-toolbar> لا تغيّر value ولا التحديد ولا اتجاهه، ولا يُضاف
// مستمع على الحقل ولا يُمنع حدث input أو keydown، والإيقاف يعيد dir الأصلية ويزيل الزر؛ والمحرر غير المدعوم بلا زر. ومكوّن الإدراج
// الآمن (shared/fields) في مساره البديل (jsdom بلا execCommand). التمرير وسجل التراجع وأمر insertText في المتصفحات الأربعة:
// tests/modules/a/browser/run.mjs.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { HOST_ATTR } from '../../../../src/core/ui-host/shadow';
import { EDITOR_FEATURE, EDITOR_HOST_NAME, UNSUPPORTED_EDITORS, createEditorFeature, fieldForToolbar } from '../../../../src/modules/a/editor';
import { createModuleA } from '../../../../src/modules/a/scope';
import { insertIntoField, nextDirection, setFieldDirection } from '../../../../src/shared/fields';

const deliver = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const CONTENT = Array.from({ length: 40 }, (_, i) => (i % 2 ? `السطر ${i} بالعربية مع كلمة English` : `Line ${i} with عربي inside`)).join('\n');

const PAGE = `<!doctype html><html lang="en"><head><title>issue</title></head><body>
<main><div class="Layout-main">
  <form id="new-comment">
    <markdown-toolbar for="comment-body"><div class="toolbar-group"><button type="button" data-md-button>B</button></div></markdown-toolbar>
    <textarea id="comment-body" aria-label="Markdown value"></textarea>
  </form>
  <div class="cm-editor"><markdown-toolbar for="cm"></markdown-toolbar><div class="cm-content" id="cm" contenteditable="true"></div></div>
</div></main></body></html>`;

function mount(feature = EDITOR_FEATURE) {
  const dom = new JSDOM(PAGE, { url: 'https://github.com/octo/demo/issues/1', pretendToBeVisual: true });
  const doc = dom.window.document;
  const field = doc.getElementById('comment-body') as HTMLTextAreaElement;
  field.value = CONTENT;
  field.setSelectionRange(120, 160, 'backward');
  const detector = new PageDetector({ document: doc, settleMs: 5 });
  const manager = new LifecycleManager({ registry: new ModuleRegistry([createModuleA({ features: [feature] })]), detector, document: doc, isEnabled: () => true });
  manager.start();
  return { dom, doc, field, manager };
}

const buttons = (doc: Document): HTMLButtonElement[] =>
  [...doc.querySelectorAll(`[${HOST_ATTR}="${EDITOR_HOST_NAME}"]`)].map((host) => host.shadowRoot?.querySelector('button') as HTMLButtonElement);

describe('TEST-RTL-04: زر تبديل الاتجاه', () => {
  it('زر واحد في شريط الحقل المدعوم، ولا زر لمحرر CodeMirror', () => {
    const { doc, manager } = mount();
    const hosts = doc.querySelectorAll(`[${HOST_ATTR}="${EDITOR_HOST_NAME}"]`);
    expect(hosts.length).toBe(1);
    expect(hosts[0]?.parentElement?.getAttribute('for')).toBe('comment-body');
    expect(UNSUPPORTED_EDITORS.map((e) => e.selector)).toContain('.cm-editor .cm-content');
    manager.stop();
  });

  it('عشرون تبديلًا: value والتحديد واتجاهه كما هي، والدورة rtl ← ltr ← auto، ولا يُعترض input ولا keydown', () => {
    const { dom, doc, field, manager } = mount();
    const seen: string[] = [];
    for (const type of ['input', 'keydown']) {
      field.addEventListener(type, (event) => seen.push(`${type}:${event.defaultPrevented}`));
    }
    const [button] = buttons(doc);
    const dirs: Array<string | null> = [];
    for (let i = 0; i < 20; i += 1) {
      button?.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      button?.click();
      dirs.push(field.getAttribute('dir'));
      expect(field.value).toBe(CONTENT);
      expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([120, 160, 'backward']);
    }
    expect(dirs.slice(0, 6)).toEqual(['rtl', 'ltr', 'auto', 'rtl', 'ltr', 'auto']);
    field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
    expect(seen).toEqual(['keydown:false', 'input:false']);
    expect(button?.getAttribute('aria-label')).toContain('اتجاه الكتابة في الحقل');
    manager.stop();
  });

  it('الإيقاف يعيد dir الأصلية (غائبة هنا) ويزيل الزر، والقيمة كما هي', () => {
    const { doc, field, manager } = mount();
    const [button] = buttons(doc);
    for (let i = 0; i < 5; i += 1) button?.click();
    expect(field.getAttribute('dir')).toBe('ltr');
    manager.stop();
    expect(field.hasAttribute('dir')).toBe(false);
    expect(doc.querySelector(`[${HOST_ATTR}]`)).toBeNull();
    expect(field.value).toBe(CONTENT);
  });

  it('Firefox غير مدعوم: لا زر (تغيّر الاتجاه يُفقد سجل التراجع فيه)، والحقل لا يُمس', () => {
    const { doc, field, manager } = mount(createEditorFeature({ target: 'firefox' }));
    expect(buttons(doc)).toEqual([]);
    expect(field.hasAttribute('dir')).toBe(false);
    expect(UNSUPPORTED_EDITORS.find((e) => e.browsers?.includes('firefox'))?.selector).toBe('textarea');
    manager.stop();
  });

  it('حقل يضيفه GitHub بعد التركيب يُضاف له الزر', async () => {
    const { doc, manager } = mount();
    doc.querySelector('.Layout-main')?.insertAdjacentHTML('beforeend', '<div><markdown-toolbar for="reply"></markdown-toolbar><textarea id="reply"></textarea></div>');
    await deliver();
    expect(buttons(doc).length).toBe(2);
    manager.stop();
  });

  it('ربط الشريط بالحقل: for، وإلا textarea وحيد قريب، ولا شيء إن تعدد أو لم يكن textarea', () => {
    const doc = new JSDOM('<div id="a"><markdown-toolbar></markdown-toolbar><textarea id="t1"></textarea></div><div id="b"><markdown-toolbar></markdown-toolbar><textarea></textarea><textarea></textarea></div><markdown-toolbar id="c" for="d"></markdown-toolbar><div id="d" contenteditable="true"></div>').window.document;
    expect(fieldForToolbar(doc.querySelector('#a markdown-toolbar') as Element)?.id).toBe('t1');
    expect(fieldForToolbar(doc.querySelector('#b markdown-toolbar') as Element)).toBeNull();
    expect(fieldForToolbar(doc.getElementById('c') as Element)).toBeNull();
  });
});

describe('shared/fields', () => {
  it('nextDirection وsetFieldDirection بكاتب مخصص', () => {
    expect([nextDirection(null), nextDirection('rtl'), nextDirection('ltr'), nextDirection('auto')]).toEqual(['rtl', 'ltr', 'auto', 'rtl']);
    const doc = new JSDOM('<textarea>abc def</textarea>').window.document;
    const field = doc.querySelector('textarea') as HTMLTextAreaElement;
    field.setSelectionRange(1, 5, 'forward');
    const writes: string[] = [];
    setFieldDirection(field, 'rtl', (f, v) => {
      writes.push(v);
      f.setAttribute('dir', v);
    });
    expect(writes).toEqual(['rtl']);
    expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([1, 5, 'forward']);
  });

  it('insertIntoField بلا execCommand: setRangeText مكان التحديد وحدث input واحد بنوع insertText', () => {
    const dom = new JSDOM('<textarea>مرحبا العالم</textarea>');
    const field = dom.window.document.querySelector('textarea') as HTMLTextAreaElement;
    field.setSelectionRange(6, 12);
    const events: string[] = [];
    field.addEventListener('input', (event) => events.push((event as InputEvent).inputType ?? 'none'));
    const result = insertIntoField(field, 'يا');
    expect(result).toEqual({ method: 'setRangeText', value: 'مرحبا يا' });
    expect(field.selectionStart).toBe(8);
    expect(events).toEqual(['insertText']);
  });
});
