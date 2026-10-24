// القسم الاختياري «ترجمة مسودتي» (T-7.3 / F-F5 / AC-F5): منفصل بصريًا وبرمجيًا عن القسم الثابت. هو وحده الذي يستورد خدمة الترجمة المجرّدة (T-4.1) وتقنيع الرموز (T-4.2):
//  - لا يبدأ شيء إلا بنقر صريح؛ والمسودة تمر بتقنيع الرموز (الكود والمسارات والروابط…) ثم فحص سلامتها بعد الترجمة، وإن أخلّ المحرك بها بقي الأصل مع تنبيه ولم يُعرض نص مشوَّه؛
//  - المراجعة اليدوية قبل الإدراج: لا تُفعَّل أزرار الإدراج قبل أن يؤكد المستخدم أنه راجع الترجمة، والإدراج بالإدراج الآمن نفسه (لا مسح للمسودة ولا استبدال لها)؛
//  - غياب المحرك يعرض «المحرك غير متاح» ولا أثر له في القسم الثابت: لا تعديل في مكوّناته ولا في سلوكها؛
//  - حزمة اللغة التي ينزّلها المتصفح (availability: 'consent'، T-4.4 / G-1): المحرك موجود فيبقى الزر ظاهرًا، وكل نقرة تسأل المحرك عن حالته؛ فإن احتاج موافقة عُرضت بطاقة الاستئذان
//    بدل الترجمة ولا create() قبل «موافق»، وتبدأ الترجمة من نقرة «موافق» نفسها كما في شريط الترجمة.
import { useEffect, useRef, useState } from 'preact/hooks';
import { translateProtected } from '../../c/masking';
import type { ProtectedTranslation } from '../../c/masking';
import { getTranslationService, isAbort, onTranslationServiceChange } from '../../c/ui/service';
import type { Availability, TranslationService } from '../../c/ui/service';
import type { InsertMode } from '../composer/insert';

export interface TranslateDraftProps {
  /** مسودة حقل الكتابة الحالية. */
  readonly draft: string;
  readonly onInsert: (text: string, mode: InsertMode) => void;
}

type ServiceView = { readonly state: 'checking' } | { readonly state: 'absent' } | { readonly state: 'unavailable'; readonly reason: string } | { readonly state: 'ready'; readonly service: TranslationService };

/** بطاقة الاستئذان كما يعيدها المحرك (حالة 'consent' في عقد الخدمة)، دون استيراد وحدة إدارة النموذج. */
type ConsentCard = Extract<Availability, { readonly state: 'consent' }>['card'];

function useService(): readonly [ServiceView, (view: ServiceView) => void] {
  const [view, setView] = useState<ServiceView>(() => (getTranslationService() ? { state: 'checking' } : { state: 'absent' }));
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      const service = getTranslationService();
      if (!service) {
        setView({ state: 'absent' });
        return;
      }
      setView({ state: 'checking' });
      service.availability().then(
        (availability: Availability) => {
          if (!alive || getTranslationService() !== service) return;
          // 'consent': المحرك موجود وجاهز، وأول استدعاء سينزّل المتصفح حزمة لغة؛ فالقسم جاهز والموافقة تُطلب عند النقر لا هنا.
          setView(availability.state === 'ready' || availability.state === 'consent' ? { state: 'ready', service } : availability.state === 'unavailable' ? { state: 'unavailable', reason: availability.reason } : { state: 'absent' });
        },
        (error: unknown) => alive && setView({ state: 'unavailable', reason: error instanceof Error ? error.message : String(error) }),
      );
    };
    refresh();
    const stop = onTranslationServiceChange(refresh);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return [view, setView];
}

type Run = { readonly phase: 'idle' } | { readonly phase: 'working' } | { readonly phase: 'done'; readonly result: ProtectedTranslation; readonly source: string } | { readonly phase: 'error'; readonly message: string };

