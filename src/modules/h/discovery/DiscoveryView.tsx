// واجهة «اكتشاف المحتوى العربي وTrending» في تبويب المجتمع (T-9.4، F-H4 وF-H6): كل استعلام يظهر كاملًا قابلًا للتعديل
// قبل الفتح، والفتح بنقر رابط صريح. المحتوى العربي (خاصية مشاريع) منفصل عن بحث الموقع المعلن (نص يكتبه صاحب الحساب).
import { useMemo, useRef, useState } from 'preact/hooks';
import type { PanelViewProps } from '../../../sidepanel/views';
import { useStyles } from '../../../shared/ui/useStyles';
import { COMMUNITY_CSS, COMMUNITY_STYLE_ID } from '../styles';
import { QueryEditor } from './QueryEditor';
import { PLACES, collectVariants, locationQueries } from './places';
import { arabicDescriptionQuery, arabicTopicsQuery, locationQuery, searchUrl, trendingUrl, TRENDING_SINCE } from './queries';
import type { TrendingSince } from './queries';
import { ARABIC_CONTENT_NOTICE, ARABIC_CONTENT_TITLE, DECLARED_NOTICE, DECLARED_TITLE, LOCATION_SEARCH_NOTICE } from './notices';

export interface DiscoveryViewOptions {
  readonly now?: () => Date;
}

const SINCE_LABELS: Readonly<Record<TrendingSince, string>> = { daily: 'اليوم', weekly: 'هذا الأسبوع', monthly: 'هذا الشهر' };

/** رابط Trending سليم: github.com/trending فقط. */
export function trendingProblem(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.origin !== 'https://github.com' || !(url.pathname === '/trending' || url.pathname.startsWith('/trending/'))) return 'الرابط ليس صفحة Trending في github.com.';
    return null;
  } catch {
    return 'الرابط غير صالح.';
  }
}

function ProjectsSection({ now }: { now: () => Date }) {
  const [preset, setPreset] = useState<'topics' | 'description'>('topics');
  const [language, setLanguage] = useState('');
  const [minStars, setMinStars] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const generate = (p: typeof preset, l: string, s: string, d: string): string => {
    const options = { ...(l.trim() ? { language: l } : {}), ...(Number(s) > 0 ? { minStars: Number(s) } : {}), ...(Number(d) > 0 ? { pushedWithinDays: Number(d) } : {}), now: now() };
    return (p === 'topics' ? arabicTopicsQuery(options) : arabicDescriptionQuery(options)).query;
  };
  const [query, setQuery] = useState(() => generate('topics', '', '', ''));
  const regenerate = (p = preset, l = language, s = minStars, d = activeDays): void => setQuery(generate(p, l, s, d));
  return (
    <section class="block" aria-labelledby="mj-disc-projects" data-section="projects">
      <h3 id="mj-disc-projects">{ARABIC_CONTENT_TITLE}: مشاريع</h3>
      <p class="muted small">{ARABIC_CONTENT_NOTICE}</p>
      <div class="grid">
        <div class="field">
          <label for="mj-disc-preset">نوع البحث</label>
          <select
            id="mj-disc-preset"
            value={preset}
            onChange={(e) => {
              const next = (e.currentTarget as HTMLSelectElement).value as typeof preset;
              setPreset(next);
              regenerate(next);
            }}
          >
            <option value="topics">مشاريع بوسوم عربية</option>
            <option value="description">وصف أو README بكلمات عربية</option>
          </select>
        </div>
        <div class="field">
          <label for="mj-disc-language">لغة البرمجة (اختياري)</label>
          <input id="mj-disc-language" type="text" dir="ltr" value={language} placeholder="python" onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setLanguage(v); regenerate(preset, v); }} />
        </div>
        <div class="field">
          <label for="mj-disc-stars">أدنى عدد نجوم</label>
          <input id="mj-disc-stars" type="number" min="0" dir="ltr" value={minStars} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setMinStars(v); regenerate(preset, language, v); }} />
        </div>
        <div class="field">
          <label for="mj-disc-active">نشط خلال (أيام)</label>
          <input id="mj-disc-active" type="number" min="0" dir="ltr" value={activeDays} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setActiveDays(v); regenerate(preset, language, minStars, v); }} />
        </div>
      </div>
      <QueryEditor id="mj-disc-projects-query" label="نص الاستعلام (عدّله قبل الفتح)" type="repositories" value={query} onChange={setQuery} />
    </section>
  );
}

function TrendingSection() {
  const [language, setLanguage] = useState('');
  const [since, setSince] = useState<TrendingSince>('weekly');
  const [spoken, setSpoken] = useState(true);
  const build = (l: string, s: TrendingSince, sp: boolean): string => trendingUrl({ ...(l.trim() ? { language: l } : {}), since: s, ...(sp ? { spokenLanguage: 'ar' } : {}) });
  const [url, setUrl] = useState(() => build('', 'weekly', true));
  const problem = trendingProblem(url);
  return (
    <section class="block" aria-labelledby="mj-disc-trending" data-section="trending">
      <h3 id="mj-disc-trending">Trending</h3>
      <div class="grid">
        <div class="field">
          <label for="mj-trend-language">لغة البرمجة (اختياري)</label>
          <input id="mj-trend-language" type="text" dir="ltr" value={language} placeholder="javascript" onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setLanguage(v); setUrl(build(v, since, spoken)); }} />
        </div>
        <div class="field">
          <label for="mj-trend-since">الفترة</label>
          <select id="mj-trend-since" value={since} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value as TrendingSince; setSince(v); setUrl(build(language, v, spoken)); }}>
            {TRENDING_SINCE.map((s) => (
              <option key={s} value={s}>
                {SINCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label class="choice">
        <input type="checkbox" checked={spoken} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).checked; setSpoken(v); setUrl(build(language, since, v)); }} />
        <span class="label">مستودعات لغة محتواها العربية (<span class="ltr-inline mono">spoken_language_code=ar</span>)</span>
      </label>
      <div class="field">
        <label for="mj-trend-url">الرابط الكامل (عدّله قبل الفتح)</label>
        <input id="mj-trend-url" type="url" dir="ltr" value={url} onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)} />
        {problem && (
          <p class="issues" role="alert" data-severity="error">
            {problem}
          </p>
        )}
      </div>
      <div class="row">
        <a class="btn btn-primary" data-action="open-trending" {...(problem ? { 'aria-disabled': 'true', role: 'link' } : { href: url, target: '_blank', rel: 'noopener noreferrer' })}>
          افتح Trending في GitHub
        </a>
      </div>
    </section>
  );
}

