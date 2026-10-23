// بنك عبارات المراجعة (T-7.3 / F-F3 / AC-F3): أربعة أصناف (سؤال، اقتراح مع كتلة suggestion، ملاحظة بسيطة، إشادة) بالعربية والإنجليزية. بيانات ثابتة محلية:
// لا نموذج ولا شبكة ولا ترجمة، فالقسم الثابت من المساعد يعمل كاملًا مع غياب أي محرك. العبارة تُنتقى فتظهر في المعاينة، ولا تُدرج في الحقل إلا من
// المعاينة (أدرج عند المؤشر/ألحق) بالإدراج الآمن نفسه وبتراجعه. «…» و«<…>» مواضع يملؤها المستخدم قبل الإرسال.
//
// كتلة suggestion (```suggestion) تتحول في GitHub إلى اقتراح قابل للتطبيق بنقرة حين تُكتب في تعليق مراجعة على سطر من ملفات طلب دمج؛ وفي غيره تظهر كتلة كود
// عادية. الأربع كلها تنتهي بسطر كود بديل يستبدله المستخدم بالنص الذي يقترحه.
export const PHRASE_CATEGORIES = ['question', 'suggestion', 'note', 'praise'] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export const PHRASE_LANGUAGES = ['ar', 'en'] as const;
export type PhraseLanguage = (typeof PHRASE_LANGUAGES)[number];

export const CATEGORY_LABELS: Readonly<Record<PhraseCategory, string>> = { question: 'سؤال', suggestion: 'اقتراح (كتلة suggestion)', note: 'ملاحظة بسيطة', praise: 'إشادة' };

export const LANGUAGE_LABELS: Readonly<Record<PhraseLanguage, string>> = { ar: 'العربية', en: 'English' };

export interface Phrase {
  readonly id: string;
  readonly category: PhraseCategory;
  readonly label: Readonly<Record<PhraseLanguage, string>>;
  readonly text: Readonly<Record<PhraseLanguage, string>>;
}

const fence = (code: string): string => `\`\`\`suggestion\n${code}\n\`\`\``;

