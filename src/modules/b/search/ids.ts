// معرّفات وحدة البحث وأمرها، منفصلة عن module.tsx كي لا يجرّ استيرادُها (من الخلفية وصفحات الإعدادات) القاموسَ الكامل ولا واجهة الصفحة.
export const SEARCH_MODULE_ID = 'b.search';

/** أمر فتح القاموس في المانيفست (commands): اختصار افتراضي مؤقت يعيد المستخدم ربطه من إعدادات المتصفح؛ تحسم قيمته النهائية DEC-08 في T-10.2. */
export const GLOSSARY_COMMAND = 'open-glossary';
export const GLOSSARY_SHORTCUT = 'Alt+K';
/** تبويب القاموس في اللوحة (PanelTabId). */
export const GLOSSARY_TAB = 'glossary';

export const LOCATE_MESSAGE = 'mijhar:locate';
