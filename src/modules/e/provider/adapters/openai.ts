// محوّل OpenAI (MJ24، T-11.11، DEC-09 ز-4): api.openai.com وحده، من خلفية الإضافة بلا وسيط (evidence/T-11.11/direct-access.md، HYP-20). وصفه (الاسم
// والمضيف وصيغة المفتاح وطلب التحقق المعلن) في descriptors/openai.ts؛ وهنا وحده ما لا يصل غير الخلفية (I-2):
//  - الترويسة: Authorization: Bearer <المفتاح> وcontent-type؛ ولم يلزم في القياس شيء آخر (لا ترويسة وصول مباشر كما عند Anthropic). المفتاح في الترويسة
//    وحدها لا في عنوان ولا جسم.
//  - المودلات من GET /v1/models وقت التشغيل (وهي طلب التحقق المعلن: لا يحمل محتوى). ولا تعلن القائمة الرسمية نقطةً يدعمها كل مودل، فكلها «غير معلنة
//    التوافق» (DEC-13 ن-3، HYP-22) ولا يُستنتج توافق من الاسم؛ ويثبت بفحص صريح (probe) يبدؤه المستخدم: POST /v1/responses بـ«ping» وحده.
//  - التحليل POST /v1/responses بلا بث وstore=false (فلا يُطلب حفظ الرد لدى المزوّد)، والنص من عناصر output_text في عنصر message.
//  - الأخطاء كما تعلنها الوثائق: 401 مفتاح مرفوض، 403 (منها منطقة غير مدعومة)، 404، 429 (retry-after بالثواني حين يُعلن)، 5xx وتحميل زائد. لا إعادة
//    تلقائية ولا تحويل إلى مزوّد آخر (يفرضه service.ts).
//  - لا سعر ولا تكلفة هنا (AD-31)؛ وما يعلنه المزوّد من حدود يُحترم ويُعاد كما هو.
import { OPENAI } from '../descriptors/openai';
import { ProviderPermissionError, redactKey } from '../gate';
import type { AnalysisReply, AnalysisRequest, ModelsList, ProviderAdapter, ProviderCall, ProviderFailure, ProviderModel, ProviderResult } from '../types';

const HOST = OPENAI.host;
const MODELS_PATH = '/v1/models';
const RESPONSES_PATH = '/v1/responses';
/** أدنى حد مخرجات تقبله النقطة. */
const MIN_OUTPUT_TOKENS = 16;
const PROBE_INPUT = 'ping';

const headers = (key: string, json: boolean): Record<string, string> => ({
  authorization: `Bearer ${key}`,
  ...(json ? { 'content-type': 'application/json' } : {}),
});

interface RawError {
  error?: { type?: unknown; code?: unknown; message?: unknown };
}

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** موعد إعادة المحاولة كما يعلنه المزوّد: retry-after بالثواني (موثَّق في 429 و503)، وإلا null. */
function retryAtOf(response: Response, now: number): number | null {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null;
}

function failureOf(status: number, code: string | null): ProviderFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 413 || code === 'context_length_exceeded') return 'too-large';
  if (status === 429) return 'rate-limit';
  if (status === 400 || status === 422) return 'invalid';
  if (status >= 500) return 'overloaded';
  return 'http';
}

/** نتيجة تفسير جسم ناجح: بيانات، أو رفض معلن (الرد وصل لكنه لا يصلح عرضًا)، أو null لجسم غير متوقع. */
class Reject {
  constructor(
    readonly failure: ProviderFailure,
    readonly message: string,
  ) {}
}
type Parsed<T> = T | Reject | null;

async function send<T>(call: ProviderCall, path: string, init: RequestInit, parse: (body: unknown) => Parsed<T>): Promise<ProviderResult<T>> {
  const fail = (failure: ProviderFailure, message: string, status: number | null = null, retryAt: number | null = null): ProviderResult<T> => ({ ok: false, failure, status, message: redactKey(message, call.key), retryAt });
  let response: Response;
  try {
    response = await call.fetch(path, { ...init, ...(call.signal ? { signal: call.signal } : {}) });
  } catch (error) {
    if (error instanceof ProviderPermissionError) return fail('permission', error.message);
    if (error instanceof Error && error.name === 'AbortError') return fail('aborted', 'أُوقف الطلب قبل اكتماله');
    return fail('network', error instanceof Error ? error.message : String(error));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = (body as RawError | null)?.error;
    const message = str(error?.message) ?? `HTTP ${response.status}`;
    return fail(failureOf(response.status, str(error?.code)), message, response.status, retryAtOf(response, call.now()));
  }
  const data = parse(body);
  if (data === null) return fail('http', 'استجابة غير متوقعة من المزوّد', response.status);
  if (data instanceof Reject) return fail(data.failure, data.message, response.status);
  return { ok: true, status: response.status, data };
}

