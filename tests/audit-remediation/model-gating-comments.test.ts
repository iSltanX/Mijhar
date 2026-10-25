// COR-AUD-06 (Gemini): تعليقات المحوّلات والأوصاف تتبع DEC-13 ن-5 (القائمة مساعدة لا شرط، و«اختبر النموذج» اختياري لا شرط للحفظ ولا للتحليل)، ولا
// تبقى فيها صياغة ن-3 ون-4 التي تجعل الفحص الصريح شرطًا لصيرورة النموذج خيارًا للتحليل. السلوك نفسه تثبته اختبارات قائمة (multi-provider.test.ts
// «BLK-MODEL-COMPAT (ن-5)»، وopenai-service.test.ts، وgemini.test.ts)؛ وهذا حارس نصي يمنع عودة الصياغة القديمة.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = [
  'src/modules/e/provider/adapters/gemini.ts',
  'src/modules/e/provider/adapters/openai.ts',
  'src/modules/e/provider/descriptors/gemini.ts',
  'src/modules/e/provider/descriptors/openai.ts',
] as const;

const STALE = [/خيارًا للتحليل إلا ب/, /حتى يثبت بالفحص/, /فيثبت التوافق بفحص/, /ويثبت بفحص صريح/];

describe('COR-AUD-06: تعليقات الفحص الصريح تتبع DEC-13 ن-5', () => {
  for (const file of FILES) {
    it(file, () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of STALE) expect(source, String(pattern)).not.toMatch(pattern);
      expect(source).toContain('ن-5');
    });
  }
});
