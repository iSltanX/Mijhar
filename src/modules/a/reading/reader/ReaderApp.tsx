// واجهة العارض (reader.html): ترويسة بالمصدر والتحكم (إخفاء التشكيل، التحديث من الصفحة)، وشريط تلميح سلوك البحث في هذا
// المتصفح، ثم المقال. المقال يُرسم مرة في عنصر لا يعيد Preact رسمه (Article)، ويملأ محتواه view.ts بعناصر قائمة السماح.
import { Component } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SettingsStore } from '../../../../core/settings';
import type { ExtensionApi } from '../../../../core/ui-host/browser-api';
import { Toggle } from '../../../../shared/ui/compat/Toggle';
import { DEFAULT_TYPOGRAPHY, TYPOGRAPHY_KEY, isTypography } from '../../fonts/fonts';
import { READING_SNAPSHOT_MESSAGE } from '../messages';
import type { SnapshotResponse } from '../messages';
import { DEFAULT_READING_OPTIONS, READING_OPTIONS_KEY, isReadingOptions } from '../options';
import type { ReadingOptions } from '../options';
import { isSnapshot } from '../snapshot';
import type { ReadingSnapshot } from '../snapshot';
import { readerCss } from './styles';
import { DiacriticsView, SEARCH_HINTS, bindClipboard, renderSnapshot } from './view';

export interface ReaderAppProps {
  readonly settings: SettingsStore;
  readonly api: Pick<ExtensionApi, 'tabs'>;
  readonly target: 'chromium' | 'firefox';
  readonly tabId: number | null;
  readonly document?: Document;
}

type Status = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly snapshot: ReadingSnapshot } | { readonly kind: 'error'; readonly message: string };

const ERRORS = {
  'no-tab': 'لا تبويب مصدر لهذا العارض. افتحه من زر «وضع القراءة» في صفحة GitHub.',
  'no-content': 'لا محتوى Markdown في الصفحة الأصلية الآن.',
  disabled: 'وضع القراءة غير مفعَّل في الصفحة الأصلية.',
  unreachable: 'تعذّر الوصول إلى الصفحة الأصلية: ربما أُغلقت، أو انتقلت خارج GitHub، أو أُوقف وضع القراءة فيها.',
  invalid: 'وصلت من الصفحة الأصلية بيانات لا يعرف العارض شكلها.',
} as const;

/** عنصر المقال: يُرسم مرة ولا يمسّه Preact بعدها، فيملك view.ts محتواه. */
class Article extends Component<{ readonly onMount: (el: HTMLElement) => void }> {
  override shouldComponentUpdate(): boolean {
    return false;
  }

  override render() {
    return <article class="reader-article markdown-host" dir="ltr" aria-label="المحتوى" ref={(el) => {
          if (el) this.props.onMount(el);
        }} />;
  }
}

export function ReaderApp({ settings, api, target, tabId, document: doc = globalThis.document }: ReaderAppProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const storedReading = settings.get<ReadingOptions & Record<string, boolean>>(READING_OPTIONS_KEY);
  const [hidden, setHidden] = useState(isReadingOptions(storedReading) ? storedReading.hideDiacritics : DEFAULT_READING_OPTIONS.hideDiacritics);
  const article = useRef<HTMLElement | null>(null);
  const view = useRef<DiacriticsView | null>(null);
  const firstUrl = useRef<string | null>(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  // الطباعة من إعدادات الوحدة (أ)، وخطوطها من الحزمة بعناوين نسبية (صفحة الإضافة لا تخضع لـCSP صفحة GitHub).
  useEffect(() => {
    const style = doc.createElement('style');
    style.id = 'mijhar-reader-styles';
    const apply = (): void => {
      const stored = settings.get(TYPOGRAPHY_KEY);
      style.textContent = readerCss(isTypography(stored) ? stored : DEFAULT_TYPOGRAPHY);
    };
    apply();
    doc.head.append(style);
    const unsubscribe = settings.subscribe((change) => change.key === TYPOGRAPHY_KEY && apply());
    const unbind = bindClipboard(doc, () => view.current);
    return () => {
      unsubscribe();
      unbind();
      style.remove();
    };
  }, [settings, doc]);

  const show = (snapshot: ReadingSnapshot): void => {
    const root = article.current;
    if (!root) return;
    renderSnapshot(root, snapshot);
    view.current = new DiacriticsView(root);
    if (hiddenRef.current) view.current.hide();
    firstUrl.current ??= snapshot.url;
    doc.title = `وضع القراءة — ${snapshot.title}`;
    setStatus({ kind: 'ready', snapshot });
  };

  const load = async (): Promise<void> => {
    if (tabId === null || !api.tabs) {
      setStatus({ kind: 'error', message: ERRORS['no-tab'] });
      return;
    }
    setStatus({ kind: 'loading' });
    let response: unknown;
    try {
      response = await api.tabs.sendMessage(tabId, { type: READING_SNAPSHOT_MESSAGE });
    } catch {
      setStatus({ kind: 'error', message: ERRORS.unreachable });
      return;
    }
    const typed = response as SnapshotResponse | undefined;
    if (!typed) setStatus({ kind: 'error', message: ERRORS.unreachable });
    else if (!typed.ok) setStatus({ kind: 'error', message: ERRORS[typed.reason] ?? ERRORS.unreachable });
    else if (!isSnapshot(typed.snapshot)) setStatus({ kind: 'error', message: ERRORS.invalid });
    else show(typed.snapshot);
  };

  useEffect(() => {
    void load();
  }, [tabId]);

  const toggle = (value: boolean): void => {
    setHidden(value);
    if (value) view.current?.hide();
    else view.current?.show();
    void settings.set(READING_OPTIONS_KEY, { hideDiacritics: value }).catch(() => undefined);
  };

  const snapshot = status.kind === 'ready' ? status.snapshot : null;
  return (
    <main class="reader">
      <header class="reader-header">
        <div class="reader-title">
          <h1>وضع القراءة</h1>
          {snapshot ? (
            <a class="small ltr-inline reader-source" href={snapshot.url} target="_blank" rel="noopener noreferrer">
              {snapshot.url}
            </a>
          ) : null}
        </div>
        <div class="row reader-controls">
          <label class="row" for="mj-hide-diacritics">
            <Toggle id="mj-hide-diacritics" checked={hidden} onChange={toggle} label="إخفاء التشكيل في العرض" />
            <span>إخفاء التشكيل في العرض</span>
          </label>
          <button type="button" class="btn" onClick={() => void load()} disabled={status.kind === 'loading'}>
            تحديث من الصفحة
          </button>
        </div>
        <p class="notice small reader-hint" role="note">
          {SEARCH_HINTS[target]} النسخ والسحب من العارض يحملان النص بتشكيله الأصلي، وصفحة GitHub لا تتغير.
        </p>
        {snapshot?.truncated ? <p class="notice small" data-tone="danger">المحتوى أطول من حدّ العارض فعُرض أوله فقط.</p> : null}
        {snapshot && firstUrl.current && snapshot.url !== firstUrl.current ? (
          <p class="notice small">انتقلت الصفحة الأصلية إلى عنوان آخر، فالمعروض محتواها الجديد.</p>
        ) : null}
        {status.kind === 'error' ? (
          <p class="notice small" data-tone="danger" role="alert">
            {status.message}
          </p>
        ) : null}
        {status.kind === 'loading' ? <p class="small muted" role="status">يُحمَّل المحتوى…</p> : null}
      </header>
      <Article onMount={(el) => (article.current = el)} />
    </main>
  );
}
