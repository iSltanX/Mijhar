// ميزة «الأرقام المشرقية في النثر العربي» (T-2.6، F-A6): تشغيلها يعني الأرقام المشرقية، وإيقافها (الافتراضي) يبقي أرقام GitHub
// الغربية. تحوّل العقد النصية في حاويات Markdown وحدها عبر المحرك المشترك (T-2.7)، فيعيدها الإيقاف بشروط حارس الملكية؛ وما كتبه
// GitHub بعد التحويل يُترك كما كتبه. عناوين صفحات React وصفوف الالتزامات خارجها: نصها تملكه React (كما في العزل).
import type { ModuleAFeature } from '../scope/feature';
import { DIRECTION_SELECTORS, DIRECTION_SELECTOR_KEYS } from '../direction/selectors';
import { INJECTED_ATTR, ISOLATE_CLASS } from '../isolation/processor';
import { isPureArabicProse, toEasternDigits } from './convert';

export const DIGITS_FEATURE_ID = 'digits';
export const DIGITS_TRANSFORM_ID = 'a.digits.eastern';

/** ما لا يُحوَّل رقم داخله: الكود والمعرّفات والروابط والتاريخ وما حقنته الإضافة والمحررات. */
export const DIGITS_SKIP = `code, pre, kbd, samp, a, relative-time, time, textarea, input, script, style, svg, math, .${ISOLATE_CLASS}, [${INJECTED_ATTR}]:not(.mijhar-bidi-group), mijhar-host, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]`;

export const DIGITS_FEATURE: ModuleAFeature = {
  id: DIGITS_FEATURE_ID,
  title: 'الأرقام المشرقية (٠١٢٣) في النثر العربي',
  defaults: { enabled: false, scope: 'all', repos: [] },
  selectors: DIRECTION_SELECTORS,
  mount(ctx) {
    const doc = ctx.document;
    const containerSelector = ctx.selectors.entry(DIRECTION_SELECTOR_KEYS.container).candidates.join(', ');
    ctx.text.register({ id: DIGITS_TRANSFORM_ID, apply: toEasternDigits });
    const SHOW_TEXT = doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4;

    const eligible = (node: Node): boolean => {
      const parent = node.parentElement;
      return parent !== null && isPureArabicProse((node as Text).data) && parent.closest(containerSelector) !== null && parent.closest(DIGITS_SKIP) === null;
    };
    const collect = (root: Node, out: Set<Node>): void => {
      if (root.nodeType === 3) {
        if (eligible(root)) out.add(root);
        return;
      }
      const walker = doc.createTreeWalker(root, SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (eligible(node)) out.add(node);
    };

    const initial = new Set<Node>();
    for (const container of ctx.selectors.resolveAll(doc, DIRECTION_SELECTOR_KEYS.container)) collect(container, initial);
    ctx.text.apply(DIGITS_TRANSFORM_ID, initial);

    const body = doc.body;
    if (!body) return;
    // ما يضيفه GitHub أو يغيّره: المحرك يتخطى ما حوّله ويترك ما لوّثته كتابة خارجية، فإعادة الطلب آمنة.
    ctx.observe(body, { childList: true, characterData: true, subtree: true }, (records) => {
      const fresh = new Set<Node>();
      for (const record of records) {
        if (record.type === 'characterData') collect(record.target, fresh);
        else for (const added of record.addedNodes) collect(added, fresh);
      }
      if (fresh.size) ctx.text.apply(DIGITS_TRANSFORM_ID, fresh);
    });
  },
};
