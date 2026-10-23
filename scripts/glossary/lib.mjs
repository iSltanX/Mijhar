// التحقق من بيانات القاموس (AC-3.1 / TEST-GLOSS-05): دوال خالصة تُستعمل من validate.mjs ومن الاختبارات.
import fs from 'node:fs';
import path from 'node:path';
import {
  CATEGORIES,
  DOCS_URL_PREFIX,
  ENTRY_KINDS,
  LENGTH_LIMITS,
  OPTIONAL_FIELDS,
  PAGE_KINDS,
  PERMISSION_LEVELS,
  REQUIRED_FIELDS,
  REVERSIBILITY,
  SAFETY_LEVELS,
  SCHEMA_VERSION,
  SIGNATURE_ROLES,
  SIMULATION_PATTERNS,
  VERIFICATION_STATUSES,
} from '../../src/data/glossary/schema.mjs';

/** حقول نصية تُفحص فيها عبارات المحاكاة والمصطلحات الممنوعة. */
export const TEXT_FIELDS = ['ar', 'en', 'brief', 'medium', 'detailed', 'example', 'permissionNote', 'whenToUse', 'reversalLimits'];

const ARABIC_LETTER = /[ء-ي]/;
const LATIN_LETTER = /[A-Za-z]/;
const ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COUNT_LINE = /عدد المدخلات:\s*(\d+)/;
// إزالة التشكيل والتطويل قبل مقارنة العربية.
const normalizeArabic = (text) => text.replace(/[ً-ْـ]/g, '');

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const rangeOf = (value, allowed) => Array.isArray(value) && value.length > 0 && value.every((v) => allowed.includes(v)) && new Set(value).size === value.length;

/**
 * @typedef {{ id: string, rule: string, message: string }} Problem
 * @param {{ data: any, lexicon: any, coreIds: any, removedLog: any, readme?: string }} input
 * @returns {{ errors: Problem[], stats: Record<string, any> }}
 */
