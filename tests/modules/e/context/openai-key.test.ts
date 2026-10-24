// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// MJ24 (T-11.11، AC-E11 (٤)، TEST-PRIV-05): صيغة مفتاح OpenAI نمطٌ في قائمة الحجب (T-6.3): يحجبها المنقّح المشترك من «نسخ البرومبت» ومن بنية التحليل قبل أي
// إرسال، ويرصدها تنبيه الحزمة. المفاتيح هنا مختلَقة تُركَّب وقت التشغيل؛ ولا تعلن وثائق OpenAI بادئة ولا طولًا، فالنمط تحذيري متساهل (evidence/T-11.11/docs-read.md).
import { describe, expect, it } from 'vitest';
import { buildContext, maskOf } from '../../../../src/modules/e/context';
import { SECRET_PATTERNS, scanText } from '../../../../src/modules/e/privacy-check';
import { promptFor } from '../../../../src/modules/e/prompt-templates';
import { prepareAnalysis } from '../../../../src/modules/e/provider';
import { NOW, SAMPLES, sourceOf } from './samples';

const body = (n: number, tag: string) => `${tag}Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe`.repeat(Math.ceil(n / 30)).slice(0, n);
const forms = {
  project: ['sk', 'proj', body(60, 'P')].join('-'),
  service: ['sk', 'svcacct', body(60, 'S')].join('-'),
  user: ['sk', 'None', body(60, 'N')].join('-'),
  legacy: ['sk', body(48, 'L')].join('-'),
  admin: ['sk', 'admin', body(60, 'A')].join('-'),
};
const anthropic = ['sk', 'ant', 'api03', 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-Dc_Ba9876543210'].join('-');

describe('نمط openai-key في القائمة المعرّفة', () => {
  it('هو الثامن بعد anthropic-key، ويرصد كل شكل مرصود لمفتاح OpenAI بموضعه الكامل', () => {
    // الموجة L: Google Gemini (MJ25) بعده في القائمة، فالفحص بموضعه بعد anthropic-key لا بآخر القائمة.
    const ids = SECRET_PATTERNS.map((p) => p.id);
    expect(ids.slice(ids.indexOf('anthropic-key'), ids.indexOf('anthropic-key') + 2)).toEqual(['anthropic-key', 'openai-key']);
    for (const [name, key] of Object.entries(forms)) {
      const text = `OPENAI_API_KEY=${key}\n`;
      const found = scanText(text);
      expect(found, name).toHaveLength(1);
      expect(found[0]?.patternId, name).toBe('openai-key');
      expect(text.slice(found[0]?.start, found[0]?.end), name).toBe(key);
    }
  });

  it('مفتاح Anthropic لا يُحسب مرتين (له نمطه)، ولا يُرصد نص عادي: sk-learn وأسماء مركبة وبادئة قصيرة وكلمة تنتهي بـsk-', () => {
    expect(scanText(`k=${anthropic}`).map((f) => f.patternId)).toEqual(['anthropic-key']);
    for (const benign of ['pip install sk-learn', 'sk-short', 'risk-assessment-framework-documentation', 'task-force-long-name-with-many-parts-here', 'sk-']) expect(scanText(benign), benign).toEqual([]);
  });
});

describe('الحجب قبل أي إرسال (TEST-PRIV-05)', () => {
  const plant = (): void => {
    const p = document.createElement('p');
    p.textContent = `OPENAI_API_KEY=${forms.project}`;
    document.querySelector('[data-testid="issue-body"] [data-testid="markdown-body"], #issue-body-viewer [data-testid="markdown-body"], .js-command-palette-pull-body .js-comment-body')?.append(p);
  };

  it('«نسخ البرومبت» يحجبه ويضع علامته، والحزمة (flag) ترصده بموضعه', () => {
    const source = sourceOf(SAMPLES.pr, {}, plant);
    expect(source.description).toContain(forms.project);
    const prompt = promptFor('diagnose', source, { collectedAt: NOW });
    expect(prompt.text).not.toContain(forms.project);
    expect(prompt.text).toContain(`OPENAI_API_KEY=${maskOf('openai-key')}`);
    expect(scanText(prompt.text)).toEqual([]);
    const bundle = buildContext(source, { secrets: 'flag', collectedAt: NOW });
    expect(bundle.secrets.hits).toContainEqual(expect.objectContaining({ part: 'الوصف', patternId: 'openai-key', count: 1 }));
  });

  it('طلب التحليل (system وprompt المرسلان فعلًا إلى المزوّد) بلا المفتاح، والموافقة تعدّ المحجوب', () => {
    const ctx = buildContext(sourceOf(SAMPLES.pr, {}, plant), { collectedAt: NOW });
    const prepared = prepareAnalysis(ctx, { template: 'diagnose', task: 'حلّل' });
    expect(`${prepared.system}\n${prepared.prompt}`).not.toContain(forms.project);
    expect(prepared.prompt).toContain(maskOf('openai-key'));
    expect(prepared.consent.masked).toBeGreaterThanOrEqual(1);
  });
});
