// «لماذا مفتاح مزوّد التحليل؟» في صفحة الإعدادات (AD-29، AC-E9 (٨)، الإطار O-18): ما يضيفه المفتاح وأين يظهر داخل الأقسام القائمة بمثال قصير لكل
// منها موسوم «احتمال يحتاج تحققًا»، وما يُرسل ولمن ومتى، وما يبقى دونه. لا أسعار ولا تكلفة ولا روابط لها (AD-31)، ولا ذكر لميزة لم تُدمج.
// والأقسام وعناوينها من سجل الميزات نفسه (CONNECTED_FEATURES)، فلا تختلف عما يظهر فيها. لا طلب شبكة من الصفحة؛ ورابط سياسة المزوّد يُفتح بنقر.
// MJ23 (AC-E10 (٧)، الإطار O-26): لا يُحصر التحليل في مزوّد: أسماء المزوّدين ومضيفاتهم وسياساتهم من سجلهم الوصفي، فلا يُذكر مزوّد لم يُدمج محوّله.
import { useEffect, useRef } from 'preact/hooks';
import { CONNECTED_FEATURES } from '../../core/connections/features';
import { PROVIDER_DESCRIPTORS, providerNames } from '../../modules/e/provider/catalog';
import type { ProviderDescriptor } from '../../modules/e/provider/types';
import { Ltr } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';
import type { IconName } from '../../shared/ui/icons';
import { useStyles } from '../../shared/ui/useStyles';
import { GUIDE_CSS, Note, external } from './TokenGuide';

export interface ProviderKeyGuideProps {
  /** يعود إلى الإعدادات. */
  readonly onBack: () => void;
  /** يفتح بطاقة المفتاح في الإعدادات. */
  readonly onAdd: () => void;
  /** السجل الوصفي (للاختبار بمزوّدين وهميين). */
  readonly descriptors?: readonly ProviderDescriptor[];
}

const PLACES: Readonly<Record<string, { readonly where: string; readonly icon: IconName; readonly example: string }>> = {
  'd.analysis.checks': {
    where: 'صفحة مهمة Actions ← شرح سجل الفحص، الطبقة الثالثة',
    icon: 'list-checks',
    example: 'مثال: فشل build بخطأ TS2345؛ الاحتمال: قيمة قد تكون undefined تُمرَّر في bidi.ts السطر 42، والخطوة التالية: فحص الاستدعاء في التزام الرأس.',
  },
  'd.analysis.pr': {
    where: 'صفحة طلب الدمج ← ملخص حالة طلب الدمج',
    icon: 'explain',
    example: 'مثال: نقاط مراجعة مرتبة بالملفات، مع ما يحتاج تحققًا قبل الدمج.',
  },
  'd.analysis.issue': {
    where: 'صفحة المشكلة',
    icon: 'note',
    example: 'مثال: ملخص البلاغ وما ينقصه من معلومات، وخطوة تالية مقترحة.',
  },
};

const PLACES_CSS = `
.mj-root .guide .places { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.mj-root .guide .place { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--mijhar-space-12); align-items: start; padding: var(--mijhar-space-16); border-radius: 8px; background: var(--mijhar-bg-subtle); }
.mj-root .guide .place .icon { color: var(--mijhar-text-brand); margin-top: 4px; }
.mj-root .guide .place h3 { font-size: 14px; line-height: 22px; }
.mj-root .guide .place .where { color: var(--mijhar-text-brand); font-size: 12px; font-weight: 700; }
.mj-root .guide .place .example { color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; }
.mj-root .guide .possible { padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); border: 1px solid currentColor; background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); font-size: 11px; line-height: 20px; font-weight: 700; white-space: nowrap; }
@media (max-width: 640px) { .mj-root .guide .place { grid-template-columns: minmax(0, 1fr); } }
`;