function LocationSection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [custom, setCustom] = useState('');
  const [language, setLanguage] = useState('');
  const [edited, setEdited] = useState<Readonly<Record<string, string>>>({});
  const variants = useMemo(
    () => collectVariants(PLACES.filter((p) => selected.has(p.id)), custom.split('\n')),
    [selected, custom],
  );
  const queries = useMemo(() => locationQueries(variants, language.trim() ? { language } : {}), [variants, language]);
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
    setEdited({});
  };
  return (
    <section class="block" aria-labelledby="mj-disc-location" data-section="location">
      <h3 id="mj-disc-location">بحث الحسابات بحقل الموقع المعلن</h3>
      <p class="notice" data-notice="location">
        {LOCATION_SEARCH_NOTICE}
      </p>
      <details>
        <summary>اختر أماكن ({selected.size})</summary>
        <div class="checks">
          {PLACES.map((place) => (
            <label key={place.id}>
              <input type="checkbox" data-place={place.id} checked={selected.has(place.id)} onChange={(e) => toggle(place.id, (e.currentTarget as HTMLInputElement).checked)} />
              <span>{place.label}</span>
            </label>
          ))}
        </div>
      </details>
      <div class="field">
        <label for="mj-loc-custom">صيغ أخرى للموقع (صيغة في كل سطر)</label>
        <textarea id="mj-loc-custom" dir="auto" rows={2} value={custom} onInput={(e) => { setCustom((e.currentTarget as HTMLTextAreaElement).value); setEdited({}); }} />
      </div>
      <div class="field">
        <label for="mj-loc-language">لغة برمجة يملك الحساب مستودعات بها (اختياري)</label>
        <input id="mj-loc-language" type="text" dir="ltr" value={language} onInput={(e) => { setLanguage((e.currentTarget as HTMLInputElement).value); setEdited({}); }} />
      </div>
      {queries.length === 0 ? (
        <p class="muted" data-empty="location">
          اختر مكانًا أو اكتب صيغة ليظهر الاستعلام.
        </p>
      ) : (
        <>
          <p class="muted small" data-variant-count="">
            {variants.length} صيغة في {queries.length} استعلام{queries.length > 1 ? 'ات (حد GitHub خمسة معاملات في الاستعلام)' : ''}.
          </p>
          {queries.map((generated, index) => (
            <QueryEditor
              key={generated.query}
              id={`mj-loc-query-${index}`}
              label={queries.length > 1 ? `الاستعلام ${index + 1} من ${queries.length}` : 'نص الاستعلام (عدّله قبل الفتح)'}
              type="users"
              value={edited[generated.query] ?? generated.query}
              onChange={(value) => setEdited({ ...edited, [generated.query]: value })}
              openLabel="افتح بحث الحسابات"
            />
          ))}
          <details>
            <summary>إن لم يقبل GitHub المعامل OR: افتح كل صيغة على حدة</summary>
            <ul class="list">
              {variants.map((variant) => (
                <li key={variant}>
                  <a href={searchUrl(locationQuery([variant], language.trim() ? { language } : {}).query, 'users')} target="_blank" rel="noopener noreferrer" data-variant-link={variant}>
                    {variant}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

function DeclaredSection() {
  return (
    <section class="block block-declared" aria-labelledby="mj-disc-declared" data-section="declared">
      <h3 id="mj-disc-declared">{DECLARED_TITLE}</h3>
      <p>{DECLARED_NOTICE}</p>
      <p class="muted small">تظهر هذه البيانات حرفيًا في بطاقة منفصلة داخل صفحة الملف الشخصي على GitHub، بمعزل عن «{ARABIC_CONTENT_TITLE}».</p>
    </section>
  );
}

export function createDiscoveryView(options: DiscoveryViewOptions = {}) {
  const now = options.now ?? (() => new Date());
  return function DiscoveryView(_props: PanelViewProps) {
    const root = useRef<HTMLDivElement>(null);
    useStyles(root, COMMUNITY_STYLE_ID, COMMUNITY_CSS);
    return (
      <div class="community" ref={root} data-view="discovery">
        <h3>اكتشاف المحتوى العربي</h3>
        <p class="muted small">تُولَّد الاستعلامات هنا محليًا ولا يُرسل شيء قبل أن تنقر رابط الفتح بنفسك.</p>
        <ProjectsSection now={now} />
        <TrendingSection />
        <LocationSection />
        <DeclaredSection />
      </div>
    );
  };
}

export const DiscoveryView = createDiscoveryView();
