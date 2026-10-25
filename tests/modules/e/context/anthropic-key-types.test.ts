// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// AD-38: أنواع مفاتيح Claude API كلها (الشخصي، حساب الخدمة، مساحة العمل القديم، الإدارة، وأي نوع بعد sk-ant-) يرصدها نمط anthropic-key بموضعها
// الكامل مرة واحدة، ويحجبها المنقّح المشترك من «نسخ البرومبت» ومن بنية التحليل قبل أي إرسال، ويسمّيها secretKinds (نموذج البلاغ). مفاتيح مختلَقة
// تُركَّب وقت التشغيل.
import { describe, expect, it } from 'vitest';
import { buildContext, maskOf, secretKinds } from '../../../../src/modules/e/context';
import { scanText } from '../../../../src/modules/e/privacy-check';
import { promptFor } from '../../../../src/modules/e/prompt-templates';
import { prepareAnalysis } from '../../../../src/modules/e/provider';
import { NOW, SAMPLES, sourceOf } from './samples';

const body = (tag: string) => `${tag}Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe-Dc_Ba9876543210`;
const forms = {
  service: ['sk', 'ant', 'svc', body('S')].join('-'),
  personal: ['sk', 'ant', 'usr', body('U')].join('-'),
  workspace: ['sk', 'ant', 'api03', body('W')].join('-'),
  admin: ['sk', 'ant', 'admin01', body('A')].join('-'),
  future: ['sk', 'ant', 'zz9', body('F')].join('-'),
};

describe('AD-38: نمط anthropic-key يرصد كل أنواع مفاتيح Claude API', () => {
  it('مرة واحدة بموضعها الكامل، لا يحسبها نمط OpenAI مرة ثانية', () => {
    for (const [name, key] of Object.entries(forms)) {
      const text = `ANTHROPIC_API_KEY ${key}\n`;
      const found = scanText(text);
      expect(found.map((f) => f.patternId), name).toEqual(['anthropic-key']);
      expect(text.slice(found[0]?.start, found[0]?.end), name).toBe(key);
    }
  });

  it('secretKinds يسمّيها بلا أن يغيّر النص', () => {
    expect(secretKinds(`a ${forms.service} b ${forms.personal}`)).toEqual([expect.stringContaining('Anthropic')]);
  });
});

describe('AD-38: الحجب قبل أي إرسال لمفتاح حساب الخدمة والمفتاح الشخصي', () => {
  const plant = (): void => {
    const p = document.createElement('p');
    p.textContent = `key ${forms.service} and ${forms.personal}`;
    document.querySelector('[data-testid="issue-body"] [data-testid="markdown-body"], #issue-body-viewer [data-testid="markdown-body"], .js-command-palette-pull-body .js-comment-body')?.append(p);
  };

  it('«نسخ البرومبت» يحجبهما ويضع علامتهما، والحزمة (flag) ترصدهما', () => {
    const source = sourceOf(SAMPLES.pr, {}, plant);
    expect(source.description).toContain(forms.service);
    const prompt = promptFor('diagnose', source, { collectedAt: NOW });
    expect(prompt.text).not.toContain(forms.service);
    expect(prompt.text).not.toContain(forms.personal);
    expect(prompt.text).toContain(maskOf('anthropic-key'));
    expect(scanText(prompt.text)).toEqual([]);
    const bundle = buildContext(source, { secrets: 'flag', collectedAt: NOW });
    expect(bundle.secrets.hits).toContainEqual(expect.objectContaining({ part: 'الوصف', patternId: 'anthropic-key', count: 2 }));
  });

  it('طلب التحليل (system وprompt المرسلان فعلًا) بلا المفتاحين، والموافقة تعدّ المحجوب', () => {
    const prepared = prepareAnalysis(buildContext(sourceOf(SAMPLES.pr, {}, plant), { collectedAt: NOW }), { template: 'diagnose', task: 'حلّل' });
    const sent = `${prepared.system}\n${prepared.prompt}`;
    expect(sent).not.toContain(forms.service);
    expect(sent).not.toContain(forms.personal);
    expect(sent).not.toMatch(/sk-ant-[A-Za-z0-9_-]{16,}/);
    expect(prepared.consent.masked).toBeGreaterThanOrEqual(2);
  });
});
