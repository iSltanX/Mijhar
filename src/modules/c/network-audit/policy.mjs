// سياسة الاتصالات المسموحة لمسار الترجمة (T-4.5، F-C6، DEC-03 ج-2). ملف .mjs ليقرأه scripts/network-audit.mjs مباشرة في Node وتختبره vitest (كما schema.mjs في القاموس).
// القاعدة (AC-C6): في مسار الترجمة لا يتصل شيء إلا بمضيف النموذج المعلن بعد موافقة صريحة، ولا يخرج نص الصفحة ولا محتوى مستودع إلى أي مضيف، ولا يتضمن المانيفست
// مضيف ترجمة سحابيًا. وتحت ج-2 لا مضيف نموذج للإضافة أصلًا: المتصفح ينزّل حزمة لغته بنفسه خارج سيطرتها (لا يظهر في سجل الصفحة ولا الإضافة ولا يُدّعى فحصه).

/** مضيفات النموذج المعلنة للإضافة (تُسمح بعد موافقة). ج-2: لا شيء؛ ج-1/ج-3 كانت ستضيف مضيف الأوزان. */
export const ALLOWED_MODEL_HOSTS = /** @type {readonly string[]} */ ([]);

/**
 * مضيفات خدمات الترجمة السحابية أو المدفوعة وواجهات النماذج المستضافة، المعروفة: وجود أحدها في مانيفست أو شيفرة مسار الترجمة أو طلب شبكة خلال تشغيل ترجمة مخالفة.
 * القائمة للكشف لا للحصر؛ والحماية الأصلية أن لا مضيف مسموحًا إلا ما في ALLOWED_MODEL_HOSTS (أي طلب خارجه مخالفة، سواء عُرف مضيفه أم لا).
 */
export const CLOUD_TRANSLATION_HOSTS = /** @type {readonly string[]} */ ([
  'translate.googleapis.com',
  'translation.googleapis.com',
  'translate.google.com',
  'translate-pa.googleapis.com',
  'clients5.google.com',
  'api.deepl.com',
  'api-free.deepl.com',
  'api.cognitive.microsofttranslator.com',
  'api.cognitive.microsoft.com',
  'translate.yandex.net',
  'translate.api.cloud.yandex.net',
  'fanyi-api.baidu.com',
  'openapi.youdao.com',
  'libretranslate.com',
  'libretranslate.de',
  'translate.argosopentech.com',
  'api.mymemory.translated.net',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.cohere.com',
  'api.groq.com',
  'openrouter.ai',
  'api-inference.huggingface.co',
  'huggingface.co',
]);

/** مضيفات الإضافة نفسها المقبولة في المانيفست اليوم (AD-08)؛ ما سواها يُعرض في التقرير للمراجعة ولا يوقف الاختبار. */
export const DECLARED_MANIFEST_HOSTS = /** @type {readonly string[]} */ (['github.com', 'api.github.com']);

/**
 * MJ21 (T-11.6، DEC-09، AD-19): مضيف مزوّد التحليل. هو في CLOUD_TRANSLATION_HOSTS ويبقى مخالفة في مسار الترجمة (شيفرته وأي طلب أثناء الترجمة)؛ ويُقبل
 * خارجه: صلاحية مضيف اختيارية (optional_host_permissions) وحدها في المانيفست، وفي شيفرة مسار التحليل وحزمه. ويدقق مسارَ التحليل نفسه TEST-PRIV-04.
 */
export const ANALYSIS_PROVIDER_HOSTS = /** @type {readonly string[]} */ (['api.anthropic.com']);

/** مجلدات الشيفرة التي هي «مسار الترجمة»: لا يجوز فيها استدعاء شبكة ولا مضيف خارجي. */
export const TRANSLATION_PATH_DIRS = /** @type {readonly string[]} */ ([
  'src/modules/c/engines/',
  'src/modules/c/masking/',
  'src/modules/c/model-manager/',
  'src/modules/c/ui/',
]);

/** أنماط واجهات الشبكة في الشيفرة. */
export const NETWORK_API_PATTERNS = /** @type {readonly { name: string, pattern: RegExp }[]} */ ([
  { name: 'fetch', pattern: /(?<![\w.$])fetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'sendBeacon', pattern: /\bsendBeacon\b/ },
  { name: 'WebSocket', pattern: /\bnew\s+WebSocket\b/ },
  { name: 'EventSource', pattern: /\bnew\s+EventSource\b/ },
  { name: 'importScripts', pattern: /\bimportScripts\s*\(/ },
  { name: 'WebTransport', pattern: /\bnew\s+WebTransport\b/ },
  { name: 'RTCPeerConnection', pattern: /\bnew\s+RTCPeerConnection\b/ },
]);

/**
 * ما يدل على محرك آخر غير ج-2 (ONNX وWebAssembly وtrial.ml): غيابه في الحزمة من شروط DEC-03. WebAssembly تُكشف باستعمال الواجهة أو بملف .wasm لا بالكلمة
 * وحدها: هي في قائمة المصطلحات المحمية من الترجمة (DO_NOT_TRANSLATE_TERMS) نصًّا.
 */
export const OTHER_ENGINE_PATTERNS = /** @type {readonly { name: string, pattern: RegExp }[]} */ ([
  { name: 'onnxruntime', pattern: /onnxruntime/i },
  { name: 'WebAssembly (واجهة)', pattern: /\bWebAssembly\s*\.\s*(?:instantiate|instantiateStreaming|compile|compileStreaming|validate|Module|Instance|Memory|Table)\b/ },
  { name: 'ملف .wasm', pattern: /\.wasm\b/ },
  { name: 'browser.trial.ml', pattern: /\btrial\s*\.\s*ml\b|\btrialML\b/ },
]);

/** صلاحيات المضيف التي تشمل كل المواقع: ممنوعة (تكسر مبدأ أقل صلاحية). */
export const BROAD_HOST_PATTERNS = /** @type {readonly string[]} */ (['<all_urls>', '*://*/*', 'https://*/*', 'http://*/*', 'https://*/', 'http://*/']);

/** هل المضيف host مطابق لمضيف في القائمة (هو أو نطاق فرعي منه). */
export function hostMatches(host, list) {
  const h = String(host).toLowerCase();
  return list.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

/** كـhostMatches، وصلاحية النطاق كله («https://*.deepl.com/*» ← deepl.com) تغطي مضيفات القائمة تحته أيضًا. */
export function hostCovers(host, list) {
  const h = String(host).toLowerCase();
  return hostMatches(h, list) || list.some((entry) => entry.endsWith(`.${h}`));
}