export function validateGlossary({ data, lexicon, coreIds, removedLog, readme }) {
  /** @type {Problem[]} */
  const errors = [];
  const fail = (id, rule, message) => errors.push({ id, rule, message });

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (!Array.isArray(data?.entries)) fail('*', 'schema', 'الملف بلا مصفوفة entries');
  if (!isObject(data?.meta)) fail('*', 'schema', 'الملف بلا meta');
  else {
    if (data.meta.schemaVersion !== SCHEMA_VERSION) fail('*', 'schema', `schemaVersion يجب أن يكون ${SCHEMA_VERSION}`);
    if (data.meta.count !== entries.length) fail('*', 'count', `العدد المعلن في meta (${data.meta.count}) لا يطابق الفعلي (${entries.length})`);
  }
  if (readme !== undefined) {
    const declared = COUNT_LINE.exec(readme);
    if (!declared) fail('*', 'count', 'README بلا سطر «عدد المدخلات: N»');
    else if (Number(declared[1]) !== entries.length) fail('*', 'count', `العدد المعلن في README (${declared[1]}) لا يطابق الفعلي (${entries.length})`);
  }

  const seen = new Set();
  const allowedKeys = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  for (const entry of entries) {
    const id = isNonEmptyString(entry?.id) ? entry.id : '?';
    if (!isObject(entry)) {
      fail(id, 'schema', 'المدخل ليس كائنًا');
      continue;
    }
    for (const key of REQUIRED_FIELDS) if (!(key in entry)) fail(id, 'schema', `حقل مطلوب مفقود: ${key}`);
    for (const key of Object.keys(entry)) if (!allowedKeys.has(key)) fail(id, 'schema', `حقل غير معرّف في المخطط: ${key}`);

    if (!ID_PATTERN.test(id)) fail(id, 'schema', 'المعرّف يجب أن يطابق [a-z][a-z0-9_-]*');
    if (seen.has(id)) fail(id, 'duplicate-id', 'معرّف مكرر');
    seen.add(id);

    if (!ENTRY_KINDS.includes(entry.kind)) fail(id, 'enum', `kind خارج المجموعة: ${entry.kind}`);
    if (!CATEGORIES.includes(entry.category)) fail(id, 'enum', `category خارج المجموعة: ${entry.category}`);
    if (!SAFETY_LEVELS.includes(entry.safety)) fail(id, 'enum', `safety خارج المجموعة: ${entry.safety}`);
    if (!REVERSIBILITY.includes(entry.reversible)) fail(id, 'enum', `reversible خارج المجموعة: ${entry.reversible}`);
    if (!PERMISSION_LEVELS.includes(entry.permission)) fail(id, 'enum', `الصلاحية خارج المجموعة المضبوطة: ${entry.permission}`);

    if (!(isNonEmptyString(entry.ar) && ARABIC_LETTER.test(entry.ar))) fail(id, 'schema', 'ar يجب أن يحوي حروفًا عربية');
    if (!(isNonEmptyString(entry.en) && LATIN_LETTER.test(entry.en) && !ARABIC_LETTER.test(entry.en))) fail(id, 'schema', 'en يجب أن يكون لاتينيًا فقط');

    for (const [field, { min, max }] of Object.entries(LENGTH_LIMITS)) {
      const value = entry[field];
      if (value === undefined) continue;
      if (!isNonEmptyString(value)) fail(id, 'schema', `${field} ليس نصًا`);
      else if (value.trim().length < min || value.trim().length > max) fail(id, 'length', `طول ${field} (${value.trim().length}) خارج [${min}, ${max}]`);
    }
    if (entry.permissionNote !== undefined && !isNonEmptyString(entry.permissionNote)) fail(id, 'schema', 'permissionNote فارغ');
    if (isNonEmptyString(entry.brief) && (entry.brief === entry.medium || entry.medium === entry.detailed)) fail(id, 'schema', 'المستويات الثلاثة يجب أن تختلف');

    // المصدر
    if (entry.docsUrl !== null) {
      if (typeof entry.docsUrl !== 'string' || !entry.docsUrl.startsWith(DOCS_URL_PREFIX) || /\s|\?/.test(entry.docsUrl) || entry.docsUrl.endsWith('/')) {
        fail(id, 'docs', `docsUrl يجب أن يبدأ بـ${DOCS_URL_PREFIX} بلا مسافات ولا استعلام ولا شرطة أخيرة: ${entry.docsUrl}`);
      }
    }
    const v = entry.verification;
    if (!isObject(v)) fail(id, 'verification', 'verification مفقود');
    else {
      if (!VERIFICATION_STATUSES.includes(v.status)) fail(id, 'verification', `status خارج المجموعة: ${v.status}`);
      if (!(typeof v.checkedOn === 'string' && DATE_PATTERN.test(v.checkedOn))) fail(id, 'verification', 'checkedOn يجب أن يكون YYYY-MM-DD');
      if (!isNonEmptyString(v.note)) fail(id, 'verification', 'note مطلوبة');
      if (v.status === 'verified' && entry.docsUrl === null) fail(id, 'verification', 'لا تحقق بلا docsUrl');
    }

    // التوقيع الدلالي
    if (entry.kind === 'concept' && entry.signature !== null) fail(id, 'signature', 'المصطلح من نوع concept يجب أن يكون توقيعه null');
    if (entry.kind === 'element') {
      const s = entry.signature;
      if (!isObject(s)) fail(id, 'signature', 'عنصر الواجهة يحتاج توقيعًا');
      else {
        if (!(Array.isArray(s.labels) && s.labels.length > 0 && s.labels.every(isNonEmptyString) && new Set(s.labels.map((l) => l.toLowerCase())).size === s.labels.length)) {
          fail(id, 'signature', 'labels يجب أن تكون نصوصًا غير فارغة وغير مكررة');
        }
        if (!rangeOf(s.roles, SIGNATURE_ROLES)) fail(id, 'signature', 'roles خارج المجموعة أو فارغة أو مكررة');
        if (!rangeOf(s.pages, PAGE_KINDS)) fail(id, 'signature', 'pages خارج المجموعة أو فارغة أو مكررة');
        if (s.hrefPatterns !== undefined) {
          if (!Array.isArray(s.hrefPatterns) || s.hrefPatterns.length === 0) fail(id, 'signature', 'hrefPatterns فارغة');
          else {
            for (const pattern of s.hrefPatterns) {
              try {
                new RegExp(pattern);
              } catch {
                fail(id, 'signature', `hrefPatterns نمط غير صالح: ${pattern}`);
              }
            }
          }
        }
        for (const key of Object.keys(s)) if (!['labels', 'roles', 'pages', 'hrefPatterns'].includes(key)) fail(id, 'signature', `حقل غير معرّف في التوقيع: ${key}`);
      }
    }

    // عبارات المحاكاة
    for (const field of TEXT_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string') continue;
      for (const pattern of SIMULATION_PATTERNS) {
        if (value.toLowerCase().includes(pattern.toLowerCase())) fail(id, 'simulation', `عبارة محاكاة «${pattern}» في ${field}`);
      }
    }
  }

  // المعجم الموحد
  const terms = Array.isArray(lexicon?.terms) ? lexicon.terms : [];
  const keepEnglish = Array.isArray(lexicon?.keepEnglish) ? lexicon.keepEnglish : [];
  const byEnglish = new Map();
  for (const term of terms) {
    if (!(isNonEmptyString(term?.en) && isNonEmptyString(term?.ar) && Array.isArray(term?.stems) && term.stems.length > 0 && Array.isArray(term?.variants))) {
      fail('lexicon', 'lexicon', `مدخل معجم ناقص: ${JSON.stringify(term)}`);
      continue;
    }
    const key = term.en.toLowerCase();
    if (byEnglish.has(key)) fail('lexicon', 'lexicon', `مصطلح مكرر في المعجم: ${term.en}`);
    byEnglish.set(key, term);
    for (const alias of term.aliases ?? []) {
      const aliasKey = alias.toLowerCase();
      if (byEnglish.has(aliasKey)) fail('lexicon', 'lexicon', `اسم بديل مكرر في المعجم: ${alias}`);
      else byEnglish.set(aliasKey, term);
    }
    for (const name of [term.en, ...(term.aliases ?? [])]) {
      if (keepEnglish.some((k) => k.toLowerCase() === name.toLowerCase())) fail('lexicon', 'lexicon', `«${name}» في المعجم وفي قائمة الإبقاء بالإنجليزية معًا`);
    }
  }
  if (!Array.isArray(lexicon?.keepEnglish) || keepEnglish.length === 0 || !keepEnglish.every(isNonEmptyString)) fail('lexicon', 'lexicon', 'keepEnglish مفقودة أو فارغة');

  const arabicByEnglish = new Map();
  for (const entry of entries) {
    if (!isObject(entry) || typeof entry.en !== 'string' || typeof entry.ar !== 'string') continue;
    const key = entry.en.toLowerCase();
    if (arabicByEnglish.has(key) && arabicByEnglish.get(key) !== entry.ar) fail(entry.id, 'lexicon', `«${entry.en}» بترجمتين عربيتين مختلفتين: «${arabicByEnglish.get(key)}» و«${entry.ar}»`);
    arabicByEnglish.set(key, entry.ar);
  }

  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const id = entry.id;
    const term = typeof entry.en === 'string' ? byEnglish.get(entry.en.toLowerCase()) : undefined;
    if (term && entry.ar !== term.ar) fail(id, 'lexicon', `ar «${entry.ar}» يخالف المعجم لـ${term.en}: «${term.ar}»`);

    for (const field of TEXT_FIELDS) {
      const value = entry[field];
      if (typeof value !== 'string') continue;
      for (const t of terms) {
        for (const variant of t.variants ?? []) {
          if (value.includes(variant)) fail(id, 'lexicon', `صيغة غير معتمدة «${variant}» في ${field}؛ المعتمد لـ${t.en}: «${t.ar}»`);
        }
      }
      // «عربي (English)»: العربي قبل القوسين يحمل جذر الصيغة المعتمدة.
      for (const m of normalizeArabic(value).matchAll(/((?:[؀-ۿ]+\s){0,3}[؀-ۿ]+)\s?\(([A-Za-z][A-Za-z0-9 ./-]*)\)/g)) {
        const t = byEnglish.get(m[2].toLowerCase()) ?? byEnglish.get(m[2].toLowerCase().replace(/s$/, ''));
        if (!t) continue;
        const before = m[1];
        if (!t.stems.some((stem) => before.includes(normalizeArabic(stem)))) {
          fail(id, 'lexicon', `«${before} (${m[2]})» في ${field}: المعتمد لـ${t.en} «${t.ar}»`);
        }
      }
    }
  }

  // المصطلحات الأساسية
  const core = Array.isArray(coreIds) ? coreIds : [];
  if (!Array.isArray(coreIds) || core.length === 0) fail('core', 'core', 'قائمة المصطلحات الأساسية مفقودة أو فارغة');
  const byId = new Map(entries.filter(isObject).map((e) => [e.id, e]));
  if (new Set(core).size !== core.length) fail('core', 'core', 'معرّفات مكررة في قائمة المصطلحات الأساسية');
  for (const id of core) {
    const entry = byId.get(id);
    if (!entry) fail(id, 'core', 'معرّف في قائمة الأساسية غير موجود في القاموس');
    else if (!isNonEmptyString(entry.example)) fail(id, 'core', 'مصطلح أساسي بلا مثال عملي');
  }
  for (const entry of entries) {
    if (isObject(entry) && (entry.safety === 'حساس' || entry.safety === 'خطر') && !core.includes(entry.id)) {
      fail(entry.id, 'core', `مدخل «${entry.safety}» يجب أن يكون في قائمة المصطلحات الأساسية`);
    }
  }

  // سجل ما أُزيل
  const log = Array.isArray(removedLog) ? removedLog : [];
  if (!Array.isArray(removedLog)) fail('removed', 'removed', 'سجل ما أُزيل مفقود');
  for (const item of log) {
    if (!(isObject(item) && isNonEmptyString(item.id) && isNonEmptyString(item.field) && isNonEmptyString(item.removed) && isNonEmptyString(item.reason))) {
      fail('removed', 'removed', `بند ناقص في سجل ما أُزيل: ${JSON.stringify(item)}`);
    }
  }

  const tally = (key) => entries.reduce((acc, e) => ({ ...acc, [e?.[key]]: (acc[e?.[key]] ?? 0) + 1 }), {});
  const simulationRemovals = log.filter((item) => item.kind === 'simulation');
  const stats = {
    count: entries.length,
    byCategory: tally('category'),
    bySafety: tally('safety'),
    byKind: tally('kind'),
    byPermission: tally('permission'),
    core: core.length,
    docsLinks: entries.filter((e) => e?.docsUrl).length,
    verified: entries.filter((e) => e?.verification?.status === 'verified').length,
    unverified: entries.filter((e) => e?.verification?.status === 'unverified').length,
    lexiconTerms: terms.length,
    keepEnglish: keepEnglish.length,
    simulationRemovals: simulationRemovals.length,
    simulationEntries: new Set(simulationRemovals.map((item) => item.id)).size,
    otherRemovals: log.length - simulationRemovals.length,
  };
  return { errors, stats };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** يقرأ ملفات القاموس من مواضعها المعتمدة. */