/** المودل: ISO من created بالثواني، وحالة دورة حياته من shutdown_date المعلن (مضى ⇒ متقاعد لا يُعرض). */
function parseModel(raw: unknown, now: number): ProviderModel | null {
  const r = raw as Record<string, unknown> | null;
  const id = str(r?.id);
  if (!id) return null;
  const created = num(r?.created);
  const shutdown = str(r?.shutdown_date);
  const shutdownAt = shutdown ? Date.parse(shutdown) : Number.NaN;
  return {
    id,
    displayName: id,
    createdAt: created === null ? null : new Date(created * 1000).toISOString(),
    // owned_by هو الجهة المالكة لا فئة المودل؛ فلا فئة معلنة.
    line: null,
    maxTokens: null,
    maxInputTokens: null,
    lifecycle: shutdown ? (Number.isFinite(shutdownAt) && shutdownAt <= now ? 'retired' : 'deprecated') : 'active',
    compatibility: 'unknown',
  };
}

const textOf = (output: unknown, partType: string, field: string): string[] =>
  (Array.isArray(output) ? output : [])
    .filter((item: unknown) => (item as { type?: unknown } | null)?.type === 'message')
    .flatMap((item: unknown) => ((item as { content?: unknown }).content as unknown[] | undefined) ?? [])
    .map((part: unknown) => ((part as { type?: unknown } | null)?.type === partType ? str((part as Record<string, unknown>)[field]) : null))
    .filter((t): t is string => t !== null);

export const OPENAI_ADAPTER: ProviderAdapter = {
  descriptor: OPENAI,

  listModels(call) {
    return send<ModelsList>(call, MODELS_PATH, { method: 'GET', headers: headers(call.key, false) }, (body) => {
      const b = body as { data?: unknown } | null;
      if (!Array.isArray(b?.data)) return null;
      const now = call.now();
      const models = b.data
        .map((m: unknown) => parseModel(m, now))
        .filter((m): m is ProviderModel => m !== null && m.lifecycle !== 'retired')
        // ترتيب العرض: الأحدث أولًا؛ لا يعني تفضيل مودل (لا يُختار شيء قبل ثبوت توافقه).
        .sort((a, b2) => Date.parse(b2.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0);
      return { provider: OPENAI.id, models, readAt: now, source: `https://${HOST}${MODELS_PATH}`, partial: false };
    });
  },

  analyze(call, request: AnalysisRequest) {
    const body = JSON.stringify({ model: request.model, instructions: request.system, input: request.prompt, max_output_tokens: Math.max(MIN_OUTPUT_TOKENS, request.maxTokens), store: false });
    return send<AnalysisReply>(call, RESPONSES_PATH, { method: 'POST', headers: headers(call.key, true), body }, (raw) => {
      const r = raw as { status?: unknown; model?: unknown; output?: unknown; incomplete_details?: { reason?: unknown } | null; error?: { message?: unknown } | null; usage?: { input_tokens?: unknown; output_tokens?: unknown } | null } | null;
      if (!r || !Array.isArray(r.output)) return null;
      if (r.status === 'failed') return new Reject('http', str(r.error?.message) ?? 'فشل توليد الرد لدى المزوّد');
      const text = textOf(r.output, 'output_text', 'text').join('\n');
      const reason = str(r.incomplete_details?.reason);
      if (!text) {
        const refusal = textOf(r.output, 'refusal', 'refusal').join(' ');
        if (refusal) return new Reject('invalid', `رفض المودل الطلب: ${refusal}`);
        if (reason === 'max_output_tokens') return new Reject('invalid', 'بلغ الرد حد الطول قبل أي نص (قد يستهلكه استدلال المودل)؛ لم يُعَد الطلب');
        if (reason === 'content_filter') return new Reject('invalid', 'حجب المزوّد الرد (content_filter)؛ لا تحليل لهذا الطلب ولم يُعَد');
        return new Reject('invalid', 'أعاد المزوّد ردًّا بلا نص');
      }
      return {
        text: redactKey(text, call.key),
        model: str(r.model) ?? request.model,
        // الاسم الذي تقرأه الطبقة المشتركة لقطع الرد على حد الطول (result.ts)؛ وغيره كما أعلنه المزوّد.
        stopReason: reason === 'max_output_tokens' ? 'max_tokens' : (reason ?? str(r.status) ?? null),
        usage: r.usage ? { input: num(r.usage.input_tokens), output: num(r.usage.output_tokens) } : null,
      };
    });
  },

  probe(call, model) {
    const body = JSON.stringify({ model, input: PROBE_INPUT, max_output_tokens: MIN_OUTPUT_TOKENS, store: false });
    return send<true>(call, RESPONSES_PATH, { method: 'POST', headers: headers(call.key, true), body }, (raw) => {
      const r = raw as { object?: unknown; output?: unknown } | null;
      // يكفي قبول النقطة للمودل وردٌّ بصيغتها؛ ولو قُطع الرد عند الحد الأدنى فالتوافق ثابت.
      return r && (r.object === 'response' || Array.isArray(r.output)) ? (true as const) : null;
    });
  },
};
