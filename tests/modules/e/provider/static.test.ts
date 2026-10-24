// فحص ساكن لطبقة المزوّد وعرض التحليل:
//  - AD-31: لا سعر ولا تكلفة ولا حاسبة ولا رابط أسعار ولا حد إنفاق في الشيفرة (بعد حذف التعليقات) ولا في نصوص الواجهة.
//  - AC-E9 (٣): لا معرّف مودل مثبت في الشيفرة؛ المودلات من المزوّد وقت التشغيل.
//  - AC-E9 (٦) وTEST-AI-02: الأقسام (d/analysis وd/log-parser وd/pr-status) لا تعرف محوّلًا بعينه ولا مضيفه ولا خدمة الخلفية؛ فإضافة محوّل لا تمسها.
//  - العزل: ما يصل سكربت المحتوى من الطبقة (index.ts) لا يستورد البطاقة ولا الخدمة ولا سجل المحوّلات ولا مفاتيح الأسرار.
//  - MJ23 (AC-E10 (١)، I-2): ترويسات المحوّلات ومساراتها في adapters/ وحدها من المصدر، والسجل الوصفي لا يستورد محوّلًا؛ والفحص على الحزمة المبنية
//    (background.js وحده) في scripts/network-audit.mjs بعلامات PROVIDER_ADAPTER_MARKERS. و(٤) DEC-13: لا اسم مودل ولا نمط اسم في شيفرة الطبقة.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROVIDER_ADAPTER_MARKERS } from '../../../../scripts/network-audit.mjs';
import { PROVIDER_ADAPTERS } from '../../../../src/modules/e/provider/registry';
import { ROOT } from '../helpers';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const rel = (file: string): string => path.relative(ROOT, file).split(path.sep).join('/');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');
const ALL = walk(path.join(ROOT, 'src')).map(rel);

const ANALYSIS_PATH = ALL.filter((p) => /^src\/modules\/(e\/provider|d\/analysis)\//.test(p)).concat([
  'src/options/guide/ProviderKeyGuide.tsx',
  'src/options/guide/TokenGuide.tsx',
  'src/core/connections/definitions.ts',
  'src/core/connections/features.ts',
  'src/shared/onboarding/content.ts',
]);

describe('AD-31: لا أسعار ولا تكلفة ولا حدود إنفاق في مِجهَر', () => {
  it('لا كلمة سعر أو تكلفة أو ميزانية أو إنفاق أو حصة في شيفرة مسار التحليل ونصوصه', () => {
    const MONEY = /سعر|أسعار|تكلف|دولار|ميزاني|فوترة|إنفاق|مجاني|تدفع|\bprice|\bpricing|\bcost|\bbudget|\bspend|\bquota|\bbilling|\$\s?\d/i;
    const offenders = ANALYSIS_PATH.filter((p) => MONEY.test(code(read(p)))).map((p) => `${p}: ${MONEY.exec(code(read(p)))?.[0]}`);
    expect(offenders).toEqual([]);
  });

  it('لا رابط لصفحة أسعار ولا طلب لها في أي ملف من src', () => {
    const offenders = ALL.filter((p) => /about-claude\/pricing|anthropic\.com\/pricing|claude\.com\/pricing/.test(read(p)));
    expect(offenders).toEqual([]);
  });
});

describe('AC-E9 (٣): لا مودل مثبت في الشيفرة', () => {
  it('لا معرّف مودل (claude-opus-… وما شابه) في src', () => {
    const offenders = ALL.filter((p) => /claude-(?:opus|sonnet|haiku|fable|instant)-\d/i.test(read(p)));
    expect(offenders).toEqual([]);
  });
});

