// بديل واجهة تتطلب حقول كتابة في الدرج المحقون في صفحة GitHub: الدرج لا يعرض أي حقل إدخال (DEC-04 واختبار الدرج في MJ5)، فتُعرض
// هذه الرسالة بدل الواجهة وتدل على موضعها. الواجهة نفسها تعمل في اللوحة الجانبية الأصلية وصفحة الإعدادات.
export function NativeOnlyNotice({ feature, extra }: { feature: string; extra?: string }) {
  return (
    <div class="empty" data-native-only={feature}>
      <p>
        <strong>{feature}</strong>
      </p>
      <p class="small">
        تتطلب هذه الواجهة حقول كتابة، والدرج المحقون في صفحة GitHub لا يعرض حقول إدخال. افتحها من اللوحة الجانبية الأصلية للمتصفح (اختصار <kbd>⌥G</kbd> أو الذي ضبطتَه) أو غيّر «مكان
        اللوحة» من «الإعدادات والخصوصية».
      </p>
      {extra && <p class="small">{extra}</p>}
    </div>
  );
}
