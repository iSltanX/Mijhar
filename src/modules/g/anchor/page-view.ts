// ما تعرضه الصفحة المفتوحة لإعادة التثبيت، من DOM وحده بلا أي طلب. المقيس في evidence/T-0.4/report.md ‏(AC-S4.1): عناصر #LC<n>
// لنص السطر وdata-line-number لرقمه في صفحة الملف، وmeta octolytics-dimension-repository_nwo للمستودع، وrefInfo.currentOid في
// react-app.embeddedData للالتزام، وأن Markdown المعروض والملف الثنائي بلا أسطر. وظهور المستودع عامًّا من
// meta octolytics-dimension-repository_public = true (ثابتة في صفحات fixtures/spikes الحية).
// أما صفحة «غير موجود» وصفحة الدخول (الحالتان E وF) فلم يُقس كشفهما من الصفحة في T-0.4؛ فالإشارات هنا محافظة وتُختبر بمحاكاة،
// وأي صفحة لا تطابقها تُعدّ «لم تكتمل» فلا يُحكم عليها.
import type { SelectorEntry, SelectorsRegistry } from '../../../core/detector';
import type { PageLines } from './fingerprint';
import type { Visibility } from './types';

export const SELECTOR_CODE_LINE = 'g.anchor.code-line';

export const ANCHOR_SELECTORS: readonly SelectorEntry[] = [
  {
    key: SELECTOR_CODE_LINE,
    description: 'عناصر نص أسطر الكود في صفحة عرض ملف (معرّفها LC<n>)',
    candidates: ['.react-code-lines [id^="LC"]', 'td.blob-code[id^="LC"]', '[id^="LC"]'],
  },
];

export type PageView =
  /** أسطر الكود ظاهرة. */
  | { readonly state: 'code'; readonly lines: PageLines }
  /** الملف ظاهر بلا أسطر: Markdown معروض أو ملف ثنائي. */
  | { readonly state: 'rendered' }
  /** المستودع ظاهر والملف غير موجود فيه. */
  | { readonly state: 'missing' }
  /** صفحة «غير موجود» بلا مستودع ظاهر: مورد محذوف أو مُعاد تسميته، أو مستودع خاص لا وصول إليه (لا تميّز الصفحة بينهما). */
  | { readonly state: 'not-found' }
  /** صفحة دخول بدل المورد. */
  | { readonly state: 'login' }
  /** لم تكتمل الصفحة أو تخطيط غير معروف: لا حكم. */
  | { readonly state: 'unknown' };

const LC_ID = /^LC(\d+)$/;

/** أسطر الكود من DOM: رقم السطر من معرّف LC<n>، والملف كامل إن ظهرت الأسطر من 1 إلى آخرها بلا فجوة. */
export function readCodeLines(doc: Document, selectors: SelectorsRegistry): PageLines | null {
  const lines = new Map<number, string>();
  for (const el of selectors.resolveAll(doc, SELECTOR_CODE_LINE)) {
    const match = LC_ID.exec(el.id);
    if (!match) continue;
    lines.set(Number(match[1]), el.textContent ?? '');
  }
  if (!lines.size) return null;
  const max = Math.max(...lines.keys());
  return { lines, max, complete: lines.size === max };
}

interface EmbeddedFile {
  readonly path: string | null;
  readonly oid: string | null;
}

function embeddedFile(doc: Document): EmbeddedFile | null {
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const layout = (JSON.parse(script.textContent ?? '') as { payload?: { codeViewLayoutRoute?: { path?: unknown; refInfo?: { currentOid?: unknown } } } }).payload?.codeViewLayoutRoute;
      if (!layout) continue;
      return { path: typeof layout.path === 'string' ? layout.path : null, oid: typeof layout.refInfo?.currentOid === 'string' ? layout.refInfo.currentOid : null };
    } catch {
      // بيانات غير مقروءة: يُجرَّب غيرها.
    }
  }
  return null;
}

/** معرّف الالتزام الظاهر في صفحة الملف (refInfo.currentOid)، أو null. */
export const currentCommit = (doc: Document): string | null => {
  const oid = embeddedFile(doc)?.oid ?? null;
  return oid && /^[0-9a-f]{40}$/i.test(oid) ? oid.toLowerCase() : null;
};

/** عام فقط حين تعلن الصفحة ذلك صراحة؛ وكل ما عداه خاص (لا يُحفظ نص عند الشك، DEC-05). */
export function visibilityOf(doc: Document): Visibility {
  return doc.querySelector('meta[name="octolytics-dimension-repository_public"]')?.getAttribute('content') === 'true' ? 'public' : 'private';
}

const repoShown = (doc: Document): boolean => Boolean(doc.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.getAttribute('content'));

function looksNotFound(doc: Document): boolean {
  if (/^\s*(page not found|404)\b/i.test(doc.title)) return true;
  if (doc.querySelector('img[alt^="404"]')) return true;
  return /\b404\b/.test(doc.querySelector('main, [role="main"], body')?.textContent?.slice(0, 2000) ?? '') && /not found/i.test(doc.body?.textContent?.slice(0, 4000) ?? '');
}

function looksLogin(doc: Document): boolean {
  const path = doc.defaultView?.location.pathname ?? '';
  return path === '/login' || path === '/session' || Boolean(doc.querySelector('form[action="/session"]'));
}

export function readPageView(doc: Document, selectors: SelectorsRegistry): PageView {
  const lines = readCodeLines(doc, selectors);
  if (lines) return { state: 'code', lines };
  if (looksLogin(doc)) return { state: 'login' };
  if (repoShown(doc)) {
    if (embeddedFile(doc)?.path) return { state: 'rendered' };
    return looksNotFound(doc) ? { state: 'missing' } : { state: 'unknown' };
  }
  return looksNotFound(doc) ? { state: 'not-found' } : { state: 'unknown' };
}
