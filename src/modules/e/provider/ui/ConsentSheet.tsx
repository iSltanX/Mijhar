// تجربة الموافقة قبل الإرسال (T-11.6، AC-E9 (٢) و(٧)، مكوّن Consent sheet): تتوسع داخل القسم بطلب المستخدم وحده، وتبيّن ما يُرسل وحجمه وما
// استُبعد منه والوجهة (المزوّد والمودل)، والنص كاملًا لمن أراد. لا سعر ولا تكلفة ولا تنبيه مالي (AD-31).
// «إرسال للتحليل» (بتوجيه المالك 2026-10-24) يقبل تفعيل المستخدم الحقيقي وحده (isTrustedActivation، AD-27): نقرة الفأرة، وEnter أو Space على الزر،
// وتفعيل تقنيات الإتاحة، وكلها حدث click موثوق يولّده المتصفح من زر أصلي؛ أما click() أو حدث يُنشئه سكربت في الصفحة فلا يُصدر طلبًا. ولا يُشترط
// event.detail فلا ينكسر تفعيل لوحة المفاتيح وتقنيات الإتاحة. وعند الفتح ينتقل التركيز إلى عنوان البطاقة لا إلى زر الإرسال، فلا يُرسل شيء
// بضغطة Enter لم يقصدها المستخدم. ويُرسم في جذر ظل داخل صفحة GitHub، فلا حقل فيه ولا سرّ.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Ltr } from '../../../../shared/ui/compat/Ltr';
import { Icon } from '../../../../shared/ui/icons';
import { isTrustedActivation } from '../../../../shared/ui/user-activation';
import type { PreparedAnalysis } from '../request';

export interface ConsentDestination {
  readonly provider: string;
  readonly host: string;
  /** المودل الذي سيُرسل إليه، أو null حين لم تُقرأ قائمة المودلات بعد. */
  readonly model: { readonly id: string; readonly displayName: string } | null;
  /** صلاحية مضيف المزوّد ممنوحة. */
  readonly permission: boolean;
}

export interface ConsentSheetProps {
  readonly prepared: PreparedAnalysis;
  readonly destination: ConsentDestination;
  /** سبب يمنع الإرسال الآن (موعد إعادة محاولة أعلنه المزوّد مثلًا)، أو null. */
  readonly blocked?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** يفتح إعدادات التحليل (المودل والصلاحية) في الإعدادات. */
  readonly onSettings: () => void;
}

const count = (n: number): string => n.toLocaleString('en-US');