describe('AC-E9 (٦): الأقسام لا تعرف محوّلًا بعينه', () => {
  const SECTIONS = ALL.filter((p) => /^src\/modules\/d\/(analysis|log-parser|pr-status)\//.test(p));

  it('ولا مضيفه ولا اسمه ولا خدمة الخلفية ولا مفاتيح الأسرار', () => {
    expect(SECTIONS.length).toBeGreaterThan(10);
    const offenders = SECTIONS.filter((p) => {
      const c = code(read(p));
      return /anthropic|api\.anthropic|e\/provider\/(adapters|service|KeySection|gate)|connections\/keys|connections\/secrets/i.test(c);
    });
    expect(offenders).toEqual([]);
  });

  it('السجل وحده يعرف المحوّلات، وما يصل سكربت المحتوى من الطبقة لا يستورد البطاقة ولا الخدمة ولا الأسرار', () => {
    const adapterImporters = ALL.filter((p) => /from '[^']*adapters\//.test(read(p)));
    expect(adapterImporters).toEqual(['src/modules/e/provider/registry.ts']);
    const index = code(read('src/modules/e/provider/index.ts'));
    expect(index).not.toMatch(/ProviderCard|\.\/service|\.\/registry|\.\/adapters|connections\/keys|connections\/secrets/);
    const keyUsers = ALL.filter((p) => /connections\/keys'/.test(read(p)));
    expect(keyUsers.sort()).toEqual(['src/background/main.ts', 'src/modules/d/token/store.ts', 'src/options/main.tsx'].sort());
  });
});

describe('AC-E10 (١) وI-2: السجل الوصفي منفصل عن المحوّلات', () => {
  const PROVIDER = ALL.filter((p) => p.startsWith('src/modules/e/provider/'));

  it('علامات كل محوّل (ترويساته ومساراته) في ملفه وحده من src، ولكل محوّل في السجل علاماته في تدقيق الحزمة', () => {
    expect(Object.keys(PROVIDER_ADAPTER_MARKERS).sort()).toEqual(PROVIDER_ADAPTERS.map((a) => a.descriptor.id).sort());
    for (const [id, markers] of Object.entries(PROVIDER_ADAPTER_MARKERS)) {
      const own = `src/modules/e/provider/adapters/${id}.ts`;
      for (const marker of markers) {
        expect(code(read(own)), `${marker} في ${own}`).toContain(marker);
        const elsewhere = ALL.filter((p) => p !== own && code(read(p)).includes(marker));
        expect(elsewhere, marker).toEqual([]);
      }
    }
  });

  it('السجل الوصفي والأوصاف لا تستورد محوّلًا ولا البوابة ولا الخدمة؛ ولا يستورد سجلَّ المحوّلات إلا الخلفية', () => {
    for (const p of ['src/modules/e/provider/catalog.ts', ...PROVIDER.filter((x) => x.includes('/descriptors/'))]) {
      expect(read(p), p).not.toMatch(/from '[^']*(adapters\/|\/gate'|\/service'|\/registry')/);
    }
    const registryUsers = ALL.filter((p) => /from '[^']*e\/provider\/registry'/.test(read(p)) || (p.startsWith('src/modules/e/provider/') && /from '\.\/registry'/.test(read(p))));
    expect(registryUsers.sort()).toEqual(['src/background/main.ts', 'src/modules/e/provider/service.ts']);
  });

  it('DEC-13: لا اسم مودل ولا فئة ولا نمط اسم في شيفرة طبقة المزوّد والأقسام (بعد حذف التعليقات)', () => {
    const NAMES = /\b(?:sonnet|haiku|opus|fable|mythos|claude-\d|gpt-?\d|gemini-\d|o\d-mini)\b/i;
    const offenders = ANALYSIS_PATH.filter((p) => NAMES.test(code(read(p)))).map((p) => `${p}: ${NAMES.exec(code(read(p)))?.[0]}`);
    expect(offenders).toEqual([]);
  });

  it('صلاحية مضيف كل مزوّد في السجل اختيارية في المانيفست، ولا غيرها من مضيفات المزوّدين', () => {
    for (const file of ['src/manifest/chromium.json', 'src/manifest/firefox.json']) {
      const manifest = JSON.parse(read(file)) as { optional_host_permissions?: string[]; host_permissions?: string[] };
      for (const { descriptor } of PROVIDER_ADAPTERS) {
        expect(manifest.optional_host_permissions, file).toContain(descriptor.origin);
        expect(manifest.host_permissions ?? [], file).not.toContain(descriptor.origin);
      }
    }
  });
});
