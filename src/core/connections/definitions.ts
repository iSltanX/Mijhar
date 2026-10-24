// تعريفات سجل الاتصالات (T-11.1): لكل اتصال نوعه ووجهته وما يحتاجه وما يفعّله ومفتاحا تخزين سرّه المستقلان. قائمة مغلقة: لا يُضاف
// اتصال إلا هنا، ولكل سرّ مفتاحان لا يشاركه فيهما غيره (AC-11.1 ‏(٦)، DEC-10).
//  - رمز GitHub للقراءة (T-5.5): متاح، ويُحفظ بمفتاحيه التاريخيين.
//  - مفتاح مزوّد التحليل (MJ21، AC-E9): متاح مع طبقة التحليل. حقله وتحققه (طلب قائمة المودلات المعلن) وصلاحية مضيفه الاختيارية في بطاقته
//    (src/modules/e/provider/KeySection.tsx)، ويُحفظ بمفتاحيه المستقلين (keys.ts). ولا أسعار ولا تكلفة هنا (AD-31).
//  - صلاحية الكتابة في GitHub (MJ22، T-11.8، AD-19): سرّ ثالث منفصل عن رمز القراءة بمفتاحيه، لا يُستعمل إلا في خطوة التنفيذ من «تجهيز تعديل»
//    ولا يحمله أي طلب قراءة ولا يُتحقق منه بطلب قراءة (AC-F7 (١))؛ بطاقته في src/modules/f/execution/WriteTokenSection.tsx.
// لا مفاتيح تخزين هنا: هذا الملف وصف يصل سكربت المحتوى (بوابات الميزات)، ومفاتيح الأسرار في keys.ts للخلفية وصفحة الإعدادات وحدهما.

export const CONNECTION_IDS = ['github-token', 'provider-key', 'github-write'] as const;
export type ConnectionId = (typeof CONNECTION_IDS)[number];

export const isConnectionId = (value: unknown): value is ConnectionId => typeof value === 'string' && (CONNECTION_IDS as readonly string[]).includes(value);

export interface ConnectionDefinition {
  readonly id: ConnectionId;
  readonly title: string;
  /** اسم السرّ في الجمل («الرمز»، «المفتاح»). */
  readonly noun: string;
  /** الخدمة التي تقبله أو ترفضه. */
  readonly service: string;
  /** نوع السرّ ووجهته الوحيدة في سطر. */
  readonly kind: string;
  /** المضيف الوحيد الذي يُرسل إليه السرّ. */
  readonly destination: string;
  /** ما يفعّله الاتصال. */
  readonly enables: string;
  /** ما يحتاجه الربط من المستخدم. */
  readonly needs: string;
  /** ما يتعطل بحذفه أو انتهائه، وحده. */
  readonly disables: string;
  /** 'available': يُربط الآن؛ 'not-yet': لم تُدمج المرحلة التي تستعمله، فلا حقل له ولا تحقق. */
  readonly availability: 'available' | 'not-yet';
  /** سبب «لم يُتح بعد». */
  readonly notYet?: string;
}

export const CONNECTIONS: readonly ConnectionDefinition[] = [
  {
    id: 'github-token',
    title: 'رمز GitHub للقراءة',
    noun: 'الرمز',
    service: 'GitHub',
    kind: 'رمز دقيق الحبيبات للقراءة فقط',
    destination: 'api.github.com',
    enables: 'حالة طلبات الدمج وفحوص Actions في مستودعاتك الخاصة التي تختارها، وحدّ طلبات أعلى من GitHub.',
    needs: 'رمز تنشئه من حسابك في GitHub بصلاحيات قراءة فقط، وصلاحية api.github.com الاختيارية في هذه الصفحة.',
    disables: 'قراءة المستودعات الخاصة وفحوص Actions فيها بالرمز؛ وتبقى قراءة الصفحة وAPI العامة.',
    availability: 'available',
  },
  {
    id: 'provider-key',
    title: 'مفتاح مزوّد التحليل',
    noun: 'المفتاح',
    service: 'المزوّد',
    kind: 'مفتاح API لمزوّد تحليل خارجي',
    destination: 'api.anthropic.com',
    enables: 'تحليل نصّي اختياري داخل الأقسام القائمة، بموافقتك على كل طلب.',
    needs: 'مفتاح API من حسابك لدى المزوّد، وصلاحية api.anthropic.com الاختيارية في هذه الصفحة.',
    disables: 'التحليل وحده؛ وتبقى الأقسام ونسخ حزمة السياق ورمز GitHub كما هي.',
    availability: 'available',
  },
  {
    id: 'github-write',
    title: 'صلاحية الكتابة في GitHub',
    noun: 'رمز الكتابة',
    service: 'GitHub',
    kind: 'رمز دقيق الحبيبات منفصل عن رمز القراءة، للكتابة في مستودع تختاره',
    destination: 'api.github.com',
    enables: 'خطوة التنفيذ وحدها في «تجهيز تعديل»: إنشاء فرع وكتابة ملف نصي واحد وفتح طلب دمج، بعد معاينة الفرق وموافقتك على النطاق.',
    needs: 'رمز دقيق الحبيبات آخر غير رمز القراءة، بصلاحيتي Contents وPull requests «Read and write» للمستودع الذي تعدّله وحده، وصلاحية api.github.com الاختيارية.',
    disables: 'خطوة التنفيذ وحدها؛ وتبقى معاينة الفرق و«نسخ الفرق» وكل قراءة وتحليل كما هي.',
    availability: 'available',
  },
];

export function connectionById(id: ConnectionId): ConnectionDefinition {
  const found = CONNECTIONS.find((c) => c.id === id);
  if (!found) throw new Error(`اتصال غير معرّف: ${id}`);
  return found;
}
