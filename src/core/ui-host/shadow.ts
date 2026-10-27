// حاوية Shadow DOM المعزولة التي تُحقن عبرها كل واجهة في صفحة GitHub.
//
// العزل في الاتجاهين:
//  - من الصفحة إلى الواجهة: محددات الصفحة لا تبلغ عناصر الجذر. يبقى ما يصل عبر عنصر المضيف نفسه: الخصائص الموروثة
//    (يصفّرها all: initial)، وقواعد الصفحة على عنصر المضيف (تغلبها :host بـ!important لأن المهم داخل الظل يغلب المهم
//    خارجه)، والمتغيرات (تُعاد كلها على .mj-root)، وdirection وunicode-bidi اللذان لا يشملهما all (يُضبطان على الجذر).
//  - من الواجهة إلى الصفحة: الأنماط داخل الجذر لا تخرج منه، ولا تُحقن ورقة أنماط في المستند.
// الأنماط تُتبنّى ورقةً مبنية (adoptedStyleSheets) فلا تخضع لـCSP الصفحة؛ وإن تعذّر ذلك فعنصر <style> داخل الجذر.
// الجذر مفتوح (open) عمدًا: لا سرّ في أي واجهة محقونة (لا حقل رمز ولا مفتاح، DEC-04)، والفتح يتيح الفحص الآلي.
// خطّا الهوية يُسجَّلان في document.fonts للمستند (FontFace، لا ورقة أنماط) مع أول مضيف، فتسري داخل كل الجذور.
import { registerUiFonts } from '../../shared/ui/fonts';
import { BASE_CSS } from '../../shared/ui/tokens';

export const HOST_TAG = 'mijhar-host';
export const HOST_ATTR = 'data-mijhar-host';
export const STYLES_ATTR = 'data-mijhar-styles';

/** عزل عنصر المضيف داخل سريان الصفحة (واجهات الوحدات). */
export const INLINE_HOST_CSS = `
:host { all: initial !important; display: block !important; }
:host([data-display="inline"]) { display: inline-block !important; vertical-align: middle !important; }
`;

export type StyleMode = 'adopted' | 'style-element';

export interface ShadowParts {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  /** .mj-root: الحاوية التي يُرسم فيها. */
  readonly root: HTMLElement;
  readonly styleMode: StyleMode;
}

export interface ShadowHostOptions {
  /** يُكتب في data-mijhar-host: معرّف الوحدة أو 'drawer'. */
  readonly name: string;
  /** أنماط :host الخاصة بهذا المضيف. الافتراضي INLINE_HOST_CSS. */
  readonly hostCss?: string;
  /** أنماط إضافية للواجهة فوق BASE_CSS. */
  readonly styles?: string;
  readonly label?: string;
  readonly theme?: 'light' | 'dark';
}

/** يتبنّى ورقة مبنية من نافذة المستند نفسه، وإلا يُدرج <style>. يعيد الطريقة المستعملة. */
export function applyStyles(shadow: ShadowRoot, css: string): StyleMode {
  const doc = shadow.ownerDocument;
  const View = doc.defaultView as (Window & typeof globalThis) | null;
  try {
    if (View && 'adoptedStyleSheets' in shadow && typeof View.CSSStyleSheet === 'function') {
      const sheet = new View.CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      if (shadow.adoptedStyleSheets.length === 1) return 'adopted';
    }
  } catch {
    // سياق لا يقبل الورقة المبنية (مثل عالم معزول بأغلفة مختلفة): يُرجع إلى <style>.
  }
  const style = doc.createElement('style');
  style.textContent = css;
  shadow.prepend(style);
  return 'style-element';
}

/** سمة الوضع من صفحة GitHub: data-color-mode = light | dark يُفرض، وauto (أو غيابه) يتبع تفضيل النظام. */
export function githubTheme(doc: Document): 'light' | 'dark' | undefined {
  const mode = doc.documentElement.getAttribute('data-color-mode');
  return mode === 'light' || mode === 'dark' ? mode : undefined;
}

const FOLLOW_ATTR = 'data-theme-follow';
const themeWatchers = new WeakMap<Document, MutationObserver>();

/**
 * يتبع data-color-mode في صفحة GitHub بعد إنشاء المضيفات (GEMINI-018): مراقب واحد للمستند على تلك السمة في html وحدها، يحدّث data-theme في كل
 * مضيف حي أُنشئ بلا سمة مفروضة؛ ويُفك عند أول تغيّر لا يجد مضيفًا. وauto (أو الغياب) يزيل السمة فيتبع الجذر تفضيل النظام بـCSS.
 */
function followTheme(doc: Document): void {
  if (themeWatchers.has(doc)) return;
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer) return;
  const observer = new Observer(() => {
    const roots = [...doc.querySelectorAll(HOST_TAG)].flatMap((host) => {
      const root = [...(host.shadowRoot?.children ?? [])].find((child) => child.classList.contains('mj-root') && child.hasAttribute(FOLLOW_ATTR));
      return root ? [root] : [];
    });
    if (!roots.length) {
      observer.disconnect();
      themeWatchers.delete(doc);
      return;
    }
    const theme = githubTheme(doc);
    for (const root of roots) {
      if (theme) root.setAttribute('data-theme', theme);
      else root.removeAttribute('data-theme');
    }
  });
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] });
  themeWatchers.set(doc, observer);
}

/** ينشئ مضيفًا غير مُدرج في المستند. الإدراج مسؤولية المستدعي (عبر ctx.mutations في الوحدات). */
export function createShadowHost(doc: Document, options: ShadowHostOptions): ShadowParts {
  registerUiFonts(doc);
  const host = doc.createElement(HOST_TAG);
  host.setAttribute(HOST_ATTR, options.name);
  const shadow = host.attachShadow({ mode: 'open' });
  const styleMode = applyStyles(shadow, `${options.hostCss ?? INLINE_HOST_CSS}\n${BASE_CSS}\n${options.styles ?? ''}`);
  host.setAttribute(STYLES_ATTR, styleMode);
  const root = doc.createElement('div');
  root.className = 'mj-root';
  root.setAttribute('dir', 'rtl');
  root.setAttribute('lang', 'ar');
  const theme = options.theme ?? githubTheme(doc);
  if (theme) root.setAttribute('data-theme', theme);
  if (!options.theme) {
    root.setAttribute(FOLLOW_ATTR, '');
    followTheme(doc);
  }
  if (options.label) root.setAttribute('aria-label', options.label);
  shadow.append(root);
  return { host, shadow, root, styleMode };
}

/** العنصر النشط فعلًا، نزولًا عبر جذور الظل المفتوحة. */
export function deepActiveElement(doc: Document): Element | null {
  let active: Element | null = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
