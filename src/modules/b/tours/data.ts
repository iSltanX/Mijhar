// الجولات الإرشادية الخمس عشرة (T-3.5، F-B7): محوَّلة من مسارات ghsim-source/src/data/learningPaths.ts (15 مسارًا) إلى جولات على صفحات GitHub الحقيقية.
// الفروق عن المشروع السابق، وكلها لازمة لأن الجولة هنا قرائية آمنة (AC-B7):
//  - لا route تنتقل إليه الجولة ولا نموذج محاكاة: الخطوة تشير إلى مدخل في القاموس (entry) يُحدَّد عنصره في الصفحة المفتوحة بمطابقة بطاقة الشرح نفسها
//    وقاعدة عدم التخمين، وتُبرزه الجولة بحلقة ولا تنقر عليه. والتنقل رابط (path) يضغطه المستخدم بنفسه.
//  - ما كان نصه «جرّب/اضغط» صار توجيهًا للمستخدم: الجولة لا تفعل شيئًا نيابة عنه.
//  - الجولات المتعلقة بإعدادات حساسة (الخصوصية والمصادقة الثنائية ومفاتيح SSH وحماية الفرع والظهور والحذف) خطواتها شرح بصري فقط (visual): لا تُقرأ
//    صفحاتها ولا تُبرز عناصرها، ويُرسم عنصرها المقصود تخطيطًا في شريط الجولة.
// path قالب مسار GitHub: {owner} و{repo} من الصفحة المفتوحة، و{user} من حساب الدخول (meta user-login) أو صاحب الصفحة؛ ما لم يُحل لا يُعرض رابط.

export interface VisualStep {
  /** نص العنصر كما تعرضه واجهة GitHub (الإنجليزية)، يُرسم تخطيطًا. */
  readonly control: string;
  /** أين يوجد في GitHub بالتنقل. */
  readonly where: string;
}

export interface TourStep {
  readonly title: string;
  readonly body: string;
  /** مدخل (أو بدائله) في القاموس يحدد العنصر في الصفحة، أو null لخطوة شرح بلا عنصر. */
  readonly entry: string | readonly string[] | null;
  readonly path?: string;
  /** سبب غياب العنصر الخاص بهذه الخطوة، يُعرض في بطاقة الغياب مع الأسباب العامة. */
  readonly absent?: string;
  /** شرح بصري فقط: لا قراءة لصفحة ولا إبراز. */
  readonly visual?: VisualStep;
}

export interface Tour {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly goal: string;
  /** هل كل خطواتها شرح بصري فقط (إعدادات حساسة). */
  readonly visualOnly: boolean;
  readonly steps: readonly TourStep[];
}

const step = (s: TourStep): TourStep => s;

