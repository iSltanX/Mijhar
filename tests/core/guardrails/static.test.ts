// TEST-SEC-06 (مراجعة شيفرة: فحص ساكن، AC-F7 (١) و(٢)) على src، ومعه الشيفرة المبنية للحزمتين إن بُنيتا (built-check.mjs):
//  (١) رمز الكتابة: مخزنه يُنشأ في الخلفية وصفحة الإعدادات وحدهما، ومفتاحاه في keys.ts وحده ومستقلان عن مفتاحي رمز القراءة؛ والخلفية تمرّره إلى خدمة
//      التنفيذ وحدها (وسجل الاتصالات يرى info وحدها)؛ وبوابة الكتابة يستوردها خدمة التنفيذ وحدها؛ وعميل القراءة يأخذ رمز القراءة وحده؛ وترويسة
//      Bearer تُبنى في عميل القراءة وبوابة الكتابة وحدهما؛ والبوابة بلا GET ولا DELETE ولا PATCH ولا merge.
//  (٢) لا مسار يشغّل نصًّا أو يدرجه HTML: لا eval ولا new Function ولا مؤقت بنص ولا innerHTML/outerHTML/insertAdjacentHTML/document.write/
//      dangerouslySetInnerHTML ولا scripting.executeScript في src. وما يعرض ردّ المزوّد (d/analysis وe/provider) لا يستورد ما يكتب في حقول الصفحة
//      (f/composer وf/template وshared/fields) ولا مسار الإنجاز ولا طبقة الطلبات؛ ومسار الإنجاز لا يستورد طبقة المزوّد ولا التحليل، فلا يصير ردّ نموذج
//      خطة كتابة.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECRET_KEYS } from '../../../src/core/connections/keys';
import { ROOT } from '../../setup/paths';
import { TARGETS, checkBundle } from './built-check.mjs';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join('/');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** الشيفرة بلا تعليقات. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');
const SRC = walk(path.join(ROOT, 'src')).map(rel);
const using = (re: RegExp): string[] => SRC.filter((p) => re.test(code(read(p)))).sort();

