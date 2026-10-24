// نصوص الترحيب عند أول فتح للوحة (AD-29) من إطارات القسم J في ملف التصميم المعتمد (P-55 وP-56a). كل ميزة مذكورة هنا منفَّذة ومدمجة؛
// والاتصال الاختياري الذي لم يُنفَّذ بعد يُعلَن «لم يُتح بعد» ولا يُعرض كأنه يعمل. تقلب MJ21 حالة مفتاح المزوّد وتضيف رابط شرحه حين
// تُدمج طبقة التحليل (AC-E9 البند ٨).
import type { OptionsTarget } from '../../core/ui-host/commands';
import type { IconName } from '../ui/icons';

export interface WelcomeFeature {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
}

/** ما يعمل فور التثبيت بلا أي إعداد ولا اتصال. */
export const WELCOME_FEATURES: readonly WelcomeFeature[] = [
  { icon: 'dir-rtl', title: 'قراءة عربية مريحة', text: 'اتجاه صحيح للنص العربي والمختلط وعزل للكود، وترجمة عند الطلب حيث يتيحها متصفحك.' },
  { icon: 'explain', title: 'شرح الواجهة في مكانها', text: 'معنى الأزرار والمصطلحات بالعربية بجانبها، وجولات إرشادية قصيرة.' },
  { icon: 'list-checks', title: 'حالة العمل بأدلتها', text: 'ما يمنع دمج الطلب وأين فشل الفحص، مقروءًا من الصفحة نفسها.' },
  { icon: 'note', title: 'سياقك وملاحظاتك', text: 'حزمة سياق للمهمة تراجعها وتنسخها لأي نموذج، وملاحظات خاصة تبقى في متصفحك.' },
];

export const WELCOME_PRIVACY = 'يعالج ما تعرضه الصفحة داخل متصفحك، ولا يتصل بأي خدمة إلا حين تطلب ذلك بنفسك.';

export interface OptionalConnection {
  readonly id: 'github-token' | 'provider-key';
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  /** 'available': يُربط الآن من الإعدادات؛ 'not-yet': لم تُنفَّذ مرحلته بعد. */
  readonly status: 'available' | 'not-yet';
  readonly facts: ReadonlyArray<{ readonly icon: IconName; readonly text: string }>;
  /** صفحة الشرح في الإعدادات. */
  readonly guide?: { readonly target: OptionsTarget; readonly label: string };
  /** موضع الربط في الإعدادات. */
  readonly setup?: OptionsTarget;
}

export const OPTIONAL_CONNECTIONS: readonly OptionalConnection[] = [
  {
    id: 'github-token',
    icon: 'key',
    title: 'رمز GitHub للقراءة',
    text: 'يقرأ حالة طلبات الدمج وفحوص Actions في مستودعاتك الخاصة التي تختارها، ويرفع حد طلبات GitHub من 60 إلى 5000 في الساعة.',
    status: 'available',
    facts: [
      { icon: 'lock', text: 'قراءة فقط، ويُرسل إلى GitHub وحده' },
      { icon: 'check', text: 'تنشئه من حسابك في GitHub' },
    ],
    guide: { target: 'guide/github-token', label: 'كيف أحصل على الرمز؟' },
    setup: 'token',
  },
  {
    id: 'provider-key',
    icon: 'message',
    title: 'مفتاح مزوّد التحليل',
    text: 'تحليل نصّي اختياري لفشل الفحص وتغييرات طلب الدمج، تضيفه طبقة التحليل في تحديث لاحق. لا حقل لمفتاح الآن ولا أي إرسال إلى مزوّد.',
    status: 'not-yet',
    facts: [],
  },
];

/** الفرق بين الاتصالين بحسب ما أُتيح منهما. */
export const connectionsDifference = (connections: readonly OptionalConnection[] = OPTIONAL_CONNECTIONS): string =>
  connections.every((c) => c.status === 'available')
    ? 'الرمز يتيح لمِجهَر قراءة بيانات GitHub نيابةً عنك، والمفتاح يتيح تحليلًا نصيًّا عند مزوّد خارجي بمفتاح من حسابك لديه. لا يغني أحدهما عن الآخر.'
    : 'الرمز يتيح لمِجهَر قراءة بيانات GitHub نيابةً عنك، ولا علاقة له بأي تحليل أو مزوّد.';
