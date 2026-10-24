// نقرة مستخدم «موثوقة» في jsdom للاختبار وحده (AD-27). jsdom كالمتصفح: كل حدث يُنشئه سكربت أو click() غير موثوق (isTrusted=false)، والخاصية غير قابلة
// للتزوير من الصفحة. وشيفرة الإضافة لا تملك أي منفذ لتجاوز الفحص؛ فهذا المساعد يضع علَم isTrusted على تنفيذ الحدث الداخلي في jsdom نفسه، كما يفعل jsdom
// لأحداث المستخدم، ليحاكي نقرة الفأرة الفعلية. لا يُستورد من src ولا يعمل خارج jsdom، والقبول الحقيقي يُقاس بنقر الفأرة في المتصفحات (evidence/wave-G/g2-trusted-consent/).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
interface EventImpl {
  isTrusted: boolean;
}
interface TargetImpl {
  _dispatch(event: EventImpl): boolean;
}
const { implForWrapper } = require('jsdom/lib/generated/idl/utils.js') as { implForWrapper: (wrapper: object) => unknown };

/** يرسل إلى العنصر نقرة isTrusted=true كما لو جاءت من الفأرة. */
export function trustedClick(el: Element): void {
  const view = el.ownerDocument.defaultView;
  if (!view) throw new Error('trustedClick: عنصر بلا نافذة');
  const event = new view.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
  const impl = implForWrapper(event) as EventImpl | null;
  const target = implForWrapper(el) as TargetImpl | null;
  if (!impl || !target) throw new Error('trustedClick: تعذّر الوصول إلى تنفيذ jsdom (نسخة jsdom مختلفة عن بيئة الاختبار)');
  impl.isTrusted = true;
  // dispatchEvent() يعيد isTrusted إلى false بنص المواصفة؛ فالإرسال بـ_dispatch كما يرسل jsdom أحداث المستخدم (fireAnEvent).
  target._dispatch(impl);
}
