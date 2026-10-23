// TEST-TR-02F (AC-C2): الفشل الآمن وإعادة المحاولة جملةً جملةً مرة واحدة فقط.
import { describe, expect, it } from 'vitest';
import { translateProtected } from '../../../../src/modules/c/masking/fail-safe';
import { INTEGRITY_WARNING } from '../../../../src/modules/c/masking/messages';
import { TOKEN_SHAPE } from '../../../../src/modules/c/masking/mask';
import { recordingEngine, translateWords } from './engines';

const PARAGRAPH = 'Run `npm test` first. Then edit src/core/index.ts carefully. Finally push it.';
// بعد التقنيع: «Run ⟦CODE_0⟧ first. Then edit ⟦PATH_1⟧ carefully. Finally push it.»

describe('التمرير الأول ناجح', () => {
  it('نداء واحد ولا إعادة محاولة', async () => {
    const engine = recordingEngine((input) => translateWords(input));
    const result = await translateProtected(PARAGRAPH, engine.translate, { terms: [] });
    expect(result.status).toBe('translated');
    expect(result.retryAttempts).toBe(0);
    expect(result.engineCalls).toBe(1);
    expect(engine.calls).toEqual(['Run ⟦CODE_0⟧ first. Then edit ⟦PATH_1⟧ carefully. Finally push it.']);
    if (result.status === 'translated') expect(result.text).toBe('ترجمة `npm test` ترجمة. ترجمة ترجمة src/core/index.ts ترجمة. ترجمة ترجمة ترجمة.');
  });

  it('نص مقنَّع فارغ لا يستدعي المحرك', async () => {
    const engine = recordingEngine(() => 'x');
    const result = await translateProtected('  \n ', engine.translate);
    expect(result.status).toBe('translated');
    expect(engine.calls).toEqual([]);
  });
});

