// أنماط العزل النصية (T-2.2، F-A2): ما يُكتب نصًا عاديًا داخل فقرة عربية ويحتاج اتجاهًا ltr معزولًا كي لا ينعكس ترتيبه:
// المراجع (#452 وowner/repo#12) والمسارات (src/api/github.ts وdist/) والإصدارات (v2.0.1-rc.3) وأسماء الملفات (README.md)
// والإشارات (@octocat). كلها ASCII: \w بلا علم u لا يطابق حرفًا عربيًا، فلا تمتد مطابقة إلى كلمة عربية ملاصقة.
// المطابقة لا تغيّر النص: تحدد مواضع يغلّفها المعالج بعنصر معزول دون أي محرف خفي.

export type IsolateKind = 'ref' | 'path' | 'version' | 'file' | 'mention';

export interface IsolateRun {
  readonly start: number;
  readonly end: number;
  readonly kind: IsolateKind;
}

// الترتيب مقصود: المرجع الكامل قبل المسار (وإلا أخذ المسار owner/repo وترك #12)، والإصدار قبل اسم الملف.
const PARTS: ReadonlyArray<readonly [IsolateKind, string]> = [
  ['ref', String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+`],
  ['path', String.raw`(?:\.{1,2}\/|~\/|\/)?(?:[\w.-]+\/)+(?:[\w.-]*\w)?`],
  ['version', String.raw`v?\d+(?:\.\d+)+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`],
  ['file', String.raw`[\w-]+(?:\.[\w-]+)*\.[A-Za-z][A-Za-z0-9]{0,9}`],
  ['mention', String.raw`@[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}(?:\/[\w.-]*\w)?`],
];

// حدّ البداية: لا يسبق المطابقة حرف لاتيني أو رقم أو أحد محارف الأنماط (فلا تبدأ من منتصف كلمة أو بريد). وحدّ النهاية: لا يليها
// حرف لاتيني أو رقم أو @ أو #. علامات الترقيم بعدها (النقطة والفاصلة) خارج المطابقة.
const BEFORE = String.raw`(?<![\w.@#/~-])`;
const AFTER = String.raw`(?![\w@#])`;

const SOURCE = `${BEFORE}(?:${PARTS.map(([kind, source]) => `(?<${kind}>${source})`).join('|')})${AFTER}`;

/** نمط عام جديد في كل استدعاء (lastIndex لا يُشارَك). */
export const isolatePattern = (): RegExp => new RegExp(SOURCE, 'g');

const TEST = new RegExp(SOURCE);

/** هل في النص موضع يُعزل؟ (أرخص من findIsolateRuns للتصفية). */
export function hasIsolateRun(text: string): boolean {
  return TEST.test(text);
}

/** مواضع العزل في نص عقدة واحدة، بترتيبها وبلا تداخل. */
export function findIsolateRuns(text: string): IsolateRun[] {
  const runs: IsolateRun[] = [];
  for (const match of text.matchAll(isolatePattern())) {
    const groups = match.groups ?? {};
    const kind = (PARTS.find(([name]) => groups[name] !== undefined)?.[0] ?? 'path') as IsolateKind;
    runs.push({ start: match.index, end: match.index + match[0].length, kind });
  }
  return runs;
}
