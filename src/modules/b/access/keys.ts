// سياسة لوحة المفاتيح لشارات الشرح وبطاقته (F-B5 / AC-B5).
//  - الفتح بـEnter وSpace يتولاه الزر الأصلي <button type="button"> نفسه (المتصفح يحوّل الضغطة إلى click)؛ فلا مستمع خاص بهما هنا
//    ولا بديل <div role="button"> يحتاج محاكاتهما. يقيس audit.ts أن كل شارة زر أصلي، ويقيس e2e الضغط الفعلي في المتصفحات.
//  - الإغلاق بـEscape يعالجه الغلاف (overlay.tsx) ويعيد التركيز إلى الشارة التي فتحت البطاقة.
//  - ما يجري داخل الطبقة لا يبلغ اختصارات GitHub أحادية الحرف (g i وs وt و? …): ضغطة حرف على شارة لا تنقل الصفحة. وما فيه
//    Alt أو Ctrl أو Meta يمرّ، فيعمل Alt+H (تبديل وضع الشرح) والاختصارات التي يملكها المتصفح.

/** المفتاحان اللذان يفتحان الشارة؛ يفعّلهما الزر الأصلي. */
export const ACTIVATION_KEYS: readonly string[] = ['Enter', ' '];

type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>;

/** هل تُحجب هذه الضغطة عن مستمعات الصفحة. Tab لا تُحجب: التنقل بالتركيز لا يمر بمستمعات الصفحة أصلًا، ولا حاجة لمسّه. */
export function shouldContainKey(event: KeyLike): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.key !== 'Tab';
}

export const isEscape = (event: Pick<KeyboardEvent, 'key'>): boolean => event.key === 'Escape' || event.key === 'Esc';
