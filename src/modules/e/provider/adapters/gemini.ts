// محوّل Google Gemini (DEC-09 ز-4، MJ25، T-11.12): واجهة Gemini عبر generativelanguage.googleapis.com وحده، من خلفية الإضافة بلا وسيط (قِيس في
// evidence/T-11.12/direct-access.json: الطلب يصل ويُقرأ رده في المتصفحات الأربعة). وصفه (الاسم والمضيف وصيغة المفتاح وطلب التحقق المعلن) في
// descriptors/gemini.ts؛ وهنا وحده ما لا يصل غير الخلفية (I-2):
//  - المفتاح في ترويسة x-goog-api-key لا في العنوان (فلا يظهر في سجل ولا عنوان)، وcontent-type للجسم.
//  - المودلات من GET /v1beta/models وقت التشغيل (وهي طلب التحقق المعلن: لا يحمل محتوى): المرشّح ما أعلن في supportedGenerationMethods أنه يدعم طريقة
//    التوليد المستعملة، مع حدّي المدخلات والمخرجات المعلنين؛ وما لم يعلنها لا يُعرض ولا يُستنتج من اسمه. والإعلان ترشيح لا إثبات (DEC-13 ن-4): لا يصير المرشّح
//    خيارًا للتحليل إلا بالفحص الصريح (probe) الذي يبدؤه المستخدم، بنص ثابت «ping» وحده لا يحمل شيئًا من الصفحات.
//  - التحليل POST /v1beta/models/<مودل>:generateContent بلا بث.
//  - الرفض بحسب ما قِيس: مفتاح غير صالح يردّه الخادم 400 INVALID_ARGUMENT بسبب API_KEY_INVALID (لا 401)، فيُصنَّف مفتاحًا مرفوضًا.
//  - حجب الأمان الذي يعلنه الرد (promptFeedback.blockReason أو finishReason أمني) فشل بسببه لا تحليل، ولا يُعاد الطلب.
//  - لا إعادة تلقائية ولا تحويل إلى مزوّد آخر؛ وما يعلنه المزوّد من موعد إعادة (retry-after أو RetryInfo) يُعاد كما هو. ولا سعر هنا (AD-31).
import { GEMINI } from '../descriptors/gemini';
import { ProviderPermissionError, redactKey } from '../gate';
import type { AnalysisReply, AnalysisRequest, ModelsList, ProviderAdapter, ProviderCall, ProviderFailure, ProviderModel, ProviderResult } from '../types';

const HOST = GEMINI.host;
/** طريقة التوليد التي يستعملها التحليل. */
const METHOD = 'generateContent';
const MODELS_PATH = '/v1beta/models?pageSize=1000';
const MODEL_PREFIX = 'models/';
/** نص الفحص الصريح: ثابت لا يحمل شيئًا من الصفحات. */
const PROBE_TEXT = 'ping';
const PROBE_MAX_OUTPUT = 64;

const headers = (key: string, json: boolean): Record<string, string> => ({
  'x-goog-api-key': key,
  ...(json ? { 'content-type': 'application/json' } : {}),
});

interface RawDetail {
  '@type'?: unknown;
  reason?: unknown;
  retryDelay?: unknown;
}
interface RawError {
  error?: { code?: unknown; status?: unknown; message?: unknown; details?: unknown };
}

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** تفاصيل الخطأ المنظّمة: أسباب ErrorInfo وتأخير RetryInfo (مدة بصيغة «27s»). */
function detailsOf(error: RawError['error']): { reasons: string[]; retryDelayMs: number | null } {
  const list = Array.isArray(error?.details) ? (error.details as RawDetail[]) : [];
  const reasons = list.map((d) => str(d?.reason)).filter((r): r is string => r !== null);
  let retryDelayMs: number | null = null;
  for (const d of list) {
    const match = /^(\d+(?:\.\d+)?)s$/.exec(str(d?.retryDelay) ?? '');
    if (match) retryDelayMs = Math.round(Number(match[1]) * 1000);
  }
  return { reasons, retryDelayMs };
}

/** موعد إعادة المحاولة كما يعلنه المزوّد: retry-after بالثواني، وإلا مدة RetryInfo، وإلا null. */
function retryAtOf(response: Response, delayMs: number | null, now: number): number | null {
  const seconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  return delayMs !== null && delayMs > 0 ? now + delayMs : null;
}

const TOO_LARGE = /token count|exceeds the maximum|too (?:large|long)|input is too/i;

function failureOf(status: number, error: RawError['error'], reasons: readonly string[]): ProviderFailure {
  const code = str(error?.status);
  if (reasons.some((r) => r.startsWith('API_KEY_')) || status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 413) return 'too-large';
  if (status === 429) return 'rate-limit';
  if (status === 400 && code === 'FAILED_PRECONDITION') return 'forbidden';
  if (status === 400 && TOO_LARGE.test(str(error?.message) ?? '')) return 'too-large';
  if (status === 400 || status === 422) return 'invalid';
  if (status >= 500) return 'overloaded';
  return 'http';
}

