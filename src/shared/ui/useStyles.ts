// أنماط إضافية لمكوّن يُرسم داخل جذر موجود (جذر Shadow DOM للدرج والوحدات، أو مستند صفحة إضافة): لا يعرف المكوّن أيهما.
// داخل Shadow DOM تُتبنّى ورقةً مبنية فلا تخضع لـCSP الصفحة (كما في shadow.ts)، وإلا عنصر <style> في الجذر أو في head المستند.
// تُزال عند فك المكوّن، ولا تتكرر إن رُسم المكوّن مرتين في جذر واحد.
import { useLayoutEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

const MARK = 'data-mijhar-extra-styles';

export function installStyles(anchor: Element, id: string, css: string): () => void {
  const root = anchor.getRootNode();
  const doc = anchor.ownerDocument;
  const View = doc.defaultView as (Window & typeof globalThis) | null;
  const isShadow = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
  if (isShadow) {
    const shadow = root as ShadowRoot;
    if (shadow.querySelector(`style[${MARK}="${id}"]`)) return () => {};
    try {
      if (View && 'adoptedStyleSheets' in shadow && typeof View.CSSStyleSheet === 'function') {
        const sheet = new View.CSSStyleSheet();
        sheet.replaceSync(css);
        const before = shadow.adoptedStyleSheets;
        shadow.adoptedStyleSheets = [...before, sheet];
        if (shadow.adoptedStyleSheets.length === before.length + 1) {
          return () => {
            shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((s) => s !== sheet);
          };
        }
      }
    } catch {
      // سياق لا يقبل الورقة المبنية: يُرجع إلى <style>.
    }
  }
  const container: ParentNode = isShadow ? (root as ShadowRoot) : doc.head;
  if (container.querySelector(`style[${MARK}="${id}"]`)) return () => {};
  const style = doc.createElement('style');
  style.setAttribute(MARK, id);
  style.textContent = css;
  container.append(style);
  return () => style.remove();
}

/** يثبّت css في الجذر الحاوي لـref ما دام المكوّن مركَّبًا. */
export function useStyles(ref: RefObject<Element>, id: string, css: string): void {
  useLayoutEffect(() => {
    const anchor = ref.current;
    if (!anchor) return undefined;
    return installStyles(anchor, id, css);
  }, [ref, id, css]);
}
