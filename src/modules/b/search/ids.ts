// معرّفات وحدة البحث وأمرها، منفصلة عن module.tsx كي لا يجرّ استيرادُها (من الخلفية وصفحات الإعدادات) القاموسَ الكامل ولا واجهة الصفحة.
export const SEARCH_MODULE_ID = 'b.search';

/** أمر فتح القاموس في المانيفست (commands): اختصاره الافتراضي النهائي (DEC-08 ح-2) Alt+K، وفي macOS Control+Shift+K؛ ويعيد المستخدم ربطه من إعدادات المتصفح. */
export const GLOSSARY_COMMAND = 'open-glossary';
export const GLOSSARY_SHORTCUT = 'Alt+K';
export const GLOSSARY_SHORTCUT_MAC = 'MacCtrl+Shift+K';
/** تبويب القاموس في اللوحة (PanelTabId). */
export const GLOSSARY_TAB = 'glossary';

export const LOCATE_MESSAGE = 'mijhar:locate';
