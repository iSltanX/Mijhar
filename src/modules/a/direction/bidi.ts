// الكشف الموزون للاتجاه (Weighted Bidi Heuristic، EXECUTION_PLAN.md ‏3.أ البند 1): قياس نص الكتلة بعد استبعاد الكود والروابط
// والإشارات، والاتجاه الذي يعرضه GitHub أصلًا (لا يُكتب فوقه إلا حيث يخطئ، AC-A1 بند و). دوال نقية على DOM لا تكتب شيئًا.

/** حرف عربي الكتابة (حرف لا حركة ولا رقم ولا ترقيم). يوسّع نطاق الخطة U+0600..U+06FF إلى ملحقاته وأشكال العرض. */
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/gu;
const ARABIC_IN_TOKEN = /(?=\p{L})\p{Script=Arabic}/u;
const LETTER = /\p{L}/gu;
const FIRST_LETTER = /\p{L}/u;
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/u;
/** حرف قوي من اليمين إلى اليسار (فئتا R وAL في UBA) بتقريب الكتابات. */
const RTL_STRONG = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;

// ما لا يدخل نصه في القياس: الكود والإشارات والمراجع (في الكتلة والحاوية)، وكتل متداخلة تُقاس وحدها (في الكتلة فقط)، والروابط
// (تُستبعد أولًا؛ وإن لم يبقَ بعدها حرف قيست الكتلة بنص روابطها، كعنصر قائمة كله رابط عربي). فحص بالوسم والصنف لا بـmatches():
// القياس يمر على كل عنصر في كل كتلة، فكلفته جزء من PB-02.
const EXCLUDED_TAGS: ReadonlySet<string> = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea', 'template', 'svg', 'math']);
const NESTED_BLOCKS: ReadonlySet<string> = new Set(['ul', 'ol', 'table', 'blockquote']);

interface Exclusion {
  readonly nested: boolean;
  readonly excludeLinks: boolean;
}

function excluded(el: Element, exclusion: Exclusion): boolean {
  const name = el.localName;
  if (EXCLUDED_TAGS.has(name)) return true;
  if (exclusion.nested && NESTED_BLOCKS.has(name)) return true;
  const classes = el.classList;
  if (classes.contains('user-mention') || classes.contains('team-mention')) return true;
  if (name === 'a') return exclusion.excludeLinks || classes.contains('issue-link') || classes.contains('commit-link');
  return name === 'span' && classes.contains('reference');
}

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
  const letter = FIRST_LETTER.exec(text);
  if (!letter) return null;
  return RTL_STRONG.test(letter[0]) ? 'rtl' : 'ltr';
}

function collectText(el: Element, exclusion: Exclusion): string {
  let out = '';
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) out += (child as Text).data;
    else if (child.nodeType === 1 && !excluded(child as Element, exclusion)) out += collectText(child as Element, exclusion);
  }
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
    const hasArabic = ARABIC_IN_TOKEN.test(token);
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

function measureWith(el: Element, nested: boolean): BlockMeasure {
  const primary = measureText(collectText(el, { nested, excludeLinks: true }));
  if (primary.letters > 0) return { ...primary, linksCounted: false };
  return { ...measureText(collectText(el, { nested, excludeLinks: false })), linksCounted: true };
}

/** يقيس نص الكتلة المرئي بعد الاستبعاد. */
export function measureBlock(el: Element): BlockMeasure {
  return measureWith(el, true);
}

/** يقيس نص حاوية المحتوى كلها (سياق الكتل المختلطة فيها). */
export function measureContainer(el: Element): BlockMeasure {
  return measureWith(el, false);
}

// نص dir="auto" كما يحسبه المتصفح: أول حرف قوي في عقد النص الفرعية، متخطيًا bdi وscript وstyle وtextarea وكل فرع له dir صالح.
function firstStrongIn(el: Element): Direction | null {
  for (let child = el.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) {
      const found = firstStrong((child as Text).data);
      if (found) return found;
    } else if (child.nodeType === 1) {
      const element = child as Element;
      const name = element.localName;
      if (name === 'bdi' || name === 'script' || name === 'style' || name === 'textarea') continue;
      const dir = element.getAttribute('dir')?.toLowerCase();
      if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') continue;
      const found = firstStrongIn(element);
      if (found) return found;
    }
  }
  return null;
}

export interface NativeDirection {
  readonly direction: Direction;
  /** explicit: dir="ltr|rtl" صريحة على العنصر أو سلف؛ auto: dir="auto" أو bdi؛ default: لا dir فوقه. */
  readonly source: 'explicit' | 'auto' | 'default';
}

/**
 * الاتجاه الذي يعرضه GitHub للعنصر بسمات dir وحدها (دون ما تكتبه الإضافة): أقرب سلف بـdir صالح، وdir="auto" (وعنصر bdi بلا dir)
 * يُحسب من أول حرف قوي، والافتراضي ltr. لا يرى اتجاهًا مضبوطًا بـCSS في أنماط الصفحة (لا تفعله صفحات GitHub في حاويات المحتوى).
 * cache: ذاكرة لحساب dir="auto" لكل عنصر خلال مسح واحد (الكتل تشترك غالبًا في سلف auto واحد هو حاوية التعليق).
 */
export function resolveNative(el: Element, cache?: Map<Element, Direction>): NativeDirection {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const dir = node.getAttribute('dir')?.toLowerCase();
    if (dir === 'rtl' || dir === 'ltr') return { direction: dir, source: 'explicit' };
    if (dir === 'auto' || node.localName === 'bdi') {
      let direction = cache?.get(node);
      if (!direction) {
        direction = firstStrongIn(node) ?? 'ltr';
        cache?.set(node, direction);
      }
      return { direction, source: 'auto' };
    }
  }
  return { direction: 'ltr', source: 'default' };
}

export function nativeDirection(el: Element): Direction {
  return resolveNative(el).direction;
}