describe('TEST-SEC-06 (١): رمز الكتابة سرّ منفصل لا يقرؤه إلا مسار T-11.8', () => {
  it('مفتاحا رمز الكتابة مستقلان عن مفتاحي رمز القراءة ومفتاح المزوّد، وفي keys.ts وحده', () => {
    expect(SECRET_KEYS['github-write']).toEqual({ session: 'mijhar.secret.githubWrite', disk: 'githubWrite' });
    const all = Object.values(SECRET_KEYS).flatMap((k) => [k.session, k.disk]);
    expect(new Set(all).size).toBe(all.length);
    expect(using(/mijhar\.secret\.githubWrite|['"]githubWrite['"]/)).toEqual(['src/core/connections/keys.ts']);
  });

  it("مخزن رمز الكتابة (connectionSecretStore('github-write')) يُنشأ في الخلفية وصفحة الإعدادات وحدهما", () => {
    expect(using(/connectionSecretStore\(\s*'github-write'/)).toEqual(['src/background/main.ts', 'src/options/main.tsx']);
  });

  it('الخلفية تمرّر رمز الكتابة إلى خدمة التنفيذ وحدها، وسجل الاتصالات يرى info وحدها، وعميل القراءة يأخذ رمز القراءة وحده', () => {
    const main = code(read('src/background/main.ts'));
    // كل سطر يذكر writeToken في الخلفية: نوع الخيار، وإنشاء المخزن، وinfo لسجل الاتصالات، وتمريره إلى خدمة التنفيذ؛ ولا غيرها.
    const uses = [...main.matchAll(/\bwriteToken\b[^\n]*/g)].map((m) => m[0].trim()).sort();
    expect(uses).toEqual(
      [
        "writeToken?: Pick<SecretStore, 'info' | 'read'> | null;",
        "writeToken = options.writeToken === undefined ? connectionSecretStore('github-write') : options.writeToken;",
        "writeToken ? { 'github-write': { info: () => writeToken.info() } } : {}) },",
        'writeToken,',
      ].sort(),
    );
    expect(main).toMatch(/const execution = new ExecutionService\(\{\s*writeToken,\s*readToken: tokens,/);
    expect(main).not.toMatch(/writeToken\.read/);
    expect(main).toMatch(/const token = tokens \? async \(\) => \(await tokens\.read\(\)\)\?\.token \?\? null : undefined;/);
    expect(using(/new ExecutionService\(/)).toEqual(['src/background/main.ts']);
  });

  it('بوابة الكتابة تستوردها خدمة التنفيذ وحدها (والمنفذ أنواعها وحدها)، ولا تصل سكربت المحتوى ولا اللوحة', () => {
    const importers = SRC.filter((p) => /from '[^']*guardrails\/write-gate'/.test(read(p)));
    expect(importers.sort()).toEqual(['src/modules/f/execution/port.ts', 'src/modules/f/execution/service.ts']);
    expect(read('src/modules/f/execution/port.ts')).toMatch(/import type \{ WriteStep \} from '..\/..\/..\/core\/guardrails\/write-gate';/);
    expect(code(read('src/core/guardrails/index.ts'))).not.toMatch(/write-gate/);
    expect(code(read('src/modules/f/execution/index.ts'))).not.toMatch(/service|WriteTokenSection/);
    expect(using(/from '[^']*f\/execution\/service'/)).toEqual(['src/background/main.ts']);
    expect(using(/from '[^']*f\/execution\/WriteTokenSection'/)).toEqual(['src/options/main.tsx']);
  });

  it('ترويسة Bearer تُبنى في عميل القراءة وبوابة الكتابة وحدهما، والبوابة بلا GET ولا DELETE ولا PATCH ولا merge', () => {
    // MJ24: محوّل OpenAI يبني Authorization: Bearer بمفتاح OpenAI نفسه (ترويسته الموثَّقة)، لا بسرّ GitHub: يستلم مفتاح مزوّده وحده من bindKey (AC-E10 (٢))، ولا يستورد شيئًا من
    // عميل GitHub ولا مخزن رمزيه (يفرضه اختبار عزل الأسرار في provider/static.test.ts).
    expect(using(/Bearer \$\{/)).toEqual(['src/core/api/client.ts', 'src/core/guardrails/write-gate.ts', 'src/modules/e/provider/adapters/openai.ts']);
    expect(code(read('src/modules/e/provider/adapters/openai.ts'))).not.toMatch(/core\/api|connections\/(keys|secrets)|write-gate|github/i);
    const gate = code(read('src/core/guardrails/write-gate.ts'));
    expect(gate).not.toMatch(/'GET'|"GET"|DELETE|PATCH|\/merge|\/pulls\/\$\{|state:\s*'closed'/);
    expect(new Set([...gate.matchAll(/'(GET|POST|PUT|PATCH|DELETE|HEAD)'/g)].map((m) => m[1]))).toEqual(new Set(['POST', 'PUT']));
    const service = code(read('src/modules/f/execution/service.ts'));
    expect(service).not.toMatch(/fetchApiGithub|globalThis\.fetch|DELETE|PATCH|\/merge/);
  });
});

describe('TEST-SEC-06 (٢): لا مسار يشغّل نصًّا أو يدرجه HTML أو يجعل ردّ النموذج طلبًا أو كتابة', () => {
  it.each([
    ['eval', /(^|[^\w.$])eval\s*\(/],
    ['new Function', /new\s+Function\s*\(/],
    ['مؤقت بنص', /set(?:Timeout|Interval)\s*\(\s*['"`]/],
    ['innerHTML =', /\.innerHTML\s*=(?!=)/],
    ['outerHTML =', /\.outerHTML\s*=(?!=)/],
    ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
    ['document.write', /document\.write(?:ln)?\s*\(/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['scripting.executeScript', /executeScript\s*\(/],
    ['createContextualFragment', /createContextualFragment\s*\(/],
  ])('لا %s في src', (_name, re) => {
    expect(using(re)).toEqual([]);
  });

  it('ما يعرض ردّ المزوّد لا يستورد ما يكتب في حقول الصفحة ولا مسار الإنجاز ولا طبقة الطلبات', () => {
    const readers = SRC.filter((p) => /^src\/modules\/(d\/analysis|e\/provider)\//.test(p) && !/e\/provider\/(service|adapters\/|KeySection)/.test(p));
    expect(readers.length).toBeGreaterThan(8);
    const offenders = readers.filter((p) => /from '[^']*(f\/composer|f\/template|shared\/fields|f\/execution|core\/api|guardrails\/write-gate)[^']*'/.test(read(p)));
    expect(offenders).toEqual([]);
  });

  it('مسار الإنجاز لا يستورد طبقة المزوّد ولا التحليل ولا ما يكتب في حقول الصفحة', () => {
    const files = SRC.filter((p) => p.startsWith('src/modules/f/execution/'));
    expect(files.length).toBeGreaterThan(8);
    expect(files.filter((p) => /from '[^']*(e\/provider|d\/analysis|f\/composer|f\/template|shared\/fields)[^']*'/.test(read(p)))).toEqual([]);
  });
});

const built = TARGETS.filter((t) => fs.existsSync(path.join(ROOT, 'dist', t, 'background.js')));

describe.runIf(built.length === TARGETS.length)('TEST-SEC-06 على الشيفرة المبنية (بعد npm run build)', () => {
  it.each(TARGETS)('%s: كل البنود', (target) => {
    const result = checkBundle(target);
    expect(result.items.filter((i: { pass: boolean }) => !i.pass)).toEqual([]);
  });
});