export function loadGlossaryFiles(root) {
  const dataDir = path.join(root, 'src/data/glossary');
  return {
    data: readJson(path.join(dataDir, 'entries.json')),
    lexicon: readJson(path.join(dataDir, 'lexicon.json')),
    coreIds: readJson(path.join(dataDir, 'core-terms.json')),
    removedLog: readJson(path.join(root, 'scripts/glossary/removed-log.json')),
    readme: fs.readFileSync(path.join(dataDir, 'README.md'), 'utf8'),
  };
}

export function formatReport({ errors, stats }) {
  const lines = [
    `عدد المدخلات: ${stats.count}`,
    `عبارات المحاكاة المُزالة: ${stats.simulationRemovals} بندًا في ${stats.simulationEntries} مدخلًا (وبنود تنقيح أخرى: ${stats.otherRemovals})`,
    `التصنيفات: ${JSON.stringify(stats.byCategory)}`,
    `الحساسية: ${JSON.stringify(stats.bySafety)}`,
    `الأنواع: ${JSON.stringify(stats.byKind)}`,
    `الصلاحيات: ${JSON.stringify(stats.byPermission)}`,
    `المصطلحات الأساسية: ${stats.core}`,
    `روابط الوثائق: ${stats.docsLinks} · طوبقت على المصدر: ${stats.verified} · لم تُطابَق: ${stats.unverified}`,
    `المعجم: ${stats.lexiconTerms} مصطلحًا · تبقى بالإنجليزية: ${stats.keepEnglish}`,
  ];
  if (errors.length === 0) lines.push('النتيجة: اجتاز التحقق من المخطط لكل مدخل');
  else {
    lines.push(`النتيجة: ${errors.length} مخالفة`);
    for (const e of errors) lines.push(`  [${e.rule}] ${e.id}: ${e.message}`);
  }
  return lines.join('\n');
}