/** نص الفشل بالعربية بحسب تصنيفه، ويلحق به رمز الاستجابة وسببها وقول المزوّد نفسه (مقصوصًا) ليُعرف سبب الرفض. */
const LABELS: Readonly<Partial<Record<ProviderFailure, string>>> = {
  unauthorized: 'رفضت Google المفتاح لأنه غير صالح أو منتهٍ',
  forbidden: 'رفضت Google الطلب لنقص صلاحية المفتاح أو مشروعه',
  'not-found': 'المودل المختار غير متاح لهذا المفتاح',
  'too-large': 'المحتوى أكبر مما يقبله المودل',
  invalid: 'رفضت Google الطلب لأنه غير صالح',
  'rate-limit': 'تجاوز المفتاح حد الطلبات الذي تعلنه Google',
  overloaded: 'خدمة Google مشغولة أو متعطلة',
  http: 'ردّت Google بما لا يُفهم',
};

async function send<T>(call: ProviderCall, path: string, init: RequestInit, parse: (body: unknown, status: number) => ProviderResult<T> | null): Promise<ProviderResult<T>> {
  const fail = (failure: ProviderFailure, message: string, status: number | null = null, retryAt: number | null = null): ProviderResult<T> => ({ ok: false, failure, status, message: redactKey(message, call.key), retryAt });
  let response: Response;
  try {
    response = await call.fetch(path, { ...init, ...(call.signal ? { signal: call.signal } : {}) });
  } catch (error) {
    if (error instanceof ProviderPermissionError) return fail('permission', error.message);
    if (error instanceof Error && error.name === 'AbortError') return fail('aborted', 'أُوقف الطلب قبل اكتماله');
    return fail('network', error instanceof Error ? `تعذّر الاتصال بـ${HOST}: ${error.message}` : String(error));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    // الخطأ كائن واحد، وقد يصل داخل مصفوفة.
    const raw = (Array.isArray(body) ? body[0] : body) as RawError | null;
    const { reasons, retryDelayMs } = detailsOf(raw?.error);
    const failure = failureOf(response.status, raw?.error, reasons);
    // التنقيح قبل القص: قصٌّ يقطع المفتاح يُبقي جزءًا منه لا يطابقه التنقيح بعدها (F-01).
    const message = str(raw?.error?.message);
    const said = message ? redactKey(message, call.key).slice(0, 240) : null;
    const tag = [`HTTP ${response.status}`, ...(reasons.length ? [reasons[0]] : [])].join('، ');
    const label = LABELS[failure] ?? 'ردّت Google برفض';
    return fail(failure, `${label} (${tag})${said ? `: ${said}` : ''}`, response.status, failure === 'rate-limit' || failure === 'overloaded' ? retryAtOf(response, retryDelayMs, call.now()) : null);
  }
  return parse(body, response.status) ?? fail('http', 'استجابة غير متوقعة من المزوّد', response.status);
}

function parseModel(raw: unknown): ProviderModel | null {
  const r = raw as Record<string, unknown> | null;
  const name = str(r?.name);
  if (!name) return null;
  const methods = Array.isArray(r?.supportedGenerationMethods) ? r.supportedGenerationMethods.filter((m): m is string => typeof m === 'string') : [];
  // DEC-13 ن-4: لا يُرشَّح إلا ما أعلنت الواجهة أنه يدعم طريقة التوليد المستعملة، وتوافقه «غير محسوم» حتى يثبت بالفحص الصريح.
  if (!methods.includes(METHOD)) return null;
  const id = name.startsWith(MODEL_PREFIX) ? name.slice(MODEL_PREFIX.length) : name;
  return {
    id,
    displayName: str(r?.displayName) ?? id,
    createdAt: null,
    line: null,
    maxTokens: num(r?.outputTokenLimit),
    maxInputTokens: num(r?.inputTokenLimit),
    lifecycle: null,
    compatibility: 'unknown',
  };
}

/** أسباب التوقف الأمنية: الرد المتأثر بها يُعرض سببًا لا تحليلًا حتى لو حمل نصًّا مقطوعًا. */
const SAFETY_REASONS: Readonly<Record<string, string>> = {
  SAFETY: 'قواعد الأمان',
  BLOCKLIST: 'قائمة مصطلحات محجوبة',
  PROHIBITED_CONTENT: 'محتوى محظور',
  SPII: 'معلومات شخصية حساسة محتملة',
  RECITATION: 'اقتباس محمي',
  IMAGE_SAFETY: 'قواعد الأمان',
  IMAGE_PROHIBITED_CONTENT: 'محتوى محظور',
  IMAGE_RECITATION: 'اقتباس محمي',
};

