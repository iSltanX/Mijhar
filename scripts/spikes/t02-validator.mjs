// مدقق رموز مرجعي مؤقت لتجربة T-0.2 وحدها (AC-S2.4) — لا يُشحن ولا ينتظر T-4.2.
// التقنيع: العناصر المحمية تُستبدل برموز ⟦TYPE_INDEX⟧. والفحوص الأربعة المعرّفة للمدقق الإنتاجي في T-4.2:
//   (1) العدد، (2) الهوية وعدم الفقدان، (3) عدم التكرار، (4) عدم اختلاق رموز.
// وتصنيف الفشل المطلوب في AC-S2.4: فقد، تكرار، تحريف (رمز مشوَّه الشكل يحل محل الأصل)، اختلاق.

const PATTERNS = [
  ['CODE', /`[^`]+`/g],
  ['URL', /https?:\/\/[^\s)]+/g],
  ['PATH', /\b[\w.-]+\/[\w.-]+@[\w.]+/g],
  ['PATH', /(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.\w+/g],
  ['FLAG', /(?<![\w-])--?[a-zA-Z][\w-]*/g],
  ['VER', /\bv?\d+\.\d+(?:\.\d+)+(?:-[\w.]+)?\b/g],
  ['USER', /@[A-Za-z0-9-]+/g],
  ['REF', /#\d+\b/g],
  ['TERM', /\b(?:GitHub Actions|pull request|package\.json|Node\.js|npm|TypeScript|README)\b/g],
];

export function mask(text) {
  const tokens = [];
  let out = text;
  for (const [type, re] of PATTERNS) {
    out = out.replace(re, (m) => {
      if (m.includes('⟦')) return m;
      const token = `⟦${type}_${tokens.length}⟧`;
      tokens.push({ token, value: m });
      return token;
    });
  }
  return { masked: out, tokens };
}

const TOKEN_RE = /⟦([A-Z]+)_(\d+)⟧/g;
const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validate(tokens, output) {
  const text = output ?? '';
  const expected = tokens.map((t) => t.token);
  const found = [...text.matchAll(TOKEN_RE)].map((m) => m[0]);
  const counts = new Map();
  for (const t of found) counts.set(t, (counts.get(t) ?? 0) + 1);
  const missing = expected.filter((t) => !counts.has(t));
  const duplicated = [...counts].filter(([t, n]) => expected.includes(t) && n > 1).map(([t]) => t);
  const fabricated = [...counts.keys()].filter((t) => !expected.includes(t));
  // لكل رمز مفقود: هل بقي بشكل محرَّف (بلا أقواس، أو بحالة أحرف أخرى، أو بقوس ناقص، أو باسم نوع معرَّب)؟
  const rest = text.replace(TOKEN_RE, ' ');
  const distorted = [];
  const lost = [];
  for (const t of missing) {
    const [, type, index] = /⟦([A-Z]+)_(\d+)⟧/.exec(t);
    const re = new RegExp(`(?:⟦|\\[|〚)?\\s*(?:${escape(type)}|[\\u0600-\\u06FF]{2,8})[\\s_-]*${index}(?!\\d)\\s*(?:⟧|\\]|〛)?`, 'i');
    const m = re.exec(rest);
    if (m) distorted.push({ token: t, form: m[0].trim() });
    else lost.push(t);
  }
  const checks = {
    count: found.length === expected.length,
    identity: missing.length === 0,
    noDuplication: duplicated.length === 0,
    noFabrication: fabricated.length === 0,
  };
  const failures = [];
  if (lost.length) failures.push('فقد');
  if (duplicated.length) failures.push('تكرار');
  if (distorted.length) failures.push('تحريف');
  if (fabricated.length) failures.push('اختلاق');
  return { pass: Object.values(checks).every(Boolean), checks, failures, missing, lost, distorted, duplicated, fabricated };
}

export function unmask(tokens, output) {
  let out = output;
  for (const { token, value } of tokens) out = out.split(token).join(value);
  return out;
}

export function summarize(results) {
  const total = results.length;
  const by = { 'فقد': 0, 'تكرار': 0, 'تحريف': 0, 'اختلاق': 0 };
  let pass = 0;
  for (const r of results) {
    if (r.pass) pass += 1;
    for (const f of r.failures) by[f] += 1;
  }
  return { total, pass, failRate: total ? (total - pass) / total : null, byType: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { count: v, rate: total ? v / total : null }])) };
}