describe('التمرير الأول مرفوض ثم تنجح إعادة الجمل', () => {
  // يُسقط الفقرةُ الكاملةُ ⟦CODE_0⟧، بينما تسلم الجمل المفردة.
  const flakyOnWhole = (input: string, _call: number): string => {
    const translated = translateWords(input);
    return input.includes('Finally') ? translated.replace('⟦CODE_0⟧', '') : translated;
  };

  it('تُعاد الترجمة جملةً جملةً مرة واحدة (عدّاد المحاولات 1) وتُعرض الأصلية مستعادة', async () => {
    const engine = recordingEngine(flakyOnWhole);
    const result = await translateProtected(PARAGRAPH, engine.translate, { terms: [] });
    expect(result.status).toBe('translated');
    expect(result.retryAttempts).toBe(1);
    expect(result.engineCalls).toBe(4); // الفقرة ثم ثلاث جمل
    expect(engine.calls.slice(1)).toEqual(['Run ⟦CODE_0⟧ first.', 'Then edit ⟦PATH_1⟧ carefully.', 'Finally push it.']);
    if (result.status === 'translated') {
      expect(result.text).toBe('ترجمة `npm test` ترجمة. ترجمة ترجمة src/core/index.ts ترجمة. ترجمة ترجمة ترجمة.');
      expect(result.parts.filter((p) => p.kind === 'protected').map((p) => p.value)).toEqual(['`npm test`', 'src/core/index.ts']);
    }
  });

  it('رمز لا يقع على حدود الجملة ولا يُمرَّر للمحرك بديل المقسِّم', async () => {
    const engine = recordingEngine((input) => (input.includes('\n') || input.split('. ').length > 1 ? 'تالف' : translateWords(input)));
    await translateProtected('Edit `a.b`. Then see src/x/y.ts. Last #7.', engine.translate, { terms: [] });
    for (const sentence of engine.calls.slice(1)) {
      expect(sentence).not.toContain('Token');
      expect((sentence.match(TOKEN_SHAPE) ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe('الرفض في الجولتين: يبقى الأصل مع التنبيه', () => {
  const alwaysDropsCode = (input: string): string => translateWords(input).replace(/ترجمة/g, 'مرفوض').replace(/⟦CODE_0⟧/g, '');

  it('لا تتجاوز إعادة المحاولة واحدة، ويبقى النص الأصلي كما سُلِّم، ولا ترجمة مرفوضة في المخرج', async () => {
    const engine = recordingEngine(alwaysDropsCode);
    const result = await translateProtected(PARAGRAPH, engine.translate, { terms: [] });
    expect(result.status).toBe('original-kept');
    if (result.status !== 'original-kept') return;
    expect(result.retryAttempts).toBe(1);
    expect(result.original).toBe(PARAGRAPH);
    expect(result.warning).toBe(INTEGRITY_WARNING);
    expect(result.firstAttemptFailures.map((f) => f.check)).toEqual(['count', 'identity']);
    expect(result.failures.map((f) => f.check)).toEqual(['count', 'identity']);
    // الفقرة مرة ثم الجملة الأولى فقط؛ توقف عند أول جملة مرفوضة فلا نداءات زائدة ولا جولة ثالثة.
    expect(engine.calls).toEqual(['Run ⟦CODE_0⟧ first. Then edit ⟦PATH_1⟧ carefully. Finally push it.', 'Run ⟦CODE_0⟧ first.']);
    expect(result.engineCalls).toBe(2);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('مرفوض');
    expect(serialised).not.toContain('masked');
    expect(result).not.toHaveProperty('parts');
    expect(result).not.toHaveProperty('text');
  });

  it('تنبيه المستخدم حرفيًا كما في الخطة', () => {
    expect(INTEGRITY_WARNING).toBe(
      'تعذّر عرض ترجمة هذه الفقرة لأن محرك الترجمة أخلّ بسلامة الرموز المحمية (فقدان أو تكرار رمز الكود/المسار). أُبقي النص الأصلي حفاظًا على دقة الكود.',
    );
  });

  it('رفض جملة في الوسط يوقف الباقي بعد نداءات الجمل السابقة فقط', async () => {
    const engine = recordingEngine((input, call) => (call === 0 || input.startsWith('Then') ? 'تالف ⟦CODE_9⟧' : translateWords(input)));
    const result = await translateProtected(PARAGRAPH, engine.translate, { terms: [] });
    expect(result.status).toBe('original-kept');
    expect(engine.calls.map((c) => c.slice(0, 4))).toEqual(['Run ', 'Run ', 'Then']);
    if (result.status === 'original-kept') expect(result.failures.map((f) => f.check)).toContain('hallucination');
  });

  it('جمل المحاولة الثانية سليمة لكن مجموعها لا يطابق: تُرفض أيضًا', async () => {
    // المحرك يُرجع في كل جملة نصًا سليمًا؛ لكن الجملة الأولى تُرجع بلا أي رمز مسجل ولا غريب فتسقط هويتها.
    const engine = recordingEngine((input, call) => (call === 0 ? 'تالف' : input.includes('CODE_0') ? 'ترجمة' : translateWords(input)));
    const result = await translateProtected(PARAGRAPH, engine.translate, { terms: [] });
    expect(result.status).toBe('original-kept');
  });
});

describe('محرك يُخلّ بنص بلا رموز', () => {
  it('اختلاق رمز في فقرة بلا عناصر محمية يُرفض ويبقى الأصل', async () => {
    const engine = recordingEngine(() => 'ترجمة ⟦CODE_0⟧');
    const result = await translateProtected('Nothing to protect here.', engine.translate, { terms: [] });
    expect(result.status).toBe('original-kept');
    expect(result.retryAttempts).toBe(1);
  });
});

describe('الإلغاء وأخطاء المحرك', () => {
  it('إشارة ملغاة تمنع أي نداء للمحرك', async () => {
    const engine = recordingEngine((input) => input);
    const controller = new AbortController();
    controller.abort();
    await expect(translateProtected(PARAGRAPH, engine.translate, { signal: controller.signal })).rejects.toThrow();
    expect(engine.calls).toEqual([]);
  });

  it('خطأ المحرك يصل إلى المستدعي ولا يُبتلع', async () => {
    await expect(
      translateProtected(PARAGRAPH, async () => {
        throw new Error('engine-down');
      }),
    ).rejects.toThrow('engine-down');
  });
});

describe('المدخل مقاطع جاهزة', () => {
  it('العنصر المحدد يُقنَّع حرفيًا ويُعاد حرفيًا', async () => {
    const engine = recordingEngine(translateWords);
    const result = await translateProtected(['Press ', { type: 'CODE', value: 'Ctrl+C' }, ' to stop.'], engine.translate, { terms: [] });
    expect(engine.calls).toEqual(['Press ⟦CODE_0⟧ to stop.']);
    if (result.status === 'translated') expect(result.text).toBe('ترجمة Ctrl+C ترجمة ترجمة.');
  });

  it('الأصل المحفوظ عند الفشل هو نص المقاطع المجمّع', async () => {
    const engine = recordingEngine(() => 'تالف');
    const result = await translateProtected(['Press ', { type: 'CODE', value: 'Ctrl+C' }, ' to stop.'], engine.translate, { terms: [] });
    if (result.status === 'original-kept') expect(result.original).toBe('Press Ctrl+C to stop.');
    else throw new Error('كان يجب أن يبقى الأصل');
  });
});
