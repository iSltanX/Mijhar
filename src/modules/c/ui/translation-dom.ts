// بناء ما يُعرض من الترجمة: نص عربي بين عناصر محمية تعود كما كانت (code وkbd وروابط بعناوينها…) معزولة dir="ltr"، لا HTML خامًا من المحرك ولا innerHTML:
// كل ما يظهر نص (createTextNode وtextContent) أو عنصر تنشئه هذه الدالة، فلا يُحقن شيء من مخرج المحرك أو الصفحة. تُستدعى بعد أن اجتاز النص فحوص الرموز الأربعة.
import { TOKEN_SHAPE } from '../masking/mask';
import type { ExpectedTokens } from '../masking';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import type { ProtectedNode } from './blocks';
import { TRANSLATION_CSS, TRANSLATION_HOST_CSS } from './styles';

export const TRANSLATION_HOST_NAME = 'c.ui.translation';
const SAFE_HREF = /^(https?:|mailto:)/i;

function protectedElement(doc: Document, type: string, value: string, node: ProtectedNode | undefined): HTMLElement {
  let el: HTMLElement;
  if (node?.kind === 'link' && node.href && SAFE_HREF.test(node.href)) {
    const a = doc.createElement('a');
    a.setAttribute('href', node.href);
    a.setAttribute('rel', 'noopener noreferrer');
    if (node.target) a.setAttribute('target', node.target);
    el = a;
  } else if (node?.kind === 'code' && node.tag) el = doc.createElement(node.tag);
  else el = doc.createElement(type === 'CODE' || type === 'PATH' || type === 'CMD' ? 'code' : 'span');
  el.className = 'prot';
  el.setAttribute('dir', 'ltr');
  el.setAttribute('data-mijhar-protected', type);
  el.setAttribute('data-type', type);
  el.textContent = value;
  return el;
}

/**
 * يبني محتوى الترجمة من النص المترجم (برموزه ⟦TYPE_N⟧) وخريطة التحقق. كل رمز يستبدله عنصره الأصلي حرفيًا. على المستدعي أن يكون الفاحص قد قبل النص:
 * رمز غير مسجَّل هنا يُرمى (فلا يصل نص مشوَّه إلى العرض).
 */
export function buildTranslationBody(doc: Document, translated: string, expected: ExpectedTokens, nodes: ReadonlyMap<string, ProtectedNode>): HTMLElement {
  const body = doc.createElement('div');
  body.className = 'tr-body';
  const text = (value: string): void => {
    const lines = value.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) body.append(doc.createElement('br'));
      if (line) body.append(doc.createTextNode(line));
    });
  };
  let cursor = 0;
  for (const m of translated.matchAll(TOKEN_SHAPE)) {
    const record = expected.get(m[0]);
    if (!record) throw new Error(`رمز غير مسجَّل في النص المترجم: ${m[0]}`);
    text(translated.slice(cursor, m.index));
    body.append(protectedElement(doc, record.type, record.original, nodes.get(m[0])));
    cursor = m.index + m[0].length;
  }
  text(translated.slice(cursor));
  return body;
}

export interface TranslationHost {
  readonly parts: ShadowParts;
  readonly body: HTMLElement;
}

/** مضيف Shadow DOM لفقرة مترجَمة: الأنماط معزولة، والخط واللون موروثان من الصفحة. */
export function createTranslationHost(doc: Document, body: HTMLElement, label = 'ترجمة إلى العربية'): TranslationHost {
  const parts = createShadowHost(doc, { name: TRANSLATION_HOST_NAME, hostCss: TRANSLATION_HOST_CSS, styles: TRANSLATION_CSS, label });
  parts.root.classList.add('tr-root');
  parts.root.setAttribute('lang', 'ar');
  parts.root.setAttribute('dir', 'rtl');
  const caption = doc.createElement('span');
  caption.className = 'tr-label';
  caption.textContent = label;
  parts.root.append(caption, body);
  parts.host.setAttribute('data-kind', 'translation');
  return { parts, body };
}

/** مضيف تنبيه الفشل الآمن: الأصل باقٍ ويُعلَن السبب. */
export function createWarningHost(doc: Document, warning: string): TranslationHost {
  const body = doc.createElement('p');
  body.className = 'tr-warning';
  body.setAttribute('role', 'note');
  body.textContent = warning;
  const parts = createShadowHost(doc, { name: TRANSLATION_HOST_NAME, hostCss: TRANSLATION_HOST_CSS, styles: TRANSLATION_CSS, label: 'تنبيه الترجمة' });
  parts.root.classList.add('tr-root');
  parts.root.setAttribute('lang', 'ar');
  parts.root.setAttribute('dir', 'rtl');
  parts.root.append(body);
  parts.host.setAttribute('data-kind', 'warning');
  return { parts, body };
}
