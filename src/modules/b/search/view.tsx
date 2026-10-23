// واجهة البحث في القاموس (F-B6 / AC-B6) في تبويب «القاموس والتعلّم» من اللوحة الأصلية والدرج:
//  - خانة بحث فورية بالعربية والإنجليزية والمرادفات (engine.ts) وتصفية بالتصنيف بأزرار تعلن أعدادها؛
//  - لكل نتيجة: المصطلح بصيغة «العربي (English)»، وقراءة الشرح الكامل في موضعه (بطاقة الشرح نفسها)، ورابط docs.github.com حيث يثبت المصدر،
//    وزر «أبرز الموضع في الصفحة» (يحدد العنصر في الصفحة النشطة أو يعرض مسار التبويب الذي يوجد فيه)؛
//  - أمر فتح القاموس Alt+K يفتح اللوحة على هذا التبويب والتركيز في خانة البحث (PANEL_REQUEST_KEY).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { PANEL_REQUEST_KEY, isFreshPanelRequest } from '../../../core/ui-host/units';
import type { PanelRequest } from '../../../core/ui-host/units';
import type { Category, GlossaryEntry } from '../../../data/glossary/types';
import type { PanelViewProps } from '../../../sidepanel/views';
import { useSetting } from '../../../shared/ui/useSetting';
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import { useStyles } from '../../../shared/ui/useStyles';
import { En, ExplainCard, MixedText, TermTitle } from '../card/card';
import { docsLink } from '../card/display';
import { GLOSSARY_ENTRIES } from '../card/entries';
import { CARD_CSS } from '../card/overlay';
import { defaultBridge } from './bridge';
import type { LocateBridge } from './bridge';
import { CATEGORY_IDS, CATEGORY_LABELS, buildSearchIndex, categoryCounts, search } from './engine';
import type { SearchHit } from './engine';
import { GLOSSARY_SHORTCUT, GLOSSARY_TAB } from './ids';
import type { LocateResult } from './locate';
import { whereIs } from './paths';
import { SEARCH_CSS, SEARCH_STYLE_ID } from './styles';

export const PAGE_SIZE = 20;

const VIA_LABELS: Record<SearchHit['via'], string> = { name: '', synonym: 'مطابقة بمرادف', summary: 'مطابقة في الملخص', body: 'مطابقة في الشرح' };

export function countLabel(n: number): string {
  if (n === 0) return 'لا نتائج';
  if (n === 1) return 'نتيجة واحدة';
  if (n === 2) return 'نتيجتان';
  return n <= 10 ? `${n} نتائج` : `${n} نتيجة`;
}

type LocateState = { readonly id: string; readonly state: 'working' | LocateResult } | null;