export const PHRASES: readonly Phrase[] = [
  // ---- سؤال ----
  {
    id: 'q-clarify',
    category: 'question',
    label: { ar: 'طلب توضيح', en: 'Ask for clarification' },
    text: {
      ar: 'هل يمكنك توضيح ما تقصده بـ…؟ أريد أن أتأكد أنني فهمت السلوك المطلوب.',
      en: 'Could you clarify what you mean by …? I want to make sure I understand the intended behavior.',
    },
  },
  {
    id: 'q-approach',
    category: 'question',
    label: { ar: 'سبب اختيار الأسلوب', en: 'Why this approach' },
    text: {
      ar: 'ما سبب اختيار هذا الأسلوب بدل …؟ أريد أن أفهم المفاضلة بينهما.',
      en: 'What was the reason for choosing this approach over …? I would like to understand the trade-offs.',
    },
  },
  {
    id: 'q-edge',
    category: 'question',
    label: { ar: 'حالة طرفية', en: 'Edge case' },
    text: {
      ar: 'ماذا يحدث في الحالة الطرفية التي تكون فيها … فارغة أو غير موجودة؟',
      en: 'What happens in the edge case where … is empty or missing?',
    },
  },
  {
    id: 'q-tests',
    category: 'question',
    label: { ar: 'تغطية الاختبارات', en: 'Test coverage' },
    text: {
      ar: 'هل يوجد اختبار يغطي هذه الحالة؟ وإن لم يوجد، فهل يمكنك إضافته؟',
      en: 'Is there a test that covers this case? If not, could you add one?',
    },
  },
  {
    id: 'q-repro',
    category: 'question',
    label: { ar: 'خطوات إعادة الإنتاج', en: 'Steps to reproduce' },
    text: {
      ar: 'هل يمكنك مشاركة خطوات إعادة الإنتاج والإصدار الذي جرّبتَ عليه؟',
      en: 'Could you share the steps to reproduce this and the version you tested on?',
    },
  },
  // ---- اقتراح مع كتلة suggestion ----
  {
    id: 's-change',
    category: 'suggestion',
    label: { ar: 'اقتراح تعديل', en: 'Suggest a change' },
    text: { ar: `أقترح هذا التعديل:\n\n${fence('<الشيفرة المقترحة>')}`, en: `I suggest this change:\n\n${fence('<suggested code>')}` },
  },
  {
    id: 's-rename',
    category: 'suggestion',
    label: { ar: 'اقتراح تسمية', en: 'Suggest a clearer name' },
    text: { ar: `أقترح تسمية أوضح لهذا العنصر:\n\n${fence('<الاسم الجديد>')}`, en: `I suggest a clearer name for this:\n\n${fence('<new name>')}` },
  },
  {
    id: 's-simplify',
    category: 'suggestion',
    label: { ar: 'اقتراح تبسيط', en: 'Suggest a simplification' },
    text: { ar: `يمكن تبسيط هذا السطر هكذا:\n\n${fence('<النسخة المبسطة>')}`, en: `This line can be simplified like this:\n\n${fence('<simplified version>')}` },
  },
  {
    id: 's-typo',
    category: 'suggestion',
    label: { ar: 'تصحيح مطبعي', en: 'Fix a typo' },
    text: { ar: `تصحيح مطبعي:\n\n${fence('<النص الصحيح>')}`, en: `Typo fix:\n\n${fence('<correct text>')}` },
  },
  // ---- ملاحظة بسيطة ----
  {
    id: 'n-nit',
    category: 'note',
    label: { ar: 'ملاحظة غير مانعة (nit)', en: 'Non-blocking nit' },
    text: {
      ar: 'ملاحظة بسيطة (nit) لا تمنع الدمج: لكن … سيكون أنظف.',
      en: 'Nit (not blocking): … would be a bit cleaner.',
    },
  },
  {
    id: 'n-consistency',
    category: 'note',
    label: { ar: 'اتساق مع الملف', en: 'Consistency' },
    text: {
      ar: 'للاتساق مع بقية الملف، يُفضَّل أن يكون … بالأسلوب نفسه.',
      en: 'For consistency with the rest of the file, consider keeping … in the same style.',
    },
  },
  {
    id: 'n-docs',
    category: 'note',
    label: { ar: 'اقتراح توثيق', en: 'Document this' },
    text: {
      ar: 'قد يفيد توثيق هذا السلوك في README أو في تعليق قصير فوق الدالة.',
      en: 'It may help to document this behavior in the README or in a short comment above the function.',
    },
  },
  {
    id: 'n-followup',
    category: 'note',
    label: { ar: 'يُعالج لاحقًا', en: 'Handle in a follow-up' },
    text: {
      ar: 'يمكن معالجة هذا في طلب لاحق، ولا حاجة لتعطيل هذا الطلب بسببه.',
      en: 'This can be handled in a follow-up; no need to block this PR on it.',
    },
  },
  // ---- إشادة ----
  {
    id: 'p-thanks',
    category: 'praise',
    label: { ar: 'شكر على التعديل', en: 'Thanks for the change' },
    text: {
      ar: 'شكرًا على هذا التعديل؛ التغيير واضح ومنظّم.',
      en: 'Thanks for this change — it is clear and well organized.',
    },
  },
  {
    id: 'p-tests',
    category: 'praise',
    label: { ar: 'إشادة بالاختبارات', en: 'Nice tests' },
    text: {
      ar: 'أحسنت بإضافة الاختبارات؛ تجعل الطلب أسهل بكثير في المراجعة.',
      en: 'Nice work adding tests; they make this much easier to review.',
    },
  },
  {
    id: 'p-description',
    category: 'praise',
    label: { ar: 'إشادة بالوصف', en: 'Great description' },
    text: {
      ar: 'شرح ممتاز في الوصف؛ وفّر عليّ وقتًا في المراجعة.',
      en: 'Great explanation in the description — it saved me time reviewing.',
    },
  },
  {
    id: 'p-solution',
    category: 'praise',
    label: { ar: 'حل أنيق', en: 'Elegant solution' },
    text: {
      ar: 'حل أنيق وبسيط. لا ملاحظات أخرى عندي.',
      en: 'An elegant, simple solution. No further comments from me.',
    },
  },
];

export const phrasesOf = (category: PhraseCategory): readonly Phrase[] => PHRASES.filter((phrase) => phrase.category === category);

export const findPhrase = (id: string): Phrase | undefined => PHRASES.find((phrase) => phrase.id === id);

export interface PhraseSelection {
  readonly id: string;
  readonly language: PhraseLanguage;
  readonly text: string;
}

/** الاختيار من معرّف ولغة، أو null إن لم توجد العبارة. */
export function selectPhrase(id: string, language: PhraseLanguage): PhraseSelection | null {
  const phrase = findPhrase(id);
  return phrase ? { id, language, text: phrase.text[language] } : null;
}
