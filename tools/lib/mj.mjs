// نظام MJ: قراءة ملفات المراحل (Docs/MJ/stages/MJn.md) وملف الموجات (Docs/MJ/waves.json)، واكتشاف أحدث نسخة لكل مرحلة
// عبر الفروع المحلية، واشتقاق حالات المهام منها، والتحقق من القواعد. تستعمله tools/build.mjs وtools/check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STAGES_DIR = 'Docs/MJ/stages';
export const WAVES_FILE = 'Docs/MJ/waves.json';
export const STAGE_STATUS = ['planned', 'active', 'blocked', 'done'];
export const DELIVERY = ['none', 'branch', 'merged'];
// أنماط تشغيل الموجة: الافتراضي (بلا حقل) جلسة لكل مرحلة ثم /mj-merge؛ و'one-session' للموجة ذات المرحلة الواحدة (AD-34).
export const RUN_MODES = ['one-session'];
export const TASK_WORDS = { 'لم تبدأ': 'not_started', 'جارٍ التنفيذ': 'in_progress', 'متوقفة': 'blocked', 'منفّذة': 'implemented', 'مدمجة': 'done' };
export const TASK_WORD_OF = Object.fromEntries(Object.entries(TASK_WORDS).map(([k, v]) => [v, k]));
export const REQUIRED = ['id', 'title', 'status', 'delivery', 'wave', 'order', 'depends', 'tasks', 'model', 'why_model', 'session', 'branch', 'base', 'updated', 'resume'];

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

export function git(args, cwd = ROOT) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd(); } catch { return null; }
}

// مسار النسخة الرئيسية (أول worktree في القائمة) ونوع المجلد الحالي.
export function repoInfo(cwd = ROOT) {
  const list = git(['worktree', 'list', '--porcelain'], cwd) || '';
  const main = (list.split('\n').find((l) => l.startsWith('worktree ')) || '').slice(9) || cwd;
  const gitDir = git(['rev-parse', '--git-dir'], cwd);
  const common = git(['rev-parse', '--git-common-dir'], cwd);
  const isMain = !!gitDir && !!common && path.resolve(cwd, gitDir) === path.resolve(cwd, common);
  return { main, isMain, branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd), head: git(['rev-parse', '--short', 'HEAD'], cwd) };
}

function parseValue(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean);
  if (v === '' || v === '—' || v === 'null' || v === '~') return null;
  if (/^\d+$/.test(v)) return Number(v);
  return v.replace(/^`(.*)`$/, '$1');
}