/** نص نتيجة «أبرز الموضع». */
export function LocateNote({ entry, state }: { entry: GlossaryEntry; state: 'working' | LocateResult }) {
  if (state === 'working') return <p class="locate-note" role="status" data-status="working">جارٍ البحث عن العنصر في الصفحة…</p>;
  const paths = whereIs(entry).paths;
  switch (state.status) {
    case 'found':
      return (
        <p class="locate-note" role="status" data-status="found">
          أُبرز الموضع في الصفحة{state.count > 1 ? ` (${state.count} عناصر، يُبرز منها ما هو في النافذة)` : ''}. اضغط <kbd>Esc</kbd> في الصفحة لإزالة الإبراز.
        </p>
      );
    case 'elsewhere':
      return (
        <div class="locate-note" role="status" data-status="elsewhere">
          <p>{state.here ? 'لم يُعثر عليه في هذه الصفحة؛ قد يكون غير ظاهر لك بسبب صلاحيتك أو حالة الصفحة. يوجد في:' : 'ليس في هذه الصفحة. يوجد في:'}</p>
          <ul>
            {state.paths.map((path) => (
              <li key={path}>
                <MixedText text={path} />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'concept':
      return (
        <p class="locate-note" role="status" data-status="concept">
          مصطلح عام لا يقابله عنصر محدد في الصفحة؛ اقرأ شرحه هنا.
        </p>
      );
    case 'unavailable':
      return (
        <div class="locate-note" role="status" data-status="unavailable">
          <p>افتح صفحة على <En>github.com</En> في التبويب النشط ثم أعد المحاولة لإبراز الموضع.{paths.length ? ' ويوجد هذا العنصر في:' : ''}</p>
          {paths.length > 0 && (
            <ul>
              {paths.map((path) => (
                <li key={path}>
                  <MixedText text={path} />
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    default:
      return <p class="locate-note" role="status" data-status="unknown">تعذّر تحديد هذا المدخل.</p>;
  }
}

function Result({
  hit,
  open,
  onToggle,
  onLocate,
  onClearLocate,
  locate,
}: {
  hit: SearchHit;
  open: boolean;
  onToggle: () => void;
  onLocate: () => void;
  onClearLocate: () => void;
  locate: LocateState;
}): ComponentChildren {
  const { entry } = hit;
  const docs = docsLink(entry);
  const mine = locate && locate.id === entry.id ? locate.state : null;
  const via = VIA_LABELS[hit.via];
  return (
    <li class="result" data-entry={entry.id} data-via={hit.via} data-open={open ? 'true' : 'false'}>
      <div class="result-head">
        <h4 class="result-title">
          <TermTitle entry={entry} />
        </h4>
        <span class="tag" data-safety={entry.safety}>
          {entry.safety}
        </span>
      </div>
      <div class="result-meta">
        <span class="tag" data-category={entry.category}>
          {CATEGORY_LABELS[entry.category]}
        </span>
        {via && <span class="via">{via}</span>}
      </div>
      <p class="result-brief">
        <MixedText text={entry.brief} />
      </p>
      <div class="actions">
        <button type="button" class="btn" data-action="read" aria-expanded={open ? 'true' : 'false'} onClick={onToggle}>
          {open ? 'أخفِ الشرح' : 'اقرأ الشرح'}
        </button>
        <button type="button" class="btn" data-action="locate" disabled={mine === 'working'} onClick={onLocate}>
          أبرز الموضع في الصفحة
        </button>
        {docs && (
          <a class="btn" href={docs} target="_blank" rel="noopener noreferrer" data-action="docs">
            الوثيقة على <En>docs.github.com</En>
          </a>
        )}
        {mine && typeof mine !== 'string' && mine.status === 'found' && (
          <button type="button" class="btn" data-action="clear-locate" onClick={onClearLocate}>
            أزل الإبراز
          </button>
        )}
      </div>
      {mine && <LocateNote entry={entry} state={mine} />}
      {open && (
        <div class="card-slot">
          <ExplainCard entry={entry} idPrefix={`mj-gs-${entry.id}`} />
        </div>
      )}
    </li>
  );
}

// آخر طلب ركّز الخانة (يُركَّز مرة لكل طلب حتى لو أُعيد تركيب الواجهة بتبديل التبويب).
let lastFocusedRequest = 0;

export interface GlossarySearchViewProps extends PanelViewProps {
  readonly bridge?: LocateBridge;
  readonly entries?: readonly GlossaryEntry[];
}

export function GlossarySearchView({ settings, bridge, entries = GLOSSARY_ENTRIES }: GlossarySearchViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [locate, setLocate] = useState<LocateState>(null);
  const [link] = useState<LocateBridge>(() => bridge ?? defaultBridge());
  const index = useMemo(() => buildSearchIndex(entries), [entries]);
  const hits = useMemo(() => search(index, query, { category }), [index, query, category]);
  const counts = useMemo(() => categoryCounts(index, query), [index, query]);
  const request = useSetting<PanelRequest | null>(settings, PANEL_REQUEST_KEY);
  useStyles(root, SEARCH_STYLE_ID, `${CARD_CSS}\n${SEARCH_CSS}`);

  // أمر فتح القاموس: التركيز في خانة البحث مرة لكل طلب حديث.
  useEffect(() => {
    if (!isFreshPanelRequest(request) || request.tab !== GLOSSARY_TAB || lastFocusedRequest === request.at) return;
    lastFocusedRequest = request.at;
    input.current?.focus();
    input.current?.select();
  }, [request]);

  const shown = hits.slice(0, limit);
  const reset = (): void => {
    setLimit(PAGE_SIZE);
    setOpenId(null);
  };
  const doLocate = (entry: GlossaryEntry): void => {
    setLocate({ id: entry.id, state: 'working' });
    link.locate(entry.id).then(
      (state) => setLocate({ id: entry.id, state }),
      () => setLocate({ id: entry.id, state: { status: 'unavailable' } }),
    );
  };

  return (
    <section class="section" data-view="glossary-search" aria-labelledby="mj-gs-title">
      <div class="gsearch" ref={root}>
        <h3 id="mj-gs-title">البحث في القاموس</h3>
        <p class="muted">
          ابحث بالعربية أو الإنجليزية أو بمرادف (مثل «كوميت» أو «PR»). يُفتح من أي صفحة بـ<kbd>{GLOSSARY_SHORTCUT}</kbd> (اختصار افتراضي مؤقت).
        </p>
        <div class="search-box" role="search">
          <label class="sr-only" for="mj-gs-input">
            ابحث في القاموس
          </label>
          <input
            id="mj-gs-input"
            ref={input}
            type="search"
            dir="auto"
            autocomplete="off"
            spellcheck={false}
            placeholder="مثال: فرع، commit، مراجعة…"
            value={query}
            data-field="query"
            onInput={(event) => {
              setQuery((event.currentTarget as HTMLInputElement).value);
              reset();
            }}
          />
          {query && (
            <button
              type="button"
              class="btn icon-btn"
              data-action="clear"
              aria-label="مسح البحث"
              title="مسح البحث"
              onClick={() => {
                setQuery('');
                reset();
                input.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>
        <div class="chips" role="group" aria-label="تصفية بالتصنيف">
          {(['all', ...CATEGORY_IDS] as const).map((id) => (
            <button
              type="button"
              class="chip-btn"
              key={id}
              data-category={id}
              data-empty={counts[id] === 0 ? 'true' : 'false'}
              aria-pressed={category === id ? 'true' : 'false'}
              onClick={() => {
                setCategory(id);
                reset();
              }}
            >
              {id === 'all' ? 'الكل' : CATEGORY_LABELS[id]}
              <span aria-hidden="true">({counts[id]})</span>
              <span class="sr-only">، {countLabel(counts[id])}</span>
            </button>
          ))}
        </div>
        <p class="count" role="status" aria-live="polite" data-count={hits.length}>
          {query.trim() ? `${countLabel(hits.length)} لـ«${query.trim()}»` : countLabel(hits.length)}
          {category !== 'all' ? ` في «${CATEGORY_LABELS[category]}»` : ''}
        </p>
        {hits.length === 0 ? (
          <div class="empty" data-empty-results>
            <p>
              <strong>لا مطابقات.</strong>
            </p>
            <p class="small">جرّب كلمة أقصر، أو الاسم الإنجليزي كما يظهر في GitHub، أو أزل تصفية التصنيف.</p>
          </div>
        ) : (
          <ul class="results" aria-label="نتائج البحث">
            {shown.map((hit) => (
              <Result
                key={hit.entry.id}
                hit={hit}
                open={openId === hit.entry.id}
                onToggle={() => setOpenId(openId === hit.entry.id ? null : hit.entry.id)}
                onLocate={() => doLocate(hit.entry)}
                onClearLocate={() => {
                  void link.clear();
                  setLocate(null);
                }}
                locate={locate}
              />
            ))}
          </ul>
        )}
        {hits.length > shown.length && (
          <button type="button" class="btn more" data-action="more" onClick={() => setLimit(limit + PAGE_SIZE)}>
            عرض المزيد ({hits.length - shown.length})
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * بديل الواجهة في الدرج المحقون: الدرج لا يعرض حقول إدخال أصلًا (DEC-04 واختبار الدرج في MJ5 وMJ9)، فيُعرض مكانها بيان يدل على اللوحة الأصلية. أمر Alt+K يفتح
 * اللوحة الأصلية في Chromium وFirefox؛ فيصل المستخدم إلى الخانة، ويبقى الدرج للشرح السياقي وزر وضع الشرح.
 */
export function GlossarySearchDrawerNotice() {
  return <NativeOnlyNotice feature="البحث في القاموس" extra={`يفتح أمر «ابحث في قاموس مِجهَر» (${GLOSSARY_SHORTCUT}) اللوحة الأصلية على هذا البحث.`} />;
}