interface RawCandidate {
  content?: { parts?: unknown };
  finishReason?: unknown;
}
interface RawReply {
  candidates?: unknown;
  promptFeedback?: { blockReason?: unknown };
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
  modelVersion?: unknown;
}

const stopReasonOf = (finish: string | null): string | null => (finish === 'STOP' ? 'end_turn' : finish === 'MAX_TOKENS' ? 'max_tokens' : (finish?.toLowerCase() ?? null));

function parseReply(raw: unknown, request: AnalysisRequest, key: string): ProviderResult<AnalysisReply> | null {
  const r = raw as RawReply | null;
  if (!r || typeof r !== 'object') return null;
  const blocked = str(r.promptFeedback?.blockReason);
  const blockFail = (why: string, code: string): ProviderResult<AnalysisReply> => ({
    ok: false,
    failure: 'invalid',
    status: 200,
    message: redactKey(`حجبت Google الطلب لأسباب أمان فلم يُنتج تحليل (${why}: ${code})؛ لم يُعد مِجهَر الطلب`, key),
    retryAt: null,
  });
  if (blocked && blocked !== 'BLOCK_REASON_UNSPECIFIED') return blockFail('حُجب المحتوى المُرسل', blocked);
  const candidate = (Array.isArray(r.candidates) ? r.candidates[0] : null) as RawCandidate | null;
  if (!candidate) return null;
  const finish = str(candidate.finishReason);
  if (finish && finish in SAFETY_REASONS) return blockFail(`حُجب الرد بسبب ${SAFETY_REASONS[finish]}`, finish);
  const parts = Array.isArray(candidate.content?.parts) ? (candidate.content.parts as Array<{ text?: unknown; thought?: unknown }>) : [];
  // أجزاء «التفكير» ملخصات داخلية للمودل لا ردّ: لا تدخل نص التحليل.
  const text = parts
    .filter((p) => p?.thought !== true)
    .map((p) => str(p?.text))
    .filter((t): t is string => t !== null)
    .join('\n');
  if (!text) {
    // مودلات التفكير قد تستهلك حد المخرجات قبل أي نص: يُعلن ذلك سببًا ولا يُعرض تحليل فارغ ولا يُعاد الطلب.
    if (finish === 'MAX_TOKENS') return { ok: false, failure: 'invalid', status: 200, message: 'انتهى التوليد عند حد المخرجات (MAX_TOKENS) قبل أن يُنتج المودل نصًّا؛ لم يُعد مِجهَر الطلب', retryAt: null };
    return { ok: false, failure: 'http', status: 200, message: redactKey(`أنهت Google التوليد بلا نص${finish ? ` (${finish})` : ''}`, key), retryAt: null };
  }
  const usage = r.usageMetadata;
  return {
    ok: true,
    status: 200,
    data: {
      text: redactKey(text, key),
      model: str(r.modelVersion) ?? request.model,
      stopReason: stopReasonOf(finish),
      usage: usage ? { input: num(usage.promptTokenCount), output: num(usage.candidatesTokenCount) } : null,
    },
  };
}

/** فحص ناجح: ردّ المودل بمرشّح توليد (ولو بلا نص لأن حد المخرجات استُهلك)؛ وبلا مرشّح (حجب أو رد غير متوقع) لا يثبت توافقه. */
function parseProbe(raw: unknown): ProviderResult<true> | null {
  const r = raw as RawReply | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.candidates) || r.candidates.length === 0) return null;
  return { ok: true, status: 200, data: true };
}

export const GEMINI_ADAPTER: ProviderAdapter = {
  descriptor: GEMINI,

  listModels(call) {
    return send<ModelsList>(call, MODELS_PATH, { method: 'GET', headers: headers(call.key, false) }, (body, status) => {
      const b = body as { models?: unknown; nextPageToken?: unknown } | null;
      if (!Array.isArray(b?.models)) return null;
      const models = b.models.map(parseModel).filter((m): m is ProviderModel => m !== null);
      return { ok: true, status, data: { provider: GEMINI.id, models, readAt: call.now(), source: `https://${HOST}/v1beta/models`, partial: str(b.nextPageToken) !== null } };
    });
  },

  analyze(call, request: AnalysisRequest) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: { maxOutputTokens: request.maxTokens },
    });
    const path = `/v1beta/models/${encodeURIComponent(request.model)}:${METHOD}`;
    return send<AnalysisReply>(call, path, { method: 'POST', headers: headers(call.key, true), body }, (raw) => parseReply(raw, request, call.key));
  },

  probe(call, model) {
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROBE_TEXT }] }], generationConfig: { maxOutputTokens: PROBE_MAX_OUTPUT } });
    const path = `/v1beta/models/${encodeURIComponent(model)}:${METHOD}`;
    return send<true>(call, path, { method: 'POST', headers: headers(call.key, true), body }, (raw) => parseProbe(raw));
  },
};
