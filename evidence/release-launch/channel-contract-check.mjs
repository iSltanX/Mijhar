#!/usr/bin/env node
// بعد MJ26: هل يقبل خادم القناة الحقيقي ما ترسله الإضافة؟ يُمرَّر كل جسم تبنيه buildPayload (src/core/report/payload.ts) على دالة validate نفسها من مصدر
// الخادم (iSltanX/Baddel → server/report-worker/src/index.js)، محليًا بلا أي طلب شبكة، في كل نوع ومتصفح ونظام وأطول وصف. ولا يثبت هذا أن النسخة
// المنشورة من الخادم هي هذا المصدر، ولا يغني عن بلاغ تجريبي واحد على الخدمة الفعلية؛ يثبت أن الجسم مطابق للعقد كما يطبّقه مصدر الخادم.
// الاستعمال: node evidence/release-launch/channel-contract-check.mjs <مسار index.js من مصدر الخادم>
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const worker = process.argv[2];
if (!worker) throw new Error('مسار index.js من مصدر الخادم مطلوب');
const { validate } = await import(pathToFileURL(path.resolve(worker)).href);
const { buildPayload, isReportPayload, serialise, REPORT_KINDS, LIMITS } = await import(pathToFileURL(path.join(ROOT, 'src/core/report/payload.ts')).href);

const BASE = { appVersion: '1.0.0', os: 'macos', osVersion: '27.0.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.8078.47', buildTarget: 'chromium', surface: 'native', disabledUnits: [], test: false };
const VARIANTS = [
  BASE,
  { ...BASE, browser: 'Microsoft Edge', browserVersion: '155.0.4283.60', os: 'windows', osVersion: '10.0.26100', arch: 'x86-64' },
  { ...BASE, browser: 'Brave', browserVersion: '156.0.8078.48', os: 'linux', osVersion: 'unknown', arch: 'x86-64', disabledUnits: ['c', 'h'] },
  { ...BASE, browser: 'Firefox', browserVersion: '158.0.1', buildTarget: 'firefox', surface: 'drawer', os: 'macos', arch: 'aarch64' },
  { ...BASE, test: true },
];
const TEXTS = ['اللوحة فارغة بعد التحديث', `${'وصف طويل '.repeat(250)}`.slice(0, LIMITS.description), 'نص مع `كود` و<b>وسوم</b> و🙂 وسطر\nثانٍ'];
let n = 0;
const failures = [];
for (const d of VARIANTS) {
  for (const kind of REPORT_KINDS) {
    for (const description of TEXTS) {
      const payload = buildPayload({ kind, description }, d);
      const wire = JSON.parse(serialise(payload));
      n += 1;
      try {
        const clean = validate(wire);
        if (clean.product !== 'mijhar' || clean.kind !== kind || clean.test !== Boolean(d.test) || !isReportPayload(wire)) failures.push({ kind, browser: d.browser, why: 'قيمة غير متوقعة بعد التحقق' });
      } catch (error) {
        failures.push({ kind, browser: d.browser, why: error?.body ?? String(error) });
      }
    }
  }
}
console.log(`${n} جسمًا من buildPayload على validate الخادم: ${n - failures.length} مقبول، ${failures.length} مرفوض`);
for (const f of failures) console.log(`  ✗ ${JSON.stringify(f)}`);
process.exit(failures.length ? 1 : 0);
