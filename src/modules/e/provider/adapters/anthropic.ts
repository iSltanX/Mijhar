// محوّل المزوّد الأول (DEC-09 ز-1): Anthropic (Claude API) عبر api.anthropic.com وحده، من خلفية الإضافة (evidence/T-0.5، HYP-17):
//  - الترويسات التي لزمت في القياس: x-api-key وanthropic-version وcontent-type وanthropic-dangerous-direct-browser-access (بدونها يرفض الخادم
//    طلب سياق الإضافة بـ401). لا وسيط خارجي.
//  - المودلات من GET /v1/models وقت التشغيل (وهي طلب التحقق المعلن: لا يحمل محتوى)، والتحليل POST /v1/messages بلا بث.
//  - لا سعر ولا تكلفة هنا (AD-31)؛ وما يعلنه المزوّد من حدود (429 وretry-after، وmax_tokens للمودل) يُحترم ويُعاد كما هو.
import { ProviderPermissionError, redactKey } from '../gate';
import type { AnalysisReply, AnalysisRequest, ModelsList, ProviderAdapter, ProviderCall, ProviderFailure, ProviderModel, ProviderResult } from '../types';

const HOST = 'api.anthropic.com';
const VERSION = '2023-06-01';
const MODELS_PATH = '/v1/models?limit=100';
const KEY = /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/;

const headers = (key: string, json: boolean): Record<string, string> => ({
  'x-api-key': key,
  'anthropic-version': VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
  ...(json ? { 'content-type': 'application/json' } : {}),
});

interface RawError {
  error?: { type?: unknown; message?: unknown };
}

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** موعد إعادة المحاولة كما يعلنه المزوّد: retry-after بالثواني، وإلا null. */
function retryAtOf(response: Response, now: number): number | null {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null;
}

function failureOf(status: number): ProviderFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 413) return 'too-large';
  if (status === 429) return 'rate-limit';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 529 || status >= 500) return 'overloaded';
  return 'http';
}

async function send<T>(call: ProviderCall, path: string, init: RequestInit, parse: (body: unknown) => T | null): Promise<ProviderResult<T>> {
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
    const message = str((body as RawError | null)?.error?.message) ?? `HTTP ${response.status}`;
    return fail(failureOf(response.status), message, response.status, retryAtOf(response, call.now()));
  }
  const data = parse(body);
  return data === null ? fail('http', 'استجابة غير متوقعة من المزوّد', response.status) : { ok: true, status: response.status, data };
}

function parseModel(raw: unknown): ProviderModel | null {
  const r = raw as Record<string, unknown> | null;
  const id = str(r?.id);
  if (!id) return null;
  return {
    id,
    displayName: str(r?.display_name) ?? id,
    createdAt: str(r?.created_at),
    line: str(r?.line),
    maxTokens: num(r?.max_tokens),
    maxInputTokens: num(r?.max_input_tokens),
    lifecycle: str(r?.lifecycle),
  };
}

export const ANTHROPIC: ProviderAdapter = {
  id: 'anthropic',
  title: 'Anthropic',
  host: HOST,
  origin: `https://${HOST}/*`,
  keyPrefix: 'sk-ant-',
  verifyRequest: `طلب واحد GET https://${HOST}/v1/models يقرأ قائمة المودلات المتاحة لمفتاحك، ولا يحمل شيئًا من صفحاتك.`,

  checkKey(input) {
    const key = input.trim();
    if (!key) return { ok: false, reason: 'الحقل فارغ.' };
    if (KEY.test(key)) return { ok: true, key };
    if (key.startsWith('sk-ant-admin')) return { ok: false, reason: 'هذا مفتاح إدارة (Admin) لا يصلح للتحليل؛ أنشئ مفتاح API عاديًا من Claude Console.' };
    return { ok: false, reason: 'لا يطابق صيغة مفتاح Anthropic API (sk-ant-api…). تأكد أنك نسخته كاملًا.' };
  },

  listModels(call) {
    return send<ModelsList>(call, MODELS_PATH, { method: 'GET', headers: headers(call.key, false) }, (body) => {
      const b = body as { data?: unknown; has_more?: unknown } | null;
      if (!Array.isArray(b?.data)) return null;
      const models = b.data.map(parseModel).filter((m): m is ProviderModel => m !== null && m.lifecycle !== 'retired');
      return { provider: 'anthropic', models, readAt: call.now(), source: `https://${HOST}/v1/models`, partial: b.has_more === true };
    });
  },

  analyze(call, request: AnalysisRequest) {
    const body = JSON.stringify({ model: request.model, max_tokens: request.maxTokens, system: request.system, messages: [{ role: 'user', content: request.prompt }] });
    return send<AnalysisReply>(call, '/v1/messages', { method: 'POST', headers: headers(call.key, true), body }, (raw) => {
      const r = raw as { content?: unknown; model?: unknown; stop_reason?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
      if (!Array.isArray(r?.content)) return null;
      const text = r.content
        .map((block: unknown) => ((block as { type?: unknown }).type === 'text' ? str((block as { text?: unknown }).text) : null))
        .filter((t): t is string => t !== null)
        .join('\n');
      return {
        text: redactKey(text, call.key),
        model: str(r.model) ?? request.model,
        stopReason: str(r.stop_reason),
        usage: r.usage ? { input: num(r.usage.input_tokens), output: num(r.usage.output_tokens) } : null,
      };
    });
  },
};
