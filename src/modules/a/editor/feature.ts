// ميزة «زر تبديل اتجاه الكتابة» (T-2.4، F-A4): زر صغير معزول (Shadow DOM) في آخر شريط أدوات Markdown (<markdown-toolbar>) يبدّل
// dir حقل النص المرتبط به بالدورة rtl ← ltr ← auto. لا يمس value ولا يضع مستمعًا على الحقل، ويحفظ التحديد واتجاهه والتمرير
// (shared/fields). سمة dir تُكتب عبر سجل الميزة فيعيد الإيقاف قيمتها الأصلية، ويُزال الزر.
// المحررات المدعومة: textarea يربطه شريط الأدوات بسمة for (محرر React الجديد والتقليدي، T-0.1) في عائلة Chromium. غير المدعوم
// يُسرد في UNSUPPORTED_EDITORS ولا يظهر له زر (AC-A4): ومنه كل حقل في Firefox، لأن تغيّر اتجاه الحقل فعلًا يعيد بناء محرره الداخلي
// فيُفقد سجل التراجع (MJ7: evidence/T-2.4/editor-undo.json).
import type { SelectorEntry } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import { fieldDirection, nextDirection, setFieldDirection } from '../../../shared/fields';
import type { FieldDirection, TextField } from '../../../shared/fields';
import type { ModuleAFeature } from '../scope/feature';

export const EDITOR_FEATURE_ID = 'editor-toggle';
export const EDITOR_HOST_NAME = 'a.editor-toggle';
export const EDITOR_SELECTOR_KEYS = { toolbar: 'a.editor.toolbar' } as const;

export const EDITOR_SELECTORS: readonly SelectorEntry[] = [
  {
    key: EDITOR_SELECTOR_KEYS.toolbar,
    description: 'شريط أدوات Markdown المرتبط بحقل التعليق (for = معرّف textarea). T-0.1: موجود في محرر React الجديد',
    candidates: ['markdown-toolbar'],
  },
];

export type EditorTarget = 'chromium' | 'firefox';

/** محررات لا يظهر لها الزر، بسبب كل منها (T-0.1، AC-S1.2، وقياس MJ7). browsers: حيث ينطبق، أو كل المتصفحات إن غاب. */
export const UNSUPPORTED_EDITORS: ReadonlyArray<{ readonly editor: string; readonly selector: string; readonly reason: string; readonly browsers?: readonly EditorTarget[] }> = [
  {
    editor: 'محرر الملفات (CodeMirror 6)',
    selector: '.cm-editor .cm-content',
    reason: 'GitHub يضع dir="auto" على كل سطر .cm-line، فاتجاه كل سطر من نصه ولا أثر لسمة الحاوية (T-0.1: 20 تبديلًا بلا أثر).',
  },
  {
    editor: 'كل حقول الكتابة في Firefox',
    selector: 'textarea',
    reason: 'تغيّر اتجاه الحقل فعلًا (بسمة dir أو بـCSS) يعيد بناء محرره الداخلي فيُفقد سجل التراجع: بعد تبديل واحد لا يتراجع ⌘Z عن كتابة سابقة (MJ7، Firefox 158).',
    browsers: ['firefox'],
  },
];

const LABELS: Record<FieldDirection | 'none', { readonly short: string; readonly long: string }> = {
  rtl: { short: 'ع←', long: 'من اليمين إلى اليسار' },
  ltr: { short: '→A', long: 'من اليسار إلى اليمين' },
  auto: { short: '⇄', long: 'تلقائي بحسب أول حرف' },
  none: { short: '⇄', long: 'اتجاه الصفحة' },
};

const BUTTON_CSS = `
.toggle { min-width: 32px; height: 28px; padding: 0 var(--mijhar-space-6); font-size: 13px; font-weight: 700; line-height: 1; }
`;

/** حقل النص الذي يخدمه الشريط: بسمة for، وإلا textarea وحيد في أقرب حاوية مشتركة قريبة. */
export function fieldForToolbar(toolbar: Element): TextField | null {
  const doc = toolbar.ownerDocument;
  const id = toolbar.getAttribute('for');
  const byId = id ? doc.getElementById(id) : null;
  if (byId) return byId.localName === 'textarea' ? (byId as HTMLTextAreaElement) : null;
  let scope: Element | null = toolbar.parentElement;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const fields = scope.querySelectorAll('textarea');
    if (fields.length === 1) return fields[0] as HTMLTextAreaElement;
    if (fields.length > 1) return null;
  }
  return null;
}

export interface EditorFeatureOptions {
  /** المتصفح الهدف؛ الافتراضي هدف البناء (__TARGET__). */
  readonly target?: EditorTarget;
}

export function createEditorFeature(options: EditorFeatureOptions = {}): ModuleAFeature {
  const target = options.target ?? __TARGET__;
  return {
    id: EDITOR_FEATURE_ID,
    title: 'زر تبديل اتجاه الكتابة في المحرر',
    defaults: { enabled: true, scope: 'all', repos: [] },
    selectors: EDITOR_SELECTORS,
    mount(ctx) {
      // لا زر حيث يثبت أن الحقل لا يتحمل التبديل (AC-A4): الزر لا يُعرض بدل المخاطرة بسجل التراجع.
      if (UNSUPPORTED_EDITORS.some((e) => e.selector === 'textarea' && e.browsers?.includes(target))) return;
      const doc = ctx.document;
      const attached = new WeakSet<Element>();
      const toolbarSelector = ctx.selectors.entry(EDITOR_SELECTOR_KEYS.toolbar).candidates.join(', ');
      const write = (field: TextField, value: FieldDirection): void => ctx.mutations.setAttribute(field, 'dir', value);

      const attach = (toolbar: Element): void => {
        if (attached.has(toolbar) || ctx.signal.aborted) return;
        const field = fieldForToolbar(toolbar);
        if (!field || field.closest('.cm-editor')) return;
        attached.add(toolbar);
        const { host, root } = createShadowHost(doc, { name: EDITOR_HOST_NAME, styles: BUTTON_CSS });
        host.setAttribute('data-display', 'inline');
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'btn toggle';
        const render = (): void => {
          const current = fieldDirection(field);
          const label = LABELS[current ?? 'none'];
          const next = LABELS[nextDirection(current)];
          button.textContent = label.short;
          const text = `اتجاه الكتابة في الحقل: ${label.long}. التبديل إلى: ${next.long}`;
          button.setAttribute('aria-label', text);
          button.title = text;
        };
        // الضغط لا ينقل التركيز من الحقل، فيبقى المؤشر والتحديد حيث هما. المستمع على زر الإضافة نفسه لا على GitHub.
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => {
          if (ctx.signal.aborted || !field.isConnected) return;
          setFieldDirection(field, nextDirection(fieldDirection(field)), write);
          render();
        });
        render();
        root.append(button);
        ctx.mutations.insert(toolbar, host);
      };

      const scan = (root: ParentNode): void => {
        if ((root as Element).matches?.(toolbarSelector)) attach(root as Element);
        for (const toolbar of root.querySelectorAll(toolbarSelector)) attach(toolbar);
      };
      for (const toolbar of ctx.selectors.resolveAll(doc, EDITOR_SELECTOR_KEYS.toolbar)) attach(toolbar);
      const body = doc.body;
      if (body) {
        ctx.observe(body, { childList: true, subtree: true }, (records) => {
          for (const record of records) for (const added of record.addedNodes) if (added.nodeType === 1) scan(added as Element);
        });
      }
    },
  };
}

export const EDITOR_FEATURE: ModuleAFeature = createEditorFeature();
