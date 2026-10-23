// الكشف الموزون للاتجاه (Weighted Bidi Heuristic، EXECUTION_PLAN.md ‏3.أ البند 1): قياس نص الكتلة بعد استبعاد الكود والروابط
// والإشارات، والاتجاه الذي يعرضه GitHub أصلًا (لا يُكتب فوقه إلا حيث يخطئ، AC-A1 بند و). دوال نقية على DOM لا تكتب شيئًا.

/** حرف عربي الكتابة (حرف لا حركة ولا رقم ولا ترقيم). يوسّع النطاق ؀-ۿ في الخطة إلى ملحقاته وأشكال العرض. */
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/gu;
const LETTER = /\p{L}/gu;
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/u;
/** حرف قوي من اليمين إلى اليسار (فئتا R وAL في UBA) بتقريب الكتابات. */
const RTL_STRONG = /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const STRONG = /\p{L}/u;

/** ما لا يدخل نصه في قياس الحاوية: الكود والإشارات والمراجع (والروابط تُستبعد أولًا كما في الكتلة). */
const CONTEXT_EXCLUDED = [
  'code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea', 'template', 'svg', 'math',
  '.user-mention', '.team-mention', 'a.issue-link', 'a.commit-link', 'span.reference',
].join(', ');
/** ما لا يدخل نصه في قياس الكتلة: ما سبق، وكتل متداخلة تُقاس وحدها. */
export const MEASURE_EXCLUDED = `${CONTEXT_EXCLUDED}, ul, ol, table, blockquote`;
/** الروابط تُستبعد أولًا؛ وإن لم يبقَ بعدها حرف قيست الكتلة بنص روابطها (عنصر قائمة كله رابط عربي). */
const LINKS = 'a';

export interface BlockMeasure {
  /** نسبة الحروف العربية إلى كل الحروف في النص المقيس (0 إن لم يكن فيه حرف). */
  readonly ratio: number;
  readonly arabic: number;
  readonly letters: number;
  /** أطول تتابع لكلمات عربية لا تفصلها كلمة لاتينية. */
  readonly arabicRun: number;
  /** كلمات لاتينية قبل أول كلمة عربية: الكتلة التي تبدأ بجملة إنجليزية كاملة. */
  readonly latinLead: number;
  /** هل قيست بنص روابطها لأنه لم يبقَ غيره. */
  readonly linksCounted: boolean;
}

export type Direction = 'ltr' | 'rtl';

export function firstStrong(text: string): Direction | null {
  for (const ch of text) {
    if (!STRONG.test(ch)) continue;
    return RTL_STRONG.test(ch) ? 'rtl' : 'ltr';
  }
  return null;
}

// ثوابت NodeFilter (لا يُفترض وجود NodeFilter العام خارج نافذة).
const SHOW_ELEMENT = 0x1;
const SHOW_TEXT = 0x4;
const ACCEPT = 1;
const REJECT = 2;
const SKIP = 3;

function collectText(el: Element, exclude: string): string {
  const walker = el.ownerDocument.createTreeWalker(el, SHOW_ELEMENT | SHOW_TEXT, {
    acceptNode: (node) => (node.nodeType === 1 ? ((node as Element).matches(exclude) ? REJECT : SKIP) : ACCEPT),
  });
  let out = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out += node.nodeValue ?? '';
  return out;
}

export function measureText(text: string): Omit<BlockMeasure, 'linksCounted'> {
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  const letters = text.match(LETTER)?.length ?? 0;
  let run = 0;
  let arabicRun = 0;
  let latinLead = 0;
  let seenArabic = false;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const hasArabic = /(?=\p{L})\p{Script=Arabic}/u.test(token);
    const hasLatin = LATIN_LETTER.test(token);
    if (hasArabic && !hasLatin) {
      seenArabic = true;
      run += 1;
      arabicRun = Math.max(arabicRun, run);
    } else if (hasLatin) {
      run = 0;
      if (!seenArabic) latinLead += 1;
    }
    // رمز بلا حروف (أرقام وترقيم) لا يقطع التتابع ولا يُعدّ.
  }
  return { ratio: letters ? arabic / letters : 0, arabic, letters, arabicRun, latinLead };
}

function measureWith(el: Element, exclude: string): BlockMeasure {
  const primary = measureText(collectText(el, `${exclude}, ${LINKS}`));
  if (primary.letters > 0) return { ...primary, linksCounted: false };
  return { ...measureText(collectText(el, exclude)), linksCounted: true };
}

/** يقيس نص الكتلة المرئي بعد الاستبعاد. */
export function measureBlock(el: Element): BlockMeasure {
  return measureWith(el, MEASURE_EXCLUDED);
}

/** يقيس نص حاوية المحتوى كلها (سياق الكتل المختلطة فيها). */
export function measureContainer(el: Element): BlockMeasure {
  return measureWith(el, CONTEXT_EXCLUDED);
}

// نص dir="auto" كما يحسبه المتصفح: أول حرف قوي في عقد النص الفرعية، متخطيًا bdi وscript وstyle وtextarea وكل فرع له dir صالح.
function autoDirection(el: Element): Direction {
  const walker = el.ownerDocument.createTreeWalker(el, SHOW_ELEMENT | SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType !== 1) return ACCEPT;
      const child = node as Element;
      const name = child.localName;
      if (name === 'bdi' || name === 'script' || name === 'style' || name === 'textarea') return REJECT;
      const dir = child.getAttribute('dir')?.toLowerCase();
      return dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? REJECT : SKIP;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const found = firstStrong(node.nodeValue ?? '');
    if (found) return found;
  }
  return 'ltr';
}

export interface NativeDirection {
  readonly direction: Direction;
  /** explicit: dir="ltr|rtl" صريحة على العنصر أو سلف؛ auto: dir="auto" أو bdi؛ default: لا dir فوقه. */
  readonly source: 'explicit' | 'auto' | 'default';
}

/**
 * الاتجاه الذي يعرضه GitHub للعنصر بسمات dir وحدها (دون ما تكتبه الإضافة): أقرب سلف بـdir صالح، وdir="auto" (وعنصر bdi بلا dir)
 * يُحسب من أول حرف قوي، والافتراضي ltr. لا يرى اتجاهًا مضبوطًا بـCSS في أنماط الصفحة (لا تفعله صفحات GitHub في حاويات المحتوى).
 */
export function resolveNative(el: Element): NativeDirection {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const dir = node.getAttribute('dir')?.toLowerCase();
    if (dir === 'rtl' || dir === 'ltr') return { direction: dir, source: 'explicit' };
    if (dir === 'auto' || node.localName === 'bdi') return { direction: autoDirection(node), source: 'auto' };
  }
  return { direction: 'ltr', source: 'default' };
}

export function nativeDirection(el: Element): Direction {
  return resolveNative(el).direction;
}