export function TranslateDraftSection({ draft, onInsert }: TranslateDraftProps) {
  const [view, setView] = useService();
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const [reviewed, setReviewed] = useState(false);
  /** بطاقة الاستئذان المعروضة بدل الأزرار، ومعها الخدمة التي طلبتها (فتزول إن تبدّلت الخدمة). */
  const [ask, setAsk] = useState<{ readonly card: ConsentCard; readonly service: TranslationService } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const translateRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  // البطاقة تأخذ التركيز حين تظهر؛ وبعد «ليس الآن» يعود التركيز إلى زر الترجمة الذي زال معها.
  useEffect(() => {
    if (ask) confirmRef.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      translateRef.current?.focus();
    }
  }, [ask]);

  /** كل نقرة تسأل المحرك عن حالته: موافقة مطلوبة ← بطاقة بلا create()، وجاهز ← ترجمة، وغير ذلك ← حالة القسم. */
  const translate = (service: TranslationService): void => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const source = draft;
    setAsk(null);
    setRun({ phase: 'working' });
    setReviewed(false);
    service.availability().then(
      (availability: Availability) => {
        if (controller.signal.aborted) return;
        if (availability.state === 'consent') {
          setRun({ phase: 'idle' });
          setAsk({ card: availability.card, service });
          return;
        }
        if (availability.state !== 'ready') {
          setRun({ phase: 'idle' });
          setView(availability.state === 'unavailable' ? { state: 'unavailable', reason: availability.reason } : { state: 'absent' });
          return;
        }
        translateProtected(source, (masked, context) => service.translate(masked, context), { signal: controller.signal }).then(
          (result) => !controller.signal.aborted && setRun({ phase: 'done', result, source }),
          (error: unknown) => !controller.signal.aborted && setRun(isAbort(error) ? { phase: 'idle' } : { phase: 'error', message: error instanceof Error ? error.message : String(error) }),
        );
      },
      (error: unknown) => !controller.signal.aborted && setRun({ phase: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  };

  /** نقرة «موافق»: تمنح الموافقة وتبدأ الترجمة من النقرة نفسها (create() تحتاج نشاط نقرة ما دامت الحزمة غير منزّلة). */
  const confirm = (service: TranslationService): void => {
    service.grantConsent?.();
    translate(service);
  };
  const decline = (): void => {
    refocus.current = true;
    setAsk(null);
  };

  return (
    <section class="translate-section" data-section="translate-draft" aria-labelledby="mj-translate-title" data-service={view.state}>
      <h3 id="mj-translate-title">ترجمة مسودتي (اختياري)</h3>
      {view.state === 'absent' && (
        <p class="note" role="status" data-translate-status="absent">
          المحرك غير متاح: لم يُفعَّل محرك ترجمة محلي. هذا القسم اختياري، والقسم الثابت أعلاه يعمل كاملًا بدونه.
        </p>
      )}
      {view.state === 'checking' && (
        <p class="note" role="status" data-translate-status="checking">
          جارٍ التحقق من جاهزية المحرك…
        </p>
      )}
      {view.state === 'unavailable' && (
        <p class="note" role="status" data-translate-status="unavailable">
          المحرك غير متاح: {view.reason}
        </p>
      )}
      {view.state === 'ready' && (
        <>
          <p class="note">
            تترجم مسودة الحقل (من الإنجليزية إلى العربية) بمحرك محلي: يُقنَّع الكود والمسارات والروابط قبل الترجمة ويُفحص سليمًا بعدها، ثم تراجع الترجمة بنفسك قبل أي إدراج. لا يبدأ شيء إلا
            بضغطك.
          </p>
          {ask && ask.service === view.service ? (
            <div class="consent" role="group" aria-label={ask.card.title} data-consent="">
              <p class="note">
                <strong>{ask.card.title}</strong>
              </p>
              <ul class="note">
                {ask.card.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div class="actions">
                <button type="button" class="btn btn-primary" data-action="consent-confirm" ref={confirmRef} onClick={() => confirm(view.service)}>
                  {ask.card.confirmLabel}
                </button>
                <button type="button" class="btn" data-action="consent-decline" onClick={decline}>
                  {ask.card.declineLabel}
                </button>
              </div>
            </div>
          ) : (
            <div class="actions">
              <button type="button" class="btn" data-action="translate-draft" ref={translateRef} disabled={run.phase === 'working' || draft.trim() === ''} onClick={() => translate(view.service)}>
                {run.phase === 'working' ? 'جارٍ الترجمة…' : 'ترجم مسودة الحقل'}
              </button>
              {run.phase === 'working' && (
                <button type="button" class="btn" data-action="translate-cancel" onClick={() => (abort.current?.abort(), setRun({ phase: 'idle' }))}>
                  إلغاء
                </button>
              )}
            </div>
          )}
          {draft.trim() === '' && run.phase === 'idle' && <p class="note">اكتب مسودة في الحقل أولًا ثم ترجمها.</p>}
          {run.phase === 'error' && (
            <p class="status" role="alert" data-tone="warn" data-translate-result="error">
              تعذّرت الترجمة: {run.message}
            </p>
          )}
          {run.phase === 'done' && run.result.status === 'original-kept' && (
            <p class="status" role="alert" data-tone="warn" data-translate-result="original-kept">
              {run.result.warning} لم يُعرض نص مترجم ولن يُدرج شيء.
            </p>
          )}
          {run.phase === 'done' && run.result.status === 'translated' && (
            <div class="translated" data-translate-result="translated">
              <h4>الترجمة للمراجعة</h4>
              <p class="translated-text" dir="rtl" tabIndex={0} data-translated-text="">
                {run.result.parts.map((part, i) => (part.kind === 'protected' ? <bdi key={i} dir="ltr" class="protected">{part.value}</bdi> : <span key={i}>{part.value}</span>))}
              </p>
              <label class="choice">
                <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.currentTarget.checked)} data-option="reviewed" />
                <span>راجعتُ هذه الترجمة بنفسي وأوافق على إدراجها.</span>
              </label>
              <div class="actions">
                <button type="button" class="btn btn-primary" data-action="translated-insert-cursor" disabled={!reviewed} onClick={() => onInsert(run.result.status === 'translated' ? run.result.text : '', 'cursor')}>
                  أدرج الترجمة عند المؤشر
                </button>
                <button type="button" class="btn" data-action="translated-insert-append" disabled={!reviewed} onClick={() => onInsert(run.result.status === 'translated' ? run.result.text : '', 'append')}>
                  ألحق الترجمة في النهاية
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
