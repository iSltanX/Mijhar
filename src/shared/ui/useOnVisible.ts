// يستدعي read حين تعود الصفحة إلى الواجهة (تبويبها يُختار أو نافذتها تُركَّز)، لا عند الفتح: حالة تتغير من صفحة إعدادات أخرى (رمز يُحفظ أو يُمسح)
// ولا حدث تغيّر لها في هذه الصفحة، فتُقرأ من جديد حين يعود إليها المستخدم بدل أن تبقى قديمة حتى إعادة التحميل (PI-1، كما تفعل بطاقة المزوّد F-05).
import { useEffect, useRef } from 'preact/hooks';

export function useOnVisible(read: () => void): void {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}