export function parseStage(text, file = '') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`لا ترويسة في ${file}`);
  const header = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    header[line.slice(0, i).trim()] = parseValue(line.slice(i + 1));
  }
  const body = text.slice(m[0].length);
  const sections = {};
  let cur = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { cur = h[1].trim(); sections[cur] = []; continue; }
    if (cur) sections[cur].push(line);
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join('\n').trim();
  const tasks = [];
  for (const line of (sections['حالة المهام'] || '').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6 || !/^`?T-\d+\.\d+`?$/.test(cells[1])) continue;
    const id = cells[1].replace(/`/g, '');
    const [word, ...rest] = cells[2].split(':');
    const key = TASK_WORDS[word.trim()];
    const ev = cells[4] === '—' || !cells[4] ? [] : cells[4].split(/[،,]\s*/).map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean);
    tasks.push({ id, word: word.trim(), status: key || null, note: rest.join(':').trim(), summary: cells[3] === '—' ? '' : cells[3], evidence: ev });
  }
  const log = [];
  for (const line of (sections['سجل التنفيذ'] || '').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length >= 5 && /^\d{4}-\d{2}-\d{2}/.test(cells[1])) log.push({ date: cells[1], text: cells[2], evidence: cells[3] });
  }
  const delivered = /### تقرير التسليم/.test(body);
  return { header, sections, tasks, log, delivered, file, raw: text };
}

export function loadWaves(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, WAVES_FILE), 'utf8'));
}

const rank = (h) => DELIVERY.indexOf(h.delivery) * 10 + STAGE_STATUS.indexOf(h.status);

// يجمع نسخ ملف المرحلة من: المجلد الحالي، والنسخة الرئيسية، ورأس فرع المرحلة؛ ويختار الأكثر تقدمًا ثم الأحدث ثم المحلية.
export function discoverStages({ cwd = ROOT, live = true } = {}) {
  const info = repoInfo(cwd);
  const dir = path.join(cwd, STAGES_DIR);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^MJ\d+\.md$/.test(f)).sort((a, b) => Number(a.slice(2, -3)) - Number(b.slice(2, -3))) : [];
  const branches = live ? (git(['branch', '--list', 'mj/*', '--format=%(refname:short) %(objectname:short)'], cwd) || '').split('\n').filter(Boolean).map((l) => l.split(' ')) : [];
  const tags = live ? (git(['tag', '-l', 'mj-*/base', '--format=%(refname:short) %(objectname:short)'], cwd) || '').split('\n').filter(Boolean).map((l) => l.split(' ')) : [];
  const stages = files.map((f) => {
    const rel = `${STAGES_DIR}/${f}`;
    const versions = [];
    const local = parseStage(fs.readFileSync(path.join(cwd, rel), 'utf8'), rel);
    versions.push({ kind: info.isMain ? 'main' : 'cwd', ref: info.isMain ? 'main' : info.branch, stage: local });
    if (live && !info.isMain) {
      const mainText = readIf(path.join(info.main, rel));
      if (mainText) versions.push({ kind: 'main', ref: 'main', stage: parseStage(mainText, rel) });
    }
    if (live && local.header.branch && !(info.isMain === false && info.branch === local.header.branch)) {
      const b = branches.find((x) => x[0] === local.header.branch);
      if (b) { const t = git(['show', `${b[0]}:${rel}`], cwd); if (t) versions.push({ kind: 'branch', ref: b[0], commit: b[1], stage: parseStage(t, rel) }); }
    }
    versions.sort((a, b) => rank(b.stage.header) - rank(a.stage.header) || String(b.stage.header.updated).localeCompare(String(a.stage.header.updated)) || (a.kind === 'cwd' ? -1 : b.kind === 'cwd' ? 1 : 0));
    const best = versions[0];
    return { id: best.stage.header.id, file: rel, header: best.stage.header, tasks: best.stage.tasks, log: best.stage.log, delivered: best.stage.delivered, sections: best.stage.sections, source: { kind: best.kind, ref: best.ref, commit: best.commit || null }, branchExists: branches.some((x) => x[0] === local.header.branch) };
  });
  return { stages, branches: branches.map(([name, commit]) => ({ name, commit })), tags: tags.map(([name, commit]) => ({ name, commit })), repo: info, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') };
}

// خريطة حالات المهام كما يتوقعها derive.js وبقية المولّدات.
export function tasksFromStages(stages) {
  const out = {};
  for (const s of stages) for (const t of s.tasks) {
    const e = { status: t.status || 'not_started', evidence: t.evidence, note: t.note || '' };
    if (t.summary) e.summary = t.summary;
    if (e.status === 'implemented' || e.status === 'done') { if (s.header.commit) e.commit = String(s.header.commit); e.branch = s.header.branch; }
    e.stage = s.id;
    out[t.id] = e;
  }
  return out;
}

export function validateMJ(plan, mj, waves) {
  const errors = [];
  const err = (m) => errors.push(`MJ: ${m}`);
  const ixT = Object.fromEntries(plan.tasks.map((t) => [t.id, t]));
  const ixD = Object.fromEntries(plan.decisions.map((d) => [d.id, d]));
  const letters = waves.waves.map((w) => w.id);
  const stageOf = {};
  const byId = {};
  let prevNum = 0, prevWaveIx = -1;
  for (const s of mj.stages) {
    const h = s.header;
    const num = Number(String(h.id).replace('MJ', ''));
    if (s.file !== `${STAGES_DIR}/${h.id}.md`) err(`${s.file}: المعرّف ${h.id} لا يطابق اسم الملف`);
    if (byId[h.id]) err(`${h.id}: معرّف مكرر`);
    byId[h.id] = s;
    if (num !== prevNum + 1) err(`${h.id}: الترقيم غير متسلسل بعد MJ${prevNum}`);
    prevNum = num;
    for (const k of REQUIRED) if (h[k] === undefined) err(`${h.id}: الحقل ${k} مفقود في الترويسة`);
    if (!STAGE_STATUS.includes(h.status)) err(`${h.id}: status غير صالح ${h.status}`);
    if (!DELIVERY.includes(h.delivery)) err(`${h.id}: delivery غير صالح ${h.delivery}`);
    if (h.status === 'done' && h.delivery !== 'merged') err(`${h.id}: done يشترط delivery: merged`);
    if (h.delivery === 'merged' && h.status !== 'done') err(`${h.id}: merged يشترط status: done`);
    if (h.status === 'planned' && h.delivery !== 'none') err(`${h.id}: planned يشترط delivery: none`);
    if ((h.delivery === 'branch' || h.delivery === 'merged') && !h.commit) err(`${h.id}: التسليم بلا مرجع التزام`);
    if (h.delivery === 'branch' && !s.delivered) err(`${h.id}: delivery: branch بلا «تقرير التسليم» في الملف`);
    if (h.session !== 'worktree') err(`${h.id}: session يجب أن تكون worktree (كل مرحلة في جلسة مستقلة)`);
    if (!/^mj\/\d+-[a-z0-9-]+$/.test(String(h.branch))) err(`${h.id}: اسم الفرع ${h.branch} لا يطابق mj/<n>-<slug>`);
    if (String(h.branch).split('/')[1].split('-')[0] !== String(num)) err(`${h.id}: رقم الفرع لا يطابق رقم المرحلة`);
    if (h.base !== `mj-${h.wave}/base`) err(`${h.id}: الأساس ${h.base} لا يطابق mj-${h.wave}/base`);
    const wIx = letters.indexOf(h.wave);
    if (wIx < 0) err(`${h.id}: الموجة ${h.wave} غير معرّفة في waves.json`);
    if (wIx < prevWaveIx) err(`${h.id}: ترتيب الموجات لا يتبع ترقيم المراحل`);
    prevWaveIx = Math.max(prevWaveIx, wIx);
    for (const t of h.tasks || []) {
      if (!ixT[t]) { err(`${h.id}: مهمة غير معرّفة ${t}`); continue; }
      if (stageOf[t]) err(`المهمة ${t} في ${stageOf[t]} و${h.id} معًا`);
      stageOf[t] = h.id;
    }
    const rowIds = s.tasks.map((t) => t.id);
    if (JSON.stringify([...rowIds].sort()) !== JSON.stringify([...(h.tasks || [])].sort())) err(`${h.id}: جدول «حالة المهام» لا يطابق قائمة tasks في الترويسة`);
    for (const t of s.tasks) {
      if (!t.status) err(`${h.id}: حالة غير معروفة «${t.word}» للمهمة ${t.id}`);
      if (t.status === 'done' && !t.evidence.length) err(`${h.id}: ${t.id} مدمجة بلا دليل`);
      if (t.status === 'blocked' && !t.note) err(`${h.id}: ${t.id} متوقفة بلا سبب`);
      if (h.status === 'planned' && t.status !== 'not_started') err(`${h.id}: مرحلة لم تبدأ وفيها ${t.id} بحالة ${t.word}`);
      if (h.delivery === 'merged' && t.status !== 'done') err(`${h.id}: مرحلة مدمجة وفيها ${t.id} بحالة ${t.word}`);
      if (h.delivery === 'branch' && !['implemented', 'blocked'].includes(t.status)) err(`${h.id}: جاهزة للدمج وفيها ${t.id} بحالة ${t.word}`);
      if (h.delivery !== 'merged' && t.status === 'done') err(`${h.id}: ${t.id} مدمجة والمرحلة لم تُدمج`);
      if (t.status && t.status !== 'not_started' && t.status !== 'blocked' && ixT[t.id]) for (const g of ixT[t.id].decisions) if (g.gate === 'start' && ixD[g.id]?.status !== 'approved') err(`${h.id}: ${t.id} بدأت وقرارها ${g.id} الموقِف للبدء معلّق`);
    }
    if (h.delivery === 'branch' && !s.tasks.some((t) => t.status === 'implemented')) err(`${h.id}: جاهزة للدمج بلا مهمة منفّذة`);
  }
  for (const t of plan.tasks) if (!stageOf[t.id]) err(`المهمة ${t.id} غير مشمولة في أي مرحلة`);
  // الاعتماديات: مهمة تعتمد على مهمة في المرحلة نفسها (تسلسل) أو في مرحلة من موجة أسبق؛ ولا تعتمد على مرحلة في الموجة نفسها.
  for (const s of mj.stages) {
    const h = s.header;
    const wIx = letters.indexOf(h.wave);
    const needStages = new Set();
    for (const t of h.tasks || []) for (const d of ixT[t]?.deps || []) {
      const ds = stageOf[d];
      if (!ds) continue;
      if (ds === h.id) continue;
      needStages.add(ds);
      const dw = letters.indexOf(byId[ds].header.wave);
      if (dw === wIx) err(`${h.id}: ${t} تعتمد على ${d} في ${ds} من الموجة نفسها (لا توازٍ متعارض)`);
      if (dw > wIx) err(`${h.id}: ${t} تعتمد على ${d} في ${ds} من موجة لاحقة`);
    }
    const declared = new Set(h.depends || []);
    for (const x of needStages) if (!declared.has(x)) err(`${h.id}: depends تنقصها ${x}`);
    for (const x of declared) if (!byId[x]) err(`${h.id}: depends تذكر مرحلة غير معرّفة ${x}`); else if (!needStages.has(x)) err(`${h.id}: depends تذكر ${x} دون اعتمادية مهام فعلية`);
    // مرحلة بدأت واعتمادياتها لم تُدمج
    if (h.status !== 'planned') for (const x of declared) if (byId[x] && byId[x].header.delivery !== 'merged') err(`${h.id}: بدأت و${x} لم تُدمج بعد`);
    if (h.status !== 'planned' && !mj.tags.some((t) => t.name === h.base) && mj.repo) err(`${h.id}: بدأت ووسم الأساس ${h.base} غير موجود`);
  }
  // الموجات
  const seenW = new Set();
  for (const w of waves.waves) {
    if (seenW.has(w.id)) err(`waves: موجة مكررة ${w.id}`);
    seenW.add(w.id);
    const inWave = mj.stages.filter((s) => s.header.wave === w.id).sort((a, b) => a.header.order - b.header.order);
    if (!inWave.length) err(`waves: الموجة ${w.id} بلا مراحل`);
    const orders = inWave.map((s) => s.header.order);
    if (new Set(orders).size !== orders.length) err(`waves: ترتيب دمج مكرر في الموجة ${w.id}`);
    if (JSON.stringify(inWave.map((s) => s.id)) !== JSON.stringify(w.order)) err(`waves: order في الموجة ${w.id} لا يطابق مراحلها بترتيب order: ${inWave.map((s) => s.id).join('، ')}`);
    if (!w.merge_model) err(`waves: الموجة ${w.id} بلا merge_model`);
    if (!w.gate) err(`waves: الموجة ${w.id} بلا وصف للفحص (gate)`);
    // AD-34: موجة بمرحلة واحدة تُنفَّذ وتُراجَع ذاتيًا وتُدمج محليًا في جلسة مرحلتها.
    if (w.run !== undefined && !RUN_MODES.includes(w.run)) err(`waves: نمط تشغيل غير معروف ${w.run} في الموجة ${w.id}`);
    if (w.run === 'one-session' && w.order.length !== 1) err(`waves: الموجة ${w.id} بجلسة واحدة ولها ${w.order.length} مراحل (AD-34 للموجة ذات المرحلة الواحدة)`);
  }
  if (!waves.default_model || !waves.commands?.start?.includes('{id}') || !waves.commands?.merge?.includes('{wave}')) err('waves: default_model وأمرا البدء {id} والدمج {wave} مطلوبة');
  return errors;
}
