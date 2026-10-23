// قراءة الجداول والكتل المهيكلة من EXECUTION_PLAN.md.
// يستعملها check.mjs لمطابقة الوثيقة مع data/plan.json، فلا تكون الوثيقة مصدرًا ثانيًا مختلفًا.

const ID = {
  task: /`(T-\d+\.\d+)`/g,
  feature: /`(F-[A-H]\d)`/g,
  ac: /`(AC-[A-Z0-9.]+)`/g,
  test: /`(TEST-[A-Z0-9-]+)`/g,
  dec: /`(DEC-\d+)`/g,
  blk: /`(BLK-[A-Z0-9-]+)`/g,
  hyp: /`(HYP-\d+)`/g,
};

export function ids(text, kind) {
  const re = new RegExp(ID[kind].source, 'g');
  const out = [];
  for (const m of String(text ?? '').matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function cells(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/\s\|\s/).map((c) => c.trim());
}

function section(md, startHeading, endHeading) {
  const a = md.indexOf(startHeading);
  if (a < 0) throw new Error(`لم يُعثر على العنوان: ${startHeading}`);
  const b = endHeading ? md.indexOf(endHeading, a + startHeading.length) : md.length;
  return md.slice(a, b < 0 ? md.length : b);
}

export function parseFeatureMatrix(md) {
  const sec = section(md, '### 2.2 ', '### 2.3 ');
  return sec.split('\n').filter((l) => /^\| \*\*.+?\*\* \| `F-/.test(l)).map((l) => {
    const c = cells(l);
    return {
      moduleLetter: c[0].replace(/\*/g, ''),
      id: ids(c[1], 'feature')[0],
      title: c[2],
      reqRef: c[3],
      specRef: c[4],
      statusText: c[5],
      task: ids(c[6], 'task')[0],
      supportTasks: ids(c[7], 'task'),
      ac: ids(c[8], 'ac'),
      tests: ids(c[9], 'test'),
    };
  });
}

export function parseTasks(md) {
  const sec = section(md, '## 6. ', '### 6.12 ');
  const blocks = sec.split(/\n(?=#### `T-\d+\.\d+`)/).slice(1);
  return blocks.map((b) => {
    const lines = b.split('\n');
    const head = lines[0].match(/^#### `(T-\d+\.\d+)` — (.*)$/);
    const task = { id: head[1], title: head[2].trim(), ac: [], blockers: [] };
    let mode = null;
    for (const line of lines.slice(1)) {
      if (/^#{2,3} /.test(line)) break;
      const top = line.match(/^\* \*\*(.+?):\*\*\s*(.*)$/);
      if (top) {
        const [, key, val] = top;
        mode = null;
        if (key === 'التصنيف') {
          const parts = val.split(' | ');
          task.typeText = parts[0].replace('النوع: ', '').trim();
          task.moduleText = (parts[1] || '').replace('الوحدة: ', '').trim();
          task.features = ids(parts[2] || '', 'feature');
        } else if (key.startsWith('الهدف')) task.goal = val;
        else if (key.startsWith('فرعا المهمة')) task.branches = val;
        else if (key === 'تعتمد على') task.deps = ids(val, 'task');
        else if (key === 'قرار معلق يخصها') { task.decisions = ids(val, 'dec'); task.decisionText = val; }
        else if (key === 'معايير القبول') mode = 'ac';
        else if (key === 'الاختبارات') task.tests = ids(val, 'test');
        else if (key === 'المخرجات') task.outputsText = val;
        else if (key === 'الموانع المسماة') mode = 'blk';
        else if (key === 'ملاحظة') task.note = val;
        else if (key.startsWith('تفتح')) task.opensText = val;
        continue;
      }
      const sub = line.match(/^\s+\* `([A-Z]+-[A-Z0-9.-]+)`(?: \(([^)]*)\))?: (.*)$/);
      if (sub && mode === 'ac') task.ac.push({ id: sub[1], branch: sub[2] || null, text: sub[3] });
      else if (sub && mode === 'blk') task.blockers.push({ id: sub[1], text: sub[3] });
    }
    task.features ??= [];
    task.deps ??= [];
    task.decisions ??= [];
    task.tests ??= [];
    return task;
  });
}

export function parseDependencyTable(md) {
  const sec = section(md, '### 6.12 ', '### 6.13 ');
  const rows = sec.split('\n').filter((l) => /^\| `T-\d+\.\d+` \| /.test(l));
  return rows.map((l) => {
    const c = cells(l);
    return { id: ids(c[0], 'task')[0], module: c[1], deps: ids(c[2], 'task'), opens: ids(c[3], 'task'), decisions: ids(c[4], 'dec') };
  });
}

export function parseBlockerRegistry(md) {
  const sec = section(md, '**سجل الموانع المسماة:**', '### 6.13 ');
  return sec.split('\n').filter((l) => /^\| `BLK-/.test(l)).map((l) => {
    const c = cells(l);
    return { id: ids(c[0], 'blk')[0], tasks: ids(c[1], 'task'), text: c[2], continues: c[3] };
  });
}

export function parseBudgets(md) {
  const sec = section(md, '### 6.13 ', '## 7. ');
  const pb = sec.split('\n').filter((l) => /^\| `PB-\d+` \|/.test(l)).map((l) => {
    const c = cells(l);
    return { id: c[0].replace(/`/g, ''), what: c[1], span: c[2], conditions: c[3], target: c[4].replace(/`/g, ''), tasks: ids(c[5], 'task'), tests: ids(c[6], 'test') };
  });
  const pp = sec.split('\n').filter((l) => /^\| `PP-\d+` \|/.test(l)).map((l) => {
    const c = cells(l);
    return { id: c[0].replace(/`/g, ''), name: c[1], default: c[2], text: c[3], tasks: ids(c[4], 'task'), tests: ids(c[5], 'test') };
  });
  return { pb, pp };
}

export function parseTests(md) {
  const sec = section(md, '### 7.3 ', '## 8. ');
  return sec.split('\n').filter((l) => /^\| `TEST-[A-Z0-9-]+` \|/.test(l)).map((l) => {
    const c = cells(l);
    return { id: ids(c[0], 'test')[0], level: c[1], env: c[2], checks: c[3], tasks: ids(c[4], 'task'), features: ids(c[5], 'feature') };
  });
}

export function parseFixtures(md) {
  const sec = section(md, '### 7.1 ', '### 7.2 ');
  return sec.split('\n').filter((l) => /^\| (`fixture-|محرك ترجمة وهمي)/.test(l)).map((l) => {
    const c = cells(l);
    const names = [...c[0].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    return { id: names.length ? names.join(' + ') : c[0], files: names, content: c[1], usedBy: c[2] };
  });
}

export function parseHypotheses(md) {
  const sec = section(md, '### 8.2 ', '## 9. ');
  return sec.split('\n').filter((l) => /^\| `HYP-\d+` \|/.test(l)).map((l) => {
    const c = cells(l);
    return { id: ids(c[0], 'hyp')[0], text: c[1], why: c[2], task: ids(c[3], 'task')[0], ac: ids(c[4], 'ac'), ifFalse: c[5] };
  });
}

export function parseVerified(md) {
  const sec = section(md, '#### أولًا: حقائق متحقق منها', '#### ثانيًا');
  return sec.split('\n').filter((l) => /^\| `VER-\d+` \|/.test(l)).map((l) => {
    const c = cells(l);
    const link = c[3].match(/\[([^\]]+)\]\(([^)]+)\)/);
    return { id: c[0].replace(/`/g, ''), area: c[1], text: c[2], source: link ? { title: link[1], url: link[2] } : { title: c[3], url: null } };
  });
}

export function parseRisks(md) {
  const sec = section(md, '### 8.1 ', '### 8.2 ');
  return sec.split('\n').filter((l) => /^\| \*\*`(RISK|UNVERIFIED)-/.test(l)).map((l) => {
    const c = cells(l);
    return { id: c[0].replace(/[*`]/g, ''), category: c[1], text: c[2].replace(/\*\*/g, ''), impact: c[3], mitigation: c[4] };
  });
}

export function parseProposals(md) {
  const sec = section(md, '## 10. ');
  return sec.split('\n').filter((l) => /^\d+\. \*\*`P-OPT-\d+`/.test(l)).map((l) => {
    const m = l.match(/^\d+\. \*\*`(P-OPT-\d+)` — (.+?):\*\* (.*)$/);
    return { id: m[1], title: m[2], text: m[3] };
  });
}

export function parseModules(md) {
  const out = [];
  for (const m of md.matchAll(/^### 3\.(.+?) الوحدة \((.+?)\): (.+?) \(`(F-[A-H])\d` إلى `F-[A-H]\d`\)$/gm)) {
    out.push({ letter: m[2], title: m[3].trim(), code: m[4].slice(2) });
  }
  return out;
}

export function parsePhaseHeadings(md) {
  const out = [];
  for (const m of md.matchAll(/^### 6\.(\d+) المرحلة (\d+): (.+)$/gm)) out.push({ num: Number(m[2]), title: m[3].trim() });
  return out;
}

// جدول القرارات القديم (قبل نقله إلى DECISIONS.md) — يُستعمل في الترحيل فقط.
export function parseLegacyDecisions(md) {
  const sec = section(md, '## 9. ', '### 9.1 ');
  return sec.split('\n').filter((l) => /^\| \*\*`DEC-\d+`\*\* \|/.test(l)).map((l) => {
    const c = cells(l);
    const [topic, ...scope] = c[1].split('<br>');
    const options = c[2].split('<br>').map((o) => o.replace(/^•\s*/, '').trim()).filter(Boolean).map((o) => {
      const m = o.match(/^\*\*(.+?)\s—\s(.+?)(?::)?\*\*:?\s*(.*)$/);
      return m ? { key: m[1].trim(), title: m[2].replace(/:$/, '').trim(), impact: m[3].trim() } : { key: '', title: o, impact: '' };
    });
    return { id: ids(c[0], 'dec')[0], topic: topic.replace(/\*\*/g, '').trim(), scope: scope.join(' ').trim(), options, blocksText: c[3], recommendationText: c[4] };
  });
}

export function parseCounts(md) {
  const sec = section(md, '### 2.1 ', '### 2.2 ');
  const out = {};
  for (const l of sec.split('\n').filter((x) => /^\| .+ \| \d+( \/ \d+)? \|/.test(x))) {
    const c = cells(l);
    out[c[0]] = c[1];
  }
  return out;
}