const RAW: ReadonlyArray<Omit<Tour, 'visualOnly'>> = [
  {
    id: 'profile-intro',
    order: 1,
    title: 'التعرف على الصفحة الشخصية',
    goal: 'فهم كل عنصر في صفحة حسابك: الصورة، النبذة، المتابعون، المستودعات المثبتة، ومخطط المساهمات.',
    steps: [
      step({ entry: 'profile-edit-btn', path: '/{user}', title: 'الملف الشخصي', body: 'هنا تعدّل اسمك ونبذتك وصورتك ومعلوماتك العامة الظاهرة للجميع.', absent: 'زر «Edit profile» يظهر في صفحة حسابك أنت وأنت مسجّل الدخول؛ في صفحة غيرك لا يظهر.' }),
      step({ entry: 'profile-followers', path: '/{user}', title: 'المتابعون والذين تتابعهم', body: 'رقمان اجتماعيان فقط؛ لا علاقة لهما بصلاحيات الوصول لمستودعاتك.' }),
      step({ entry: 'profile-pinned-repos', path: '/{user}', title: 'المستودعات المثبتة', body: 'حتى ستة مستودعات تختارها لإبرازها أول ما يفتح أي زائر ملفك.', absent: 'قسم «Pinned» لا يظهر إن لم يثبّت صاحب الحساب أي مستودع.' }),
      step({ entry: 'profile-contrib-graph', path: '/{user}', title: 'مخطط المساهمات', body: 'كل مربع يمثّل يومًا؛ كلما زادت شدة اللون زاد عدد الأنشطة المسجّلة فيه.' }),
    ],
  },
  {
    id: 'open-repo',
    order: 2,
    title: 'فتح مستودع وفهم محتوياته',
    goal: 'التنقل داخل صفحة مستودع وفهم كل جزء منها: الملفات، README، حول المشروع، اللغات.',
    steps: [
      step({ entry: 'repo-tab-code', path: '/{owner}/{repo}', title: 'تبويب الشفرة', body: 'هذا هو التبويب الافتراضي؛ يعرض شجرة الملفات وآخر التزام على كل منها.' }),
      step({ entry: 'file-tree', path: '/{owner}/{repo}', title: 'شجرة الملفات', body: 'افتح أي مجلد بنفسك لتدخله، أو أي ملف لقراءة محتواه كاملًا.' }),
      step({ entry: 'readme-block', path: '/{owner}/{repo}', title: 'ملف التعريف README', body: 'يُعرض تلقائيًا أسفل شجرة الملفات ليشرح المشروع لأول زائر.', absent: 'لا يظهر README إن لم يكن في جذر المستودع ملف بهذا الاسم.' }),
      step({ entry: 'about-panel', path: '/{owner}/{repo}', title: 'لوحة حول المشروع', body: 'الوصف، الوسوم الوصفية، والترخيص، ورابط الموقع إن وُجد — كلها هنا في الشريط الجانبي.', absent: 'في النوافذ الضيقة يتحول الشريط الجانبي أسفل الصفحة أو يُطوى، فقد لا يظهر القسم.' }),
    ],
  },
  {
    id: 'commit-branch-tag-release',
    order: 3,
    title: 'الفرق بين Commit وBranch وTag وRelease',
    goal: 'تمييز أربعة مفاهيم كثيرًا ما تختلط على المبتدئين.',
    steps: [
      step({ entry: 'file-tree', path: '/{owner}/{repo}', title: 'Commit', body: 'كل تعديل محفوظ هو التزام (Commit) له رسالة ومعرّف فريد؛ انظر عمود آخر التزام بجانب كل ملف.' }),
      step({ entry: 'branch-select', path: '/{owner}/{repo}', title: 'Branch', body: 'الفرع خط عمل مستقل من الالتزامات؛ افتح قائمة الفروع بنفسك لترى الفروع الأخرى غير main.' }),
      step({ entry: 'tag-list', path: '/{owner}/{repo}', title: 'Tag', body: 'الوسم اسم ثابت يشير لالتزام معيّن ولا يتحرك، يظهر عادة كرقم إصدار مثل v1.0.0.', absent: 'رابط «Tags» يظهر في المستودعات التي أنشأت وسومًا أو إصدارات.' }),
      step({ entry: 'release-new-btn', path: '/{owner}/{repo}/releases', title: 'Release', body: 'الإصدار يحوّل وسمًا إلى نقطة تنزيل رسمية بملفات جاهزة ووصف تغييرات.', absent: 'زر إنشاء إصدار جديد يظهر لمن يملك صلاحية الكتابة (Write) على المستودع في صفحة الإصدارات.' }),
    ],
  },
  {
    id: 'create-repo',
    order: 4,
    title: 'إنشاء مستودع جديد',
    goal: 'فهم نموذج إنشاء مستودع جديد وكل خيار فيه قبل أن تنشئ شيئًا. الجولة لا تنشئ شيئًا نيابةً عنك.',
    steps: [
      step({ entry: 'repos-new-btn', path: '/{user}?tab=repositories', title: 'زر مستودع جديد', body: 'يفتح نموذج الإنشاء؛ اقرأ كل حقل فيه قبل الضغط على زر الإنشاء.' }),
      step({
        entry: null,
        path: '/new',
        title: 'عام أم خاص؟',
        body: 'قرار مهم يمكن تغييره لاحقًا: من يرى المستودع بعد إنشائه.',
        visual: { control: 'Public / Private', where: 'صفحة إنشاء مستودع جديد (New repository) ← قسم الظهور (Visibility)' },
      }),
    ],
  },
  {
    id: 'upload-file',
    order: 5,
    title: 'رفع ملف',
    goal: 'فهم طريقتي إضافة ملف: الإنشاء المباشر، أو الرفع من جهازك.',
    steps: [
      step({ entry: 'add-file-menu', path: '/{owner}/{repo}', title: 'قائمة إضافة ملف', body: 'زران: «Create new file» للكتابة المباشرة، و«Upload files» لاختيار ملف من جهازك.', absent: 'زر «Add file» يظهر لمن يملك صلاحية الكتابة؛ ومن ليس له صلاحية يقترح التعديل عبر نسخة (Fork).' }),
    ],
  },
  {
    id: 'understand-pr',
    order: 6,
    title: 'فهم Pull Request',
    goal: 'متابعة رحلة تعديل من فرع منفصل حتى دمجه في الفرع الرئيسي.',
    steps: [
      step({ entry: 'repo-tab-pulls', path: '/{owner}/{repo}/pulls', title: 'تبويب طلبات السحب', body: 'كل التعديلات المقترحة التي تنتظر مراجعة قبل دمجها.', absent: 'تبويب «Pull requests» يختفي إن عُطّلت طلبات السحب في المستودع.' }),
      step({
        entry: ['merge_commit', 'squash_merge', 'rebase_merge'],
        title: 'صندوق الدمج',
        body: 'في أسفل محادثة كل طلب سحب أزرار الدمج. الجولة تبرزها فقط ولا تضغطها: الدمج يغيّر الفرع الرئيسي ولا يُتراجع عنه بسهولة.',
        absent: 'افتح طلب سحب مفتوحًا لترى صندوق الدمج. وأزراره تظهر لمن يملك صلاحية الكتابة، وبعد اجتياز الفحوص والمراجعات المطلوبة.',
      }),
    ],
  },
  {
    id: 'understand-actions',
    order: 7,
    title: 'فهم GitHub Actions',
    goal: 'معرفة العلاقة بين Workflow وRun وJob وStep.',
    steps: [
      step({ entry: 'repo-tab-actions', path: '/{owner}/{repo}/actions', title: 'تبويب الإجراءات', body: 'سجلّ كل مرة نُفِّذ فيها سير عمل آلي على هذا المستودع.', absent: 'تبويب «Actions» يختفي إن عُطّلت الإجراءات في المستودع.' }),
      step({ entry: 'actions-run-row', path: '/{owner}/{repo}/actions', title: 'تشغيل واحد', body: 'افتح أي عملية تشغيل (Run) لرؤية مهامها (Jobs) وخطواتها (Steps) بالتفصيل.', absent: 'لا تظهر قائمة التشغيلات إن لم يُشغَّل أي سير عمل بعد.' }),
    ],
  },
  {
    id: 'publish-release',
    order: 8,
    title: 'نشر إصدار',
    goal: 'فهم نموذج إنشاء إصدار جديد وخياراته قبل أن تنشر شيئًا. الجولة لا تنشر نيابةً عنك.',
    steps: [
      step({ entry: 'release-new-btn', path: '/{owner}/{repo}/releases', title: 'إنشاء إصدار جديد', body: 'اختر وسمًا وفرعًا، اكتب وصف التغييرات، وقرّر إن كان مسودة أو تجريبيًا أو نهائيًا. الجولة تبرز الزر ولا تضغطه.', absent: 'زر إنشاء إصدار جديد يظهر لمن يملك صلاحية الكتابة (Write) على المستودع في صفحة الإصدارات.' }),
    ],
  },
  {
    id: 'privacy-settings',
    order: 9,
    title: 'ضبط خصوصية الحساب',
    goal: 'التحكم في ما يظهر للعامة من نشاطك.',
    steps: [
      step({
        entry: 'settings-privacy-toggle',
        path: '/settings/profile',
        title: 'إعدادات الملف الشخصي',
        body: 'من هنا تتحكم في إظهار أو إخفاء النشاط والوقت المحلي والمساهمات الخاصة.',
        visual: { control: 'Include private contributions on my profile', where: 'إعدادات الحساب (Settings) ← Public profile' },
      }),
    ],
  },
  {
    id: 'secure-2fa',
    order: 10,
    title: 'تأمين الحساب بالمصادقة الثنائية',
    goal: 'فهم لماذا تُعد 2FA خط الدفاع الثاني بعد كلمة المرور.',
    steps: [
      step({
        entry: 'settings-2fa-enable',
        path: '/settings/security',
        title: 'تفعيل المصادقة الثنائية',
        body: 'يضيف رمزًا مؤقتًا يُطلب بجانب كلمة المرور عند تسجيل الدخول من جهاز جديد.',
        visual: { control: 'Enable two-factor authentication', where: 'إعدادات الحساب (Settings) ← Password and authentication' },
      }),
    ],
  },
  {
    id: 'add-ssh',
    order: 11,
    title: 'إضافة مفتاح SSH',
    goal: 'فهم الفرق بين الاستنساخ عبر SSH وعبر HTTPS، ومتى تحتاج مفتاحًا.',
    steps: [
      step({
        entry: 'settings-ssh-add',
        path: '/settings/keys',
        title: 'مفاتيح SSH وGPG',
        body: 'تُضاف هنا نسخة من مفتاحك العام فقط؛ مفتاحك الخاص يبقى دائمًا على جهازك.',
        visual: { control: 'New SSH key', where: 'إعدادات الحساب (Settings) ← SSH and GPG keys' },
      }),
    ],
  },
  {
    id: 'protect-branch',
    order: 12,
    title: 'حماية الفرع الرئيسي',
    goal: 'منع التعديل المباشر على main واشتراط المراجعة قبل الدمج.',
    steps: [
      step({
        entry: 'settings-branch-protect-add',
        path: '/{owner}/{repo}/settings/branches',
        title: 'إضافة قاعدة حماية',
        body: 'اشترط طلب سحب، وموافقات، ونجاح الاختبارات، قبل قبول أي دمج على الفرع الرئيسي.',
        visual: { control: 'Add branch protection rule', where: 'إعدادات المستودع (Settings) ← Branches' },
      }),
    ],
  },
  {
    id: 'public-vs-private',
    order: 13,
    title: 'الفرق بين المستودع العام والخاص',
    goal: 'اتخاذ قرار واعٍ بشأن ظهور مستودعك.',
    steps: [
      step({
        entry: 'settings-visibility',
        path: '/{owner}/{repo}/settings',
        title: 'تغيير مستوى الظهور',
        body: 'العام يراه الجميع ويمكن نسخه؛ الخاص لا يراه إلا من تدعوهم صراحة.',
        visual: { control: 'Change visibility', where: 'إعدادات المستودع (Settings) ← General ← Danger Zone' },
      }),
    ],
  },
  {
    id: 'delete-repo-safely',
    order: 14,
    title: 'حذف مستودع بصورة آمنة',
    goal: 'فهم أن الحذف نهائي، ولماذا تطلب GitHub كتابة اسم المستودع للتأكيد.',
    steps: [
      step({
        entry: 'settings-danger-delete',
        path: '/{owner}/{repo}/settings',
        title: 'المنطقة الخطرة',
        body: 'كل إجراء هنا حساس أو لا رجعة فيه؛ لذلك يُطلب كتابة اسم المستودع كاملًا قبل التنفيذ.',
        visual: { control: 'Delete this repository', where: 'إعدادات المستودع (Settings) ← General ← Danger Zone' },
      }),
    ],
  },
  {
    id: 'top-navigation',
    order: 15,
    title: 'فهم جميع عناصر القائمة العلوية',
    goal: 'معرفة وظيفة كل أيقونة وزر في الشريط العلوي الظاهر في كل صفحة.',
    steps: [
      step({ entry: 'nav-search', title: 'البحث الشامل', body: 'يبحث في المستودعات والمشكلات وطلبات السحب والمستخدمين والشفرة من مكان واحد.' }),
      step({ entry: 'nav-create', title: 'زر الإنشاء', body: 'قائمة سريعة لإنشاء مستودع جديد أو استيراده أو بدء مشكلة أو طلب سحب.' }),
      step({ entry: 'nav-notifications', title: 'الإشعارات', body: 'كل تنبيهاتك في مكان واحد، مصنّفة بحسب السبب.' }),
      step({ entry: 'nav-profile-menu', title: 'قائمة الحساب', body: 'الوصول السريع لملفك الشخصي، مستودعاتك، والإعدادات، وتسجيل الخروج.' }),
    ],
  },
];

export const TOURS: readonly Tour[] = RAW.map((tour) => ({ ...tour, visualOnly: tour.steps.every((s) => s.visual !== undefined) }));

export const TOUR_COUNT = 15;

export function getTour(id: string): Tour | undefined {
  return TOURS.find((tour) => tour.id === id);
}
