// الفحص الديناميكي لسجل الشبكة (T-4.5، AC-C6، TEST-PRIV-01): يصنّف الطلبات المسجَّلة خلال تشغيل ترجمة كامل. دوال نقية على سجل طلبات؛ التسجيل نفسه في capture.mjs.
//  - الطلب إلى مضيف خارج ALLOWED_MODEL_HOSTS مخالفة (تحت ج-2 لا مضيف مسموح: ولا حتى github.com، فمسار الترجمة لا يتصل بشيء)، وإلى مضيف ترجمة سحابي مخالفة مسماة.
//  - تسرّب المحتوى: أي أثر من نص الصفحة (عبارات «كناري» مأخوذة من النص المترجم) في عنوان الطلب أو جسمه أو ترويساته، إلى أي مضيف.
//  - موارد الإضافة نفسها (chrome-extension:// وmoz-extension://) وdata: وblob: وabout: ليست اتصالًا بالشبكة فتُستبعد.
import { ALLOWED_MODEL_HOSTS, CLOUD_TRANSLATION_HOSTS, hostMatches } from './policy.mjs';

/** @typedef {{ url: string, method?: string, type?: string, postData?: string | null, headers?: Record<string, string>, t?: number, target?: { type?: string, url?: string } }} NetRequest */

const LOCAL_SCHEMES = /^(chrome-extension|moz-extension|extension|data|blob|about|chrome|edge|brave|devtools|file):/i;

export const isNetworkRequest = (req) => !LOCAL_SCHEMES.test(req.url);

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** تطبيع للبحث عن آثار النص: فك ترميز URL وتوحيد المسافات والأحرف الصغيرة. */
export function normalizeForSearch(text) {
  let decoded = String(text);
  for (let i = 0; i < 2; i += 1) {
    try {
      decoded = decodeURIComponent(decoded.replace(/\+/g, ' '));
    } catch {
      break;
    }
  }
  return decoded.replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param {NetRequest[]} requests
 * @param {{ allowedHosts?: readonly string[], cloud?: readonly string[] }} [options]
 */
export function classifyRequests(requests, { allowedHosts = ALLOWED_MODEL_HOSTS, cloud = CLOUD_TRANSLATION_HOSTS } = {}) {
  const network = requests.filter(isNetworkRequest);
  const allowed = [];
  const violations = [];
  for (const req of network) {
    const host = hostOf(req.url);
    if (host && hostMatches(host, allowedHosts)) {
      allowed.push(req);
      continue;
    }
    violations.push({ ...req, host, rule: host && hostMatches(host, cloud) ? 'cloud-translation-host' : 'host-not-allowed' });
  }
  return { total: requests.length, ignored: requests.length - network.length, network: network.length, allowed, violations };
}

/**
 * يبحث عن عبارات من نص الصفحة في عنوان الطلب وجسمه وترويساته.
 * @param {NetRequest[]} requests
 * @param {readonly string[]} canaries
 */
export function findLeaks(requests, canaries) {
  const needles = canaries.map((c) => ({ canary: c, needle: normalizeForSearch(c) })).filter((n) => n.needle.length >= 6);
  const leaks = [];
  for (const req of requests.filter(isNetworkRequest)) {
    const places = { url: req.url, body: req.postData ?? '', headers: Object.values(req.headers ?? {}).join('\n') };
    for (const [where, value] of Object.entries(places)) {
      const hay = normalizeForSearch(value);
      for (const { canary, needle } of needles) if (hay.includes(needle)) leaks.push({ url: req.url, host: hostOf(req.url), where, canary });
    }
  }
  return leaks;
}

/** تقرير نافذة واحدة: التصنيف والتسرب وحكم النجاح (لا مخالفة ولا تسرب). */
export function auditWindow(requests, canaries, options) {
  const classification = classifyRequests(requests, options);
  const leaks = findLeaks(requests, canaries);
  return { ...classification, leaks, pass: classification.violations.length === 0 && leaks.length === 0 };
}