export function ProviderKeyGuide({ onBack, onAdd, descriptors = PROVIDER_DESCRIPTORS }: ProviderKeyGuideProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'provider-key-guide', GUIDE_CSS + PLACES_CSS);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const places = CONNECTED_FEATURES.filter((f) => (f.requires as readonly string[]).includes('provider-key'));

  return (
    <article ref={ref} class="guide" data-guide="provider-key" aria-labelledby="mj-pk-guide-title">
      <nav class="crumbs" aria-label="مسار الصفحة">
        <button type="button" class="btn btn-ghost" data-action="guide-back" onClick={onBack}>
          <Icon name="arrow-right" />
          الاتصالات والصلاحيات
        </button>
        <span aria-hidden="true">/</span>
        <span aria-current="page">لماذا المفتاح؟</span>
      </nav>
      <header>
        <h1 id="mj-pk-guide-title" ref={title} tabIndex={-1}>
          لماذا مفتاح مزوّد التحليل؟
        </h1>
        <p class="lead">
          المفتاح اختياري. يضيف تحليلًا نصيًّا يقترحه نموذج من المزوّد الذي تختاره ({providerNames(descriptors)}) داخل الأقسام التي تعرفها، ولا يبدأ أي تحليل إلا حين
          تطلبه وتختار «إرسال للتحليل» بعد أن ترى ما سيُرسل.
        </p>
      </header>

      <section class="card" aria-labelledby="mj-pk-adds">
        <h2 id="mj-pk-adds">ما يضيفه، وأين تجده</h2>
        <ul class="places" data-places="">
          {places.map((feature) => {
            const place = PLACES[feature.id];
            return (
              <li class="place" key={feature.id} data-place={feature.id}>
                <Icon name={place?.icon ?? 'explain'} />
                <div>
                  <h3>{feature.title}</h3>
                  <p class="where">{place?.where ?? feature.section}</p>
                  <p class="example">{place?.example}</p>
                </div>
                <span class="possible">احتمال يحتاج تحققًا</span>
              </li>
            );
          })}
        </ul>
        <Note icon="info">يظهر الاقتراح في الطبقة الثالثة موسومًا «احتمال يحتاج تحققًا» مع أدلته وما نقص منها، ولا يحلّ محل حقيقة مقروءة من الصفحة.</Note>
      </section>

      <section class="card" aria-labelledby="mj-pk-sends">
        <h2 id="mj-pk-sends">ما يُرسل، ولمن، ومتى</h2>
        <ul class="ticks" data-sends="">
          <li data-send="destination">
            <Icon name="globe" />
            <span>
              الوجهة: مضيف المزوّد الذي اخترته وحده (
              {descriptors.map((d, i) => (
                <span key={d.id}>
                  {i > 0 ? ' أو ' : ''}
                  <Ltr className="mono">{d.host}</Ltr>
                </span>
              ))}
              )، مباشرة من خلفية الإضافة بلا أي وسيط وبمفتاحك لديه وحده؛ ولا يُرسل مفتاح مزوّد إلى غيره.
            </span>
          </li>
          <li data-send="content">
            <Icon name="shield" />
            <span>المحتوى: حزمة سياق تُبنى من الصفحة المفتوحة وتُنقَّح لاكتشاف الأسرار، وتراها مع حجمها وما استُبعد منها قبل الإرسال؛ راجعها للتأكد.</span>
          </li>
          <li data-send="consent">
            <Icon name="lock" />
            <span>لا يُرفق رمز GitHub بالطلب، ولا يُرسل شيء قبل أن تختار «إرسال للتحليل» بنفسك لكل طلب.</span>
          </li>
          <li data-send="key">
            <Icon name="key" />
            <span>المفتاح: لكل مزوّد مفتاحه، في ذاكرة الجلسة افتراضيًا أو على القرص غير مشفَّر باختيارك، ويُرسل إلى مزوّده وحده للمصادقة، ولا يظهر في سجل ولا برومبت ولا تصدير.</span>
          </li>
        </ul>
        <p class="muted small">لكل مزوّد سياسته في استعمال البيانات كما أعلنها في صفحته الرسمية، ولا يدّعي مِجهَر عنها ما لم يعلنه المزوّد:</p>
        <ul class="ticks" data-retention="">
          {descriptors.map((d) => (
            <li key={d.id} class="muted small" data-retention-provider={d.id}>
              <span>
                سياسة {d.title} المعلنة (قُرئت {d.policy.readOn} من{' '}
                <a href={d.policy.url} {...external}>
                  {d.policy.label}
                </a>
                ): {d.policy.summary}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section class="card" aria-labelledby="mj-pk-without">
        <h2 id="mj-pk-without">دون مفتاح</h2>
        <p>تبقى الأقسام كاملة بحالتها وأدلتها، و«جهّز حزمة السياق» تجمع السياق لتراجعه وتنسخه إلى أي نموذج تختاره.</p>
      </section>

      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="provider-key-add" onClick={onAdd}>
          أضف مفتاحًا
        </button>
        <button type="button" class="btn" data-action="guide-not-now" onClick={onBack}>
          ليس الآن
        </button>
      </div>
    </article>
  );
}
