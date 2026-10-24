// الكتابة إلى الحافظة من الزر المحقون (T-11.3، HYP-18، BLK-CLIPBOARD-DENIED)، بما ثبت في evidence/T-0.5 على Chrome وEdge وBrave وFirefox بمانيفست المنتج:
//  - writeText تنجح من سكربت المحتوى في معالج النقر نفسه (فعل مستخدم حديث نحو 5 ثوانٍ)، وتفشل بلا نقر أو بعد انقضائه (NotAllowedError)؛ بلا صلاحية clipboardWrite.
//  - البديل العامل: execCommand('copy') من حقل داخل جذر الظل بنقر المستخدم نفسه (لا يمس DOM الصفحة)؛ وهو حقل مؤقت مخفي يُنشأ للنسخ ويُزال، لا صندوق يُعرض.
//  - لا «نجاح» إلا بعد أن يعيد المسار نجاحًا فعليًا: الوعد يُنجز أو execCommand تعيد true. وما عدا ذلك فشل بسببه.
import { deepActiveElement } from '../../../core/ui-host/shadow';

export type CopyOutcome =
  | { readonly ok: true; readonly via: 'clipboard' | 'fallback' }
  | { readonly ok: false; readonly reason: string };

/** يكتب النص إلى الحافظة. `host`: جذر الظل الذي يُنشأ فيه حقل البديل المؤقت. لا يرمي: الفشل نتيجة. */
export type CopyFn = (text: string, host: ParentNode & Node) => Promise<CopyOutcome>;

const DENIED = new Set(['NotAllowedError', 'SecurityError']);

/** سبب فشل writeText بالعربية، من اسم الخطأ كما ثبت في T-0.5. */
export function clipboardReason(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  if (name === 'ClipboardUnavailable') return 'واجهة الحافظة غير متاحة في هذا السياق';
  if (DENIED.has(name)) return 'رفض المتصفح الكتابة إلى الحافظة (لا نقرة حديثة على الزر، أو لا إذن للصفحة، أو النافذة غير مركَّزة)';
  return `تعذّرت الكتابة إلى الحافظة${name ? ` (${name})` : ''}`;
}

/** البديل: حقل مؤقت داخل جذر الظل يُحدَّد ويُنسخ بـexecCommand ثم يُزال، والتركيز يعود إلى حيث كان. */
function copyFromField(text: string, host: ParentNode & Node): boolean {
  const doc = host.ownerDocument ?? (host as Document);
  // الزر داخل جذر الظل: activeElement للمستند هو المضيف، فيُنزَل إلى العنصر النشط فعلًا ليعود إليه التركيز.
  const active = deepActiveElement(doc);
  const previous = active instanceof HTMLElement ? active : null;
  const field = doc.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  field.setAttribute('data-copy-field', '');
  field.style.cssText = 'position:fixed;top:0;inset-inline-start:0;width:1px;height:1px;opacity:0;pointer-events:none;';
  host.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return typeof doc.execCommand === 'function' && doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previous?.focus({ preventScroll: true });
  }
}

export const copyText: CopyFn = async (text, host) => {
  const doc = host.ownerDocument ?? (host as Document);
  const nav = doc.defaultView?.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator);
  let reason: string;
  try {
    if (!nav?.clipboard?.writeText) throw Object.assign(new Error('no clipboard'), { name: 'ClipboardUnavailable' });
    await nav.clipboard.writeText(text);
    return { ok: true, via: 'clipboard' };
  } catch (error) {
    reason = clipboardReason(error);
  }
  // البديل في فعل المستخدم نفسه: فشل الوعد يصل في الدورة نفسها فالنقرة ما زالت حديثة.
  if (copyFromField(text, host)) return { ok: true, via: 'fallback' };
  return { ok: false, reason: `${reason}؛ وفشل البديل (النسخ من حقل مخفي)` };
};