export function ConsentSheet({ prepared, destination, blocked = null, onConfirm, onCancel, onSettings }: ConsentSheetProps) {
  const [shown, setShown] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const { consent } = prepared;
  const ready = destination.model !== null && destination.permission && !blocked;
  const model = destination.model ? destination.model.displayName : 'مودل لم يُحدَّد بعد';
  return (
    <section class="mj-consent" data-consent="" role="group" aria-labelledby="mj-consent-title" aria-describedby="mj-consent-lead">
      <header class="mj-consent-head">
        <Icon name="explain" />
        <h4 id="mj-consent-title" ref={title} tabIndex={-1}>
          إرسال هذا إلى {destination.provider} للتحليل؟
        </h4>
      </header>
      <p class="mj-consent-lead" id="mj-consent-lead" data-consent-lead="">
        سيُرسَل المحتوى الموضّح أدناه، بعد تنقيحه في متصفحك، إلى <strong>{destination.provider}</strong> (<Ltr className="mono">{destination.host}</Ltr>) عبر
        مفتاحك ليحلّله المودل <Ltr>{model}</Ltr>. لا يُرسل شيء قبل أن تختار «إرسال للتحليل».
      </p>
      <dl class="mj-consent-rows">
        <div data-consent-row="content">
          <dt>المحتوى</dt>
          <dd>
            {consent.parts.length ? consent.parts.join('، ') : 'لا قسم وصله محتوى من الصفحة'} — بقالب «{consent.template}»، بعد التنقيح.
          </dd>
        </div>
        <div data-consent-row="size">
          <dt>الحجم</dt>
          <dd>
            نحو {count(consent.size.chars)} حرف في {count(consent.size.lines)} سطرًا
          </dd>
        </div>
        <div data-consent-row="excluded">
          <dt>استُبعد</dt>
          <dd>
            لا يُرفق رمز GitHub بالطلب. ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال
            {consent.masked > 0 ? ` (حُجب ${count(consent.masked)} موضعًا مطابقًا لأنماطها)` : ''}؛ راجع ما سيُرسل للتأكد.
            {consent.excluded.length > 0 && (
              <details>
                <summary>وما لم يصل أو اقتُطع: {count(consent.excluded.length)} بندًا</summary>
                <ul>
                  {consent.excluded.map((line) => (
                    <li key={line}>{line.replace(/^- /, '').replace(/\*\*/g, '')}</li>
                  ))}
                </ul>
              </details>
            )}
          </dd>
        </div>
        <div data-consent-row="destination">
          <dt>الوجهة</dt>
          <dd>
            {destination.model ? (
              <>
                <Ltr>{`${destination.provider} · ${destination.model.displayName}`}</Ltr> عبر مفتاحك، إلى <Ltr className="mono">{destination.host}</Ltr> وحده
              </>
            ) : (
              <>لم يُحدَّد مودل بعد: تحقق من المفتاح في الإعدادات لتُقرأ قائمة المودلات من المزوّد.</>
            )}
          </dd>
        </div>
      </dl>
      <div class="mj-consent-links">
        <button type="button" class="mj-link" data-action="consent-preview" aria-expanded={shown ? 'true' : 'false'} onClick={() => setShown(!shown)}>
          {shown ? 'أخفِ ما سيُرسل' : 'اعرض ما سيُرسل'}
        </button>
        <button type="button" class="mj-link" data-action="consent-settings" onClick={onSettings}>
          غيّر المودل
        </button>
      </div>
      {shown && (
        <div class="mj-consent-preview" data-consent-preview="">
          <p class="mj-muted">تعليمات صيغة الرد الثابتة:</p>
          <pre dir="auto">{prepared.system}</pre>
          <p class="mj-muted">السياق المنقّح:</p>
          <pre dir="auto">{prepared.prompt}</pre>
        </div>
      )}
      <p class="mj-note" data-tone="info">
        لا يُرفق رمز GitHub، ويُنقَّح المحتوى لاكتشاف الأسرار قبل الإرسال. راجع ما سيُرسل للتأكد. والرد اقتراح نموذج يُعرض نصًّا ولا يُنفَّذ منه شيء.
      </p>
      {!destination.permission && (
        <p class="mj-note" data-tone="warning" data-consent-blocked="permission">
          {__TARGET__ === 'firefox' ? (
            <>
              صلاحية <Ltr className="mono">{destination.host}</Ltr> أو موافقة Firefox على مشاركة محتوى المواقع غير ممنوحة؛ امنحهما من بطاقة مفتاح المزوّد في الإعدادات.
            </>
          ) : (
            <>
              صلاحية <Ltr className="mono">{destination.host}</Ltr> غير ممنوحة؛ امنحها من بطاقة مفتاح المزوّد في الإعدادات.
            </>
          )}
        </p>
      )}
      {blocked && (
        <p class="mj-note" data-tone="warning" data-consent-blocked="other">
          {blocked}
        </p>
      )}
      <div class="mj-consent-actions">
        <button type="button" class="mj-btn" data-action="consent-cancel" onClick={onCancel}>
          إلغاء
        </button>
        <button
          type="button"
          class="mj-btn mj-btn-primary"
          data-action="consent-confirm"
          aria-describedby="mj-consent-lead"
          disabled={!ready}
          onClick={(event) => isTrustedActivation(event) && onConfirm()}
        >
          إرسال للتحليل
        </button>
      </div>
    </section>
  );
}
