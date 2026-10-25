// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
/**
 * ملاحظات المراجعة المستقلة لالتزام المعالجة (قبل الدمج): كتلة PEM بلا تذييل كانت تُحجب إلى نهاية الحقل، فيمحو ذكرُ ترويسة في سجل أو فرق ما بعده
 * (أسطر الخطأ وفروق الملفات التالية)؛ وكتلة السجل المحجوبة عند جمعه لا تُعدّ في سياسة flag؛ وترتيب d.compare ينقلب في الموضع الاحتياطي؛ و«Extension
 * context invalidated» لم تصل فيه رسالة. الإصلاح يمدّ الكتلة الناقصة على أسطر تشبه جسم المفتاح وحدها، ويحجب فرق كل ملف وحده. مفاتيح اصطناعية تُولَّد هنا.
 */
import { describe, expect, it } from 'vitest';
import { analyzeLog } from '../../../src/modules/d/log-parser/parse';
import { createCompareModule } from '../../../src/modules/d/compare';
import { buildContext } from '../../../src/modules/e/context/build';
import { prepareAnalysis } from '../../../src/modules/e/provider/request';
import { PROMPT_IDS } from '../../../src/modules/e/prompt-templates';
import { redactKeyBlocks, sanitize } from '../../../src/modules/e/context/sanitize';
import { runtimeExecutionPort } from '../../../src/modules/f/execution';
import { runtimeProviderPort } from '../../../src/modules/e/provider/port';
import { ROOT, loadHtml } from '../../modules/d/helpers';
import { mountRig, useRigTimers } from '../dom/rig';
import { baseSource } from '../integrity/fixtures';
import { leak, longKey, shortKey } from '../integrity/pem-keys';

useRigTimers();

const HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');

describe('مراجعة MJ-TA-01: الكتلة بلا تذييل تقف عند آخر سطر يشبه جسم المفتاح', () => {
  it('ذكر الترويسة في سطر سجل نثري لا يمحو ما بعده، وسطر ##[error] يبقى للمحلل', () => {
    const log = ['Run ./scan.sh', `Scanning for markers such as ${HEADER} in tracked files`, 'checked 12 files', 'found 1 marker', '##[error]Process completed with exit code 1.'].join('\n');
    const redacted = redactKeyBlocks(log, { keepLines: true });
    expect(redacted.split('\n')).toHaveLength(5);
    expect(redacted).toContain('checked 12 files');
    expect(redacted).toContain('##[error]Process completed with exit code 1.');
    const analysis = analyzeLog({ text: redacted, source: 'step-log', step: null, annotations: [], truncatedBySource: null });
    expect(analysis.messages.length).toBeGreaterThan(0);
  });

  it('كتلة بلا تذييل في سجل: الجسم يُحجب، وأسطر الخطأ بعدها تبقى', () => {
    const key = longKey();
    const log = ['setup', key.header, ...key.lines, '##[error]Process completed with exit code 1.', 'post step'].join('\n');
    const redacted = redactKeyBlocks(log, { keepLines: true });
    expect(leak(redacted, [key])).toEqual({ windows: 0, endLines: 0 });
    expect(redacted).toContain('##[error]Process completed with exit code 1.');
    expect(redacted).toContain('post step');
    expect(redacted.split('\n')).toHaveLength(log.split('\n').length);
  });

  it('فرق ملف يذكر الترويسة بلا تذييل لا يُسقط فروق الملفات التالية', () => {
    const files = [
      { path: 'docs/pem.md', kind: 'docs', additions: 1, deletions: 0, patch: `@@ -1 +1 @@\n+PEM files start with ${HEADER}` },
      { path: 'src/important.ts', kind: 'code', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+export const important = true;' },
    ];
    const source = baseSource({ kind: 'pr', changes: { totals: { files: 2, additions: 2, deletions: 0 }, files, complete: true } as never });
    const ctx = buildContext(source);
    const prompt = PROMPT_IDS.map((id) => prepareAnalysis(ctx, { template: id, task: 'Synthetic test' }).prompt).join('\n');
    expect(prompt).toContain('export const important = true;');
    expect(prompt).toContain('PEM files start with');
  });

  it('كتلة السجل المحجوبة عند جمعه تُعدّ في سياسة flag أيضًا', () => {
    // مفتاح قصير فتقع ترويسته المحجوبة في نافذة السطر الخاطئ (5 أسطر قبله).
    const key = shortKey();
    const text = ['step', key.header, ...key.lines, key.footer, '##[error]boom'].join('\n');
    const analysis = analyzeLog({ text: redactKeyBlocks(text, { keepLines: true }), source: 'step-log', step: null, annotations: [], truncatedBySource: null });
    const flagged = sanitize(baseSource({ kind: 'job', log: analysis }), [], { secrets: 'flag' });
    expect(flagged.secrets.total).toBeGreaterThanOrEqual(1);
    expect(flagged.secrets.hits.some((h) => h.patternId === 'private-key')).toBe(true);
  });
});

describe('مراجعة MJ-TA-H01: Extension context invalidated', () => {
  it('لم تصل الرسالة: «لم يُكتب شيء» و«لم يُرسل شيء» صحيحتان', async () => {
    const reject = { sendMessage: async () => Promise.reject(new Error('Extension context invalidated.')) };
    const run = await runtimeExecutionPort(reject).run({ owner: 'o', repo: 'r', base: 'main', baseSha: 'a'.repeat(40), branch: 'b', path: 'README.md', fileSha: 'b'.repeat(40), content: 'x', title: 't', body: 'b', draft: true });
    expect(run.failure?.message).toContain('لم يُكتب شيء');
    expect(run.uncertain).toBeUndefined();
    const analysed = await runtimeProviderPort(reject).analyze({ requestId: 'r', section: 'issue', provider: 'anthropic', model: 'm', system: 's', prompt: 'p' });
    expect(analysed.ok ? '' : analysed.message).toContain('لم يُرسل شيء');
  });
});

describe('مراجعة MJ-F-01: ترتيب d.compare في الموضع الاحتياطي', () => {
  it('حين تغيب المرساة بعد الاستبدال ويُستعمل الموضع الاحتياطي: الملخص ثم الأثر كما رُكّبا', async () => {
    const rig = await mountRig({ load: () => loadHtml(`${ROOT}/tests/modules/d/fixtures/gh-compare-branches.html`), path: '/octocat/Hello-World/compare/master...octocat-patch-1', modules: [createCompareModule({ debounceMs: 5 })] });
    await rig.settle(500);
    const labelOrder = (): string[] => rig.hosts('d.compare').map((h) => h.shadowRoot?.querySelector('.mj-root')?.getAttribute('aria-label') ?? '');
    const initial = labelOrder();
    expect(initial).toHaveLength(2);
    rig.hydrate((fresh) => fresh.querySelector('#files_bucket')?.remove());
    await rig.settle(1500);
    expect(rig.errors).toEqual([]);
    expect(labelOrder()).toEqual(initial);
    rig.dispose();
  });
});
