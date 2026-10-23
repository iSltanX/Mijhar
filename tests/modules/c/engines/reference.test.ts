// المجموعة المرجعية (fixtures/translation/reference.json) على المحرك الوهمي الذي يحرّف صيغة الخطة كما قيس في Chrome (TEST-TR-04): اختبار ارتداد لما
// قاسته تجربة المتصفحات الحقيقية (evidence/T-4.3): بالصيغة على السلك يسلم كل عنصر من أول محاولة، وبصيغة الخطة وحدها يبقى أصل كل عنصر فيه رمز.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { maskText, translateProtected } from '../../../../src/modules/c/masking';
import { ROOT } from '../ui/helpers';
import { FakeTranslatorApi } from './fake-translator';

const reference = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/translation/reference.json'), 'utf8')) as {
  sentences: string[];
  paragraphs: string[];
  technical: Array<{ case: string; text: string }>;
};
const items = [...reference.sentences, ...reference.paragraphs, ...reference.technical.map((t) => t.text)];
const withTokens = items.filter((text) => maskText(text).expectedTokens.size > 0);

describe('المجموعة المرجعية', () => {
  it('33 عنصرًا، والفقرات التقنية كلها فيها عناصر محمية وتغطي README والتعليق والمشكلة وطلب الدمج والتحديد', () => {
    expect(items).toHaveLength(33);
    for (const t of reference.technical) expect(maskText(t.text).expectedTokens.size, t.text).toBeGreaterThan(0);
    expect(new Set(reference.technical.map((t) => t.case))).toEqual(new Set(['readme', 'issue', 'comment', 'pr', 'selection']));
    expect(withTokens.length).toBeGreaterThanOrEqual(25);
  });

  it('بالصيغة على السلك: كل عنصر يُترجم من أول محاولة والعناصر المحمية كما هي', async () => {
    const engine = new TranslatorApiEngine(new FakeTranslatorApi().asGlobal());
    for (const text of items) {
      const result = await translateProtected(text, (masked, context) => engine.translate(masked, context));
      expect(result.status, text).toBe('translated');
      if (result.status === 'translated') expect(result.retryAttempts).toBe(0);
    }
  });

  it('بصيغة الخطة وحدها (بلا wire.ts): يبقى أصل كل عنصر فيه رمز مع التنبيه، ولا يُعرض نص مشوَّه', async () => {
    const raw = await new FakeTranslatorApi().asGlobal().create({ sourceLanguage: 'en', targetLanguage: 'ar' });
    for (const text of withTokens) {
      const result = await translateProtected(text, (masked) => raw.translate(masked));
      expect(result.status, text).toBe('original-kept');
    }
  });
});
