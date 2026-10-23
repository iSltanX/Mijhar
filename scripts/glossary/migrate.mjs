#!/usr/bin/env node
// ينقل مدخلات القاموس من المشروع السابق (ghsim-source، قراءة فقط) إلى المخطط الجديد (T-3.1).
//   - يطبّق scripts/glossary/rewrites.json (إزالة عبارات المحاكاة وتصحيحات الوثائق وتوحيد المصطلحات) ويسجّل كل بند في removed-log.json،
//   - ثم يدمج scripts/glossary/overlay/*.json (الحقول الجديدة: kind والصلاحية المضبوطة وwhenToUse وreversalLimits وdocsUrl والتحقق والتوقيع)،
//   - ثم يضيف scripts/glossary/additions.json (مداخل جديدة)، ويكتب src/data/glossary/entries.json.
// الاستعمال: node scripts/glossary/migrate.mjs [--source <مجلد ghsim-source>] [--check]
//   --check: لا يكتب شيئًا؛ يقارن الناتج بالملفين المحفوظين ويخرج بالرمز 1 عند أي فرق.
// بعد الدمج في الموجة يبقى entries.json هو الأصل المعدَّل؛ وهذا السكربت وملفاته سجل النقل ويُعاد تشغيله للتدقيق.
// يلزم Node بإزالة الأنواع تلقائيًا (22.18 فأحدث) لاستيراد explanations.ts مباشرة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REQUIRED_FIELDS, SCHEMA_VERSION } from '../../src/data/glossary/schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.join(ROOT, 'scripts/glossary');
// مسار المشروع السابق خارج المستودع: يُمرَّر بـ--source أو بمتغير البيئة GHSIM_SOURCE (لا مسار محلي مكتوب هنا).
const DEFAULT_SOURCE = process.env.GHSIM_SOURCE ?? '';
const CHECKED_ON = '2026-10-23';
const FIELD_ORDER = [
  'id',
  'kind',
  'ar',
  'en',
  'category',
  'brief',
  'medium',
  'detailed',
  'example',
  'safety',
  'reversible',
  'permission',
  'permissionNote',
  'whenToUse',
  'reversalLimits',
  'docsUrl',
  'verification',
  'signature',
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

async function loadSource(sourceDir) {
  if (!sourceDir) throw new Error('مرّر --source <مجلد ghsim-source> أو اضبط GHSIM_SOURCE');
  const file = path.join(sourceDir, 'src/data/explanations.ts');
  if (!fs.existsSync(file)) throw new Error(`لم يوجد ${file}؛ مرّر --source <مجلد ghsim-source>`);
  const { EXPLANATIONS } = await import(pathToFileURL(file).href);
  return EXPLANATIONS;
}

/** يبني الناتج كاملًا دون كتابة. */
export async function migrate({ sourceDir = DEFAULT_SOURCE } = {}) {
  const source = await loadSource(sourceDir);
  const rewrites = readJson(path.join(HERE, 'rewrites.json'));
  const additions = readJson(path.join(HERE, 'additions.json'));
  const overlayDir = path.join(HERE, 'overlay');
  const overlay = {};
  for (const name of fs.readdirSync(overlayDir).filter((f) => f.endsWith('.json')).sort()) {
    for (const [id, fields] of Object.entries(readJson(path.join(overlayDir, name)))) {
      for (const key of Object.keys(fields)) {
        if (overlay[id]?.[key] !== undefined) throw new Error(`المفتاح ${key} للمدخل ${id} معرَّف مرتين في overlay`);
      }
      overlay[id] = { ...overlay[id], ...fields };
    }
  }

  const log = [];
  const problems = [];
  const dropped = new Set(rewrites.filter((r) => r.op === 'drop').map((r) => r.id));
  const entries = new Map();

  for (const item of source) {
    if (dropped.has(item.id)) continue;
    const { permission: legacyPermission, route, ...rest } = item;
    entries.set(item.id, { ...rest });
    if (route) log.push({ id: item.id, field: 'route', removed: route, replacement: '', kind: 'simulation', reason: 'مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق)' });
    if (legacyPermission) {
      log.push({
        id: item.id,
        field: 'permission',
        removed: legacyPermission,
        replacement: overlay[item.id]?.permission ?? '',
        kind: 'schema',
        reason: 'نص الصلاحية الحر استُبدل بقيمة من المجموعة المضبوطة، وما فيه من تفصيل نُقل إلى permissionNote عند الحاجة',
      });
    }
  }
  for (const id of dropped) {
    const item = source.find((s) => s.id === id);
    const op = rewrites.find((r) => r.op === 'drop' && r.id === id);
    if (!item) problems.push(`مدخل محذوف غير موجود في المصدر: ${id}`);
    else log.push({ id, field: '*', removed: `${item.ar} / ${item.en}`, replacement: '', kind: op.kind, reason: op.reason });
  }

  const applied = new Set();
  rewrites.forEach((rw, index) => {
    if (rw.op === 'drop') return;
    const entry = entries.get(rw.id);
    if (!entry) return problems.push(`إعادة صياغة #${index} لمدخل غير موجود: ${rw.id}`);
    const current = entry[rw.field];
    if (typeof current !== 'string') return problems.push(`إعادة صياغة #${index}: الحقل ${rw.field} غير موجود في ${rw.id}`);
    if (rw.from === '*') {
      log.push({ id: rw.id, field: rw.field, removed: current, replacement: rw.to, kind: rw.kind, reason: rw.reason });
      entry[rw.field] = rw.to;
    } else {
      const count = current.split(rw.from).length - 1;
      if (count !== 1) return problems.push(`إعادة صياغة #${index} (${rw.id}.${rw.field}): النص يظهر ${count} مرات لا مرة واحدة: ${rw.from.slice(0, 40)}`);
      log.push({ id: rw.id, field: rw.field, removed: rw.from, replacement: rw.to, kind: rw.kind, reason: rw.reason });
      entry[rw.field] = current.replace(rw.from, rw.to);
    }
    applied.add(index);
  });

  for (const [id, fields] of Object.entries(overlay)) {
    const entry = entries.get(id);
    if (!entry) {
      problems.push(`overlay لمدخل غير موجود: ${id}`);
      continue;
    }
    for (const [key, value] of Object.entries(fields)) {
      if (entry[key] !== undefined) problems.push(`overlay يعيد تعريف حقل موجود ${id}.${key}`);
      else entry[key] = value;
    }
  }
  for (const id of entries.keys()) if (!overlay[id]) problems.push(`مدخل بلا overlay: ${id}`);

  for (const added of additions) {
    if (entries.has(added.id)) problems.push(`مدخل مضاف بمعرّف موجود: ${added.id}`);
    entries.set(added.id, { ...added });
  }

  const output = [];
  for (const entry of entries.values()) {
    if (entry.signature === undefined && entry.kind === 'concept') entry.signature = null;
    if (entry.verification && entry.verification.checkedOn === undefined) entry.verification = { status: entry.verification.status, checkedOn: CHECKED_ON, note: entry.verification.note };
    const ordered = {};
    for (const key of FIELD_ORDER) if (entry[key] !== undefined) ordered[key] = entry[key];
    for (const key of Object.keys(entry)) if (!(key in ordered)) problems.push(`حقل غير متوقع في ${entry.id}: ${key}`);
    for (const key of REQUIRED_FIELDS) if (!(key in ordered)) problems.push(`حقل مطلوب مفقود في ${entry.id}: ${key}`);
    output.push(ordered);
  }

  const data = {
    meta: { schemaVersion: SCHEMA_VERSION, count: output.length, generatedFrom: 'ghsim-source/src/data/explanations.ts مع scripts/glossary/{rewrites,overlay,additions}' },
    entries: output,
  };
  return { data, log, problems };
}

const serialise = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const sourceDir = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1] ?? '') : DEFAULT_SOURCE;
  const check = args.includes('--check');
  const { data, log, problems } = await migrate({ sourceDir });
  if (problems.length > 0) {
    console.error(`تعذّر النقل (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  const targets = [
    [path.join(ROOT, 'src/data/glossary/entries.json'), serialise(data)],
    [path.join(HERE, 'removed-log.json'), serialise(log)],
  ];
  if (check) {
    const stale = targets.filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text);
    for (const [file] of stale) console.error(`يختلف عن الناتج: ${path.relative(ROOT, file)}`);
    console.log(stale.length === 0 ? `مطابق للناتج: ${data.entries.length} مدخلًا و${log.length} بندًا في سجل ما أُزيل` : 'لا يطابق');
    process.exitCode = stale.length === 0 ? 0 : 1;
    return;
  }
  for (const [file, text] of targets) fs.writeFileSync(file, text);
  console.log(`كُتب ${data.entries.length} مدخلًا و${log.length} بندًا في سجل ما أُزيل`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
