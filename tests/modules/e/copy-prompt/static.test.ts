// TEST-CTX-07 (AC-E7) — الشق الساكن: «نسخ البرومبت» لا يتصل بشيء ولا يستعمل مفتاحًا ولا رمزًا ولا يمرّر قراءة API إلى الطبقة (AD-30)، ولا يبني مسارًا موازيًا لطبقة السياق (AD-22)،
// ولا يعرض صندوق نص. يقرأ ملفات src/modules/e/copy-prompt كلها (وبقية الاختبارات في الملفين الآخرين تثبت الحالات والحافظة).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../helpers';

const DIR = 'src/modules/e/copy-prompt';
const FILES = fs
  .readdirSync(path.join(ROOT, DIR))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => ({ path: `${DIR}/${f}`, text: fs.readFileSync(path.join(ROOT, DIR, f), 'utf8') }));

/** الشيفرة بلا التعليقات الكاملة (أسطر // وكتل /* *\/). */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = FILES.map((f) => ({ path: f.path, code: code(f.text) }));

describe('TEST-CTX-07 (ساكن): لا اتصال ولا مفتاح ولا رمز', () => {
  it('لا شبكة ولا رسائل ولا طبقة طلبات ولا اتصالات في ملفات الوحدة', () => {
    const NETWORK = /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|EventSource|sendBeacon|sendMessage|runtime\.connect|api\.github\.com|api\.anthropic\.com|https?:\/\/(?!github\.com\/octo)/;
    expect(SRC.filter((f) => NETWORK.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it('لا استيراد من طبقة الاتصالات والمفاتيح (core/connections) ولا من رمز الوصول ولا من مزوّد التحليل', () => {
    const FORBIDDEN = /from\s+'[^']*(core\/connections|modules\/d\/token|modules\/e\/provider|modules\/d\/status|modules\/d\/analysis|core\/api)[^']*'/;
    expect(SRC.filter((f) => FORBIDDEN.test(f.code)).map((f) => f.path)).toEqual([]);
    expect(SRC.filter((f) => /\b(secret|apiKey|api-key|Authorization|Bearer|x-api-key)\b/i.test(f.code.replace(/Bearer\s*\$\{[^}]*\}/g, ''))).map((f) => f.path)).toEqual([]);
  });

  it('لا تمرّر قراءة API إلى الطبقة (AD-30): استدعاء prepareContext بلا extras ولا apiRead، ولا لمس للجامع', () => {
    const mod = SRC.find((f) => f.path.endsWith('/module.tsx'))?.code ?? '';
    const call = /prepareContext\(([^;]*)\);/.exec(mod)?.[1] ?? '';
    expect(call).not.toBe('');
    expect(call).not.toMatch(/extras|api|log/i);
    expect(SRC.filter((f) => /\b(collectContext|readPrApi|ApiPrData|CollectExtras)\b/.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it('لا يعرض صندوق نص: لا textarea ولا input ولا pre ولا contenteditable في واجهة الوحدة، والحقل المؤقت للبديل في clipboard.ts وحده', () => {
    const FIELD = /<textarea|<input|<pre\b|contenteditable|<select/i;
    expect(SRC.filter((f) => FIELD.test(f.code) && !f.path.endsWith('/section.tsx')).map((f) => f.path)).toEqual([]);
    expect(SRC.filter((f) => /createElement\('textarea'\)/.test(f.code)).map((f) => f.path)).toEqual([`${DIR}/clipboard.ts`]);
    // الحقل المؤقت يُزال في finally.
    const clip = SRC.find((f) => f.path.endsWith('/clipboard.ts'))?.code ?? '';
    expect(clip).toMatch(/finally\s*\{[^}]*field\.remove\(\)/);
  });

  it('لا يبني جمعًا ولا تنقيحًا ولا اقتطاعًا ولا بناء برومبت لنفسه: يستهلك الطبقة وقوالب البرومبت وحدهما', () => {
    const OWN = /\btextContent\b|\binnerText\b|getSelection\(|resolveAll\(|\.closest\(|querySelectorAll\(|\.slice\(0,|\[محجوب:|scanText|SECRET_PATTERNS/;
    expect(SRC.filter((f) => OWN.test(f.code)).map((f) => f.path)).toEqual([]);
    const imports = FILES.flatMap((f) => [...f.text.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map((m) => [f.path, m[1] as string] as const));
    const external = imports.filter(([, spec]) => spec.startsWith('../') && !spec.startsWith('../../../')).map(([, spec]) => spec);
    // من خارج المجلد ضمن الوحدة (هـ): الطبقة وقوالب البرومبت ومنشئ الحزمة (للتنزيل المحلي فقط).
    expect([...new Set(external)].sort()).toEqual(['../builder', '../context', '../prompt-templates']);
    const builder = FILES.flatMap((f) => [...f.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/builder'/g)].map((m) => (m[1] as string).trim()));
    expect(builder).toEqual(['downloadMarkdown']);
  });

  it('لا يكتب في التخزين ولا يقرأ الملاحظات أو الروابط المحفوظة: القراءة كسولة للإعدادات المعلنة وحدها', () => {
    expect(SRC.filter((f) => /\.set\(|storage\.local\.set|localStorage|sessionStorage|indexedDB/.test(f.code) && !f.path.endsWith('/section.tsx')).map((f) => f.path)).toEqual([]);
    const keys = SRC.flatMap((f) => [...f.code.matchAll(/settings\.get\(([A-Z_]+)\)/g)].map((m) => m[1]));
    expect([...new Set(keys)].sort()).toEqual(['LINE_LIMIT_KEY', 'TEMPLATE_KEY']);
  });
});
