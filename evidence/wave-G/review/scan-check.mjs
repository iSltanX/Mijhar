// فحص مراجعة الموجة G (MJ17، T-6.3): فاحص الأسرار التحذيري على الشجرة المجمّعة.
// يثبت: (1) على السجل المرجعي يُرصد رمز واحد في السطر 457 والنص لا يتغير؛ (2) زمن الفحص خطي على مدخلات معادية لأنماط القائمة (لا ReDoS)؛
// (3) لا نمط يرصد بدلاً من التنقيح: المخرج مواضع فقط، والنص المُدخل نفسه لا يُمس؛ (4) أنماط ملتصقة وحدود تحذيرية.
// الاستعمال: node evidence/wave-G/review/scan-check.mjs   (Node ≥ 22.18 يجرّد أنواع TypeScript؛ scan.ts بلا استيرادات)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { scanText, SECRET_PATTERNS } = await import(pathToFileURL(path.join(ROOT, 'src/modules/e/privacy-check/scan.ts')).href);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const time = (fn) => {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
};

// (1) السجل المرجعي.
const logPath = path.join(ROOT, 'fixtures/logs/fixture-action-logs-with-secrets.txt');
const log = fs.readFileSync(logPath, 'utf8');
const copy = `${log}`;
const found = scanText(log);
check('السجل المرجعي: مرصود واحد', found.length === 1, `العدد ${found.length}`);
check('السجل المرجعي: السطر 457 ونمط github-token', found[0]?.line === 457 && found[0]?.patternId === 'github-token', JSON.stringify(found[0]));
check('الفحص لا يغيّر النص (نسخة مطابقة بعد الفحص)', log === copy && log.length === copy.length);

// (2) مدخلات معادية: كل واحد مليونا حرف أو أكثر؛ الحد الأعلى للمقبول ثانية واحدة (الخطي فعليًا بضع عشرات من الملّي ثانية).
const MB = 1_000_000;
const hostile = {
  'BEGIN مكرر': '-----BEGIN '.repeat(200_000),
  'BEGIN ثم حروف كبيرة طويلة بلا PRIVATE KEY': `-----BEGIN ${'A '.repeat(MB)}`,
  'BEGIN متكرر بحروف كبيرة بين كل واحد': '-----BEGIN ABCDEFGHIJ '.repeat(100_000),
  'Bearer ثم مسافات طويلة': `Bearer${' '.repeat(MB)}x`,
  'Bearer مكرر بمسافات': 'Bearer      '.repeat(150_000),
  'Bearer ثم رمز طويل جدًا': `Bearer ${'a'.repeat(2 * MB)}`,
  'ghp_ مكرر': 'ghp_'.repeat(500_000),
  'ghp_ ثم أحرف طويلة بلا فاصل': `ghp_${'A'.repeat(2 * MB)}`,
  'github_pat_ طويل': `github_pat_${'a_'.repeat(MB)}`,
  'AKIA مكرر': 'AKIA'.repeat(500_000),
  'xoxb- طويل': `xoxb-${'-'.repeat(2 * MB)}`,
  'نص عادي كبير (5MB)': 'The quick brown fox jumps over the lazy dog. '.repeat(115_000),
};
for (const [name, text] of Object.entries(hostile)) {
  const { value, ms } = time(() => scanText(text));
  check(`أداء: ${name}`, ms < 1000, `${text.length} حرفًا · ${ms.toFixed(0)}ms · ${value.length} مرصود`);
}

// (3) حدود تحذيرية معلنة: الأنماط الستة ترصد صيغها المعتادة، ولا ترصد داخل كلمات أطول.
const fake = {
  ghp: `ghp_${'a1B2c3D4e5F6g7H8'}`,
  pat: `github_pat_${'11AAAAAAA0abcdefghijklmn'}`,
  bearer: `Bearer ${'abcdefghijklmnop1234'}`,
  aws: `AKIA${'ABCDEFGHIJKLMNOP'}`,
  key: '-----BEGIN RSA PRIVATE KEY-----',
  slack: `xoxb-${'1234567890-abcdef'}`,
};
const joined = Object.values(fake).join('\n');
const ids = scanText(joined).map((f) => f.patternId).sort();
check('الأنماط الستة ترصد صيغها (ستة مرصودات)', ids.length === 6 && new Set(ids).size === 6, ids.join(','));
check('الحدود: لا رصد داخل كلمة أطول (xghp_… وAKIAx…)', scanText(`x${fake.ghp} ${fake.aws}Z`).length === 0);
check('عدد أنماط القائمة المعلنة', SECRET_PATTERNS.length === 6, String(SECRET_PATTERNS.length));
const mapped = scanText(joined).every((f) => joined.slice(f.start, f.end).length === f.end - f.start && f.end > f.start);
check('كل مرصود إزاحتاه داخل النص ونهايته بعد بدايته', mapped);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} اجتازت`);
process.exitCode = failed.length ? 1 : 0;
